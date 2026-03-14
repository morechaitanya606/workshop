import { NextResponse } from "next/server";
import * as Sentry from "@sentry/core";
import { createHash } from "crypto";
import { requireSupabaseService } from "@/lib/api-helpers";
import { jsonError } from "@/lib/api-auth";
import { claimIdempotencyKey } from "@/lib/idempotency";
import { verifyRazorpayWebhookSignature } from "@/lib/razorpay-server";
import { sendPaymentNotification } from "@/lib/payment-notifications";
import type { SupabaseServerClient } from "@/lib/supabase-server";

type RazorpayWebhookPayload = {
    event?: string;
    payload?: {
        payment?: {
            entity?: {
                id?: string;
            };
        };
        refund?: {
            entity?: {
                payment_id?: string;
            };
        };
    };
};

type BookingNotificationRow = {
    id: string;
    user_id: string;
    workshop_id: string;
    guests: number;
    subtotal: number;
    total: number;
    status: "confirmed" | "cancelled" | "refunded";
    payment_intent_id: string | null;
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
    created_at: string;
    workshop: {
        id: string;
        title: string;
        date: string;
        time: string;
        location: string;
        city: string;
        host_id: string | null;
    } | null;
};

const HOST_PLATFORM_FEE_PERCENT = 0.1;

function roundCurrency(value: number) {
    return Math.round(value * 100) / 100;
}

async function upsertHostEarningsForBookings(
    serviceClient: SupabaseServerClient,
    bookings: BookingNotificationRow[]
) {
    for (const booking of bookings) {
        if (!booking.workshop?.host_id) {
            continue;
        }

        const hostGross = Math.max(0, Number(booking.subtotal || booking.total || 0));
        const feeDeducted = roundCurrency(hostGross * HOST_PLATFORM_FEE_PERCENT);
        const netAmount = roundCurrency(Math.max(0, hostGross - feeDeducted));

        const { error } = await serviceClient.from("host_earnings").upsert(
            {
                host_id: booking.workshop.host_id,
                booking_id: booking.id,
                amount: netAmount,
                fee_deducted: feeDeducted,
                status: "available",
            },
            { onConflict: "booking_id" }
        );

        if (error) {
            Sentry.captureException(error, {
                tags: {
                    layer: "payments",
                    provider: "razorpay",
                    route: "razorpay_webhook",
                    action: "host_earnings_upsert",
                },
                extra: {
                    bookingId: booking.id,
                    hostId: booking.workshop.host_id,
                    grossAmount: hostGross,
                    feeDeducted,
                    netAmount,
                },
            });
        }
    }
}

async function loadBookingsByPaymentId(
    serviceClient: SupabaseServerClient,
    paymentIntentId: string
) {
    const { data: bookingRows } = await serviceClient
        .from("bookings")
        .select(
            `
            id,
            user_id,
            workshop_id,
            guests,
            subtotal,
            total,
            status,
            payment_intent_id,
            first_name,
            last_name,
            email,
            phone,
            created_at
        `
        )
        .eq("payment_intent_id", paymentIntentId);

    const rows = (bookingRows || []) as Array<{
        id: string;
        user_id: string;
        workshop_id: string;
        guests: number;
        subtotal: number;
        total: number;
        status: "confirmed" | "cancelled" | "refunded";
        payment_intent_id: string | null;
        first_name: string;
        last_name: string;
        email: string;
        phone: string | null;
        created_at: string;
    }>;

    if (!rows.length) {
        return [] as BookingNotificationRow[];
    }

    const workshopIds = Array.from(new Set(rows.map((row) => row.workshop_id).filter(Boolean)));
    const { data: workshopRows } = await serviceClient
        .from("workshops")
        .select("id, title, date, time, location, city, host_id")
        .in("id", workshopIds);

    const workshopById = new Map(
        (workshopRows || []).map((workshop) => [
            workshop.id,
            {
                id: workshop.id,
                title: workshop.title,
                date: workshop.date,
                time: workshop.time,
                location: workshop.location,
                city: workshop.city,
                host_id: workshop.host_id,
            },
        ])
    );

    return rows.map((row) => ({
        ...row,
        workshop: workshopById.get(row.workshop_id) || null,
    })) as BookingNotificationRow[];
}

async function notifyBookingStatusTransitions(
    eventName: "booking.confirmed" | "booking.refunded",
    bookings: BookingNotificationRow[],
    paymentIntentId: string,
    webhookEvent: string | undefined
) {
    if (!bookings.length) return;

    await Promise.all(
        bookings.map((booking) =>
            sendPaymentNotification({
                event: eventName,
                source: "razorpay_webhook",
                idempotencyKey: `${eventName.replace(".", "-")}:${booking.id}`,
                data: {
                    booking: {
                        id: booking.id,
                        userId: booking.user_id,
                        status: booking.status,
                        guests: booking.guests,
                        total: booking.total,
                        paymentIntentId: booking.payment_intent_id,
                        createdAt: booking.created_at,
                        customer: {
                            firstName: booking.first_name,
                            lastName: booking.last_name,
                            email: booking.email,
                            phone: booking.phone,
                        },
                        workshop: booking.workshop || null,
                    },
                    context: {
                        webhookEvent: webhookEvent || null,
                        paymentIntentId,
                    },
                },
            })
        )
    );
}

function buildWebhookIdempotencyKey(
    payload: RazorpayWebhookPayload,
    rawBody: string,
    explicitEventId: string | null
) {
    if (explicitEventId) return explicitEventId;

    const paymentId = payload.payload?.payment?.entity?.id;
    const refundPaymentId = payload.payload?.refund?.entity?.payment_id;
    if (payload.event && paymentId) {
        return `${payload.event}:${paymentId}`;
    }
    if (payload.event && refundPaymentId) {
        return `${payload.event}:${refundPaymentId}`;
    }

    const hash = createHash("sha256").update(rawBody).digest("hex");
    return `${payload.event || "unknown"}:${hash}`;
}

export async function POST(request: Request) {
    const signature = request.headers.get("x-razorpay-signature");
    if (!signature) {
        return jsonError("Missing Razorpay webhook signature header.", 400);
    }

    const rawBody = await request.text();

    try {
        const isValid = verifyRazorpayWebhookSignature({ rawBody, signature });
        if (!isValid) {
            return jsonError("Invalid Razorpay webhook signature.", 400);
        }
    } catch (error) {
        return jsonError("Webhook secret is not configured.", 500, String(error));
    }

    let event: RazorpayWebhookPayload;
    try {
        event = JSON.parse(rawBody) as RazorpayWebhookPayload;
    } catch {
        return jsonError("Invalid JSON webhook payload.", 400);
    }

    const webhookEventId = request.headers.get("x-razorpay-event-id");
    const idempotencyKey = buildWebhookIdempotencyKey(event, rawBody, webhookEventId);

    const claimed = claimIdempotencyKey("razorpay-webhook", idempotencyKey, 24 * 60 * 60 * 1000);
    if (!claimed) {
        return NextResponse.json({ received: true, duplicate: true });
    }

    const service = requireSupabaseService();
    if (service.ok) {
        try {
            const serviceClient = service.client;

            const paymentId = event.payload?.payment?.entity?.id;
            const refundPaymentId = event.payload?.refund?.entity?.payment_id;

            if (event.event === "payment.captured" && paymentId) {
                await serviceClient
                    .from("bookings")
                    .update({ status: "confirmed" })
                    .eq("payment_intent_id", paymentId);

                const confirmedBookings = await loadBookingsByPaymentId(serviceClient, paymentId);
                const freshlyConfirmedBookings = confirmedBookings.filter(
                    (booking) => booking.status === "confirmed"
                );

                await notifyBookingStatusTransitions(
                    "booking.confirmed",
                    freshlyConfirmedBookings,
                    paymentId,
                    event.event
                );

                await upsertHostEarningsForBookings(serviceClient, freshlyConfirmedBookings);

                const { sendBookingConfirmation } = await import("@/lib/email");
                await Promise.all(
                    freshlyConfirmedBookings.map((booking) =>
                        sendBookingConfirmation(booking.id).catch((error) => {
                            Sentry.captureException(error, {
                                tags: {
                                    layer: "payments",
                                    provider: "razorpay",
                                    route: "razorpay_webhook",
                                    action: "booking_confirmation_email",
                                },
                                extra: {
                                    bookingId: booking.id,
                                },
                            });
                        })
                    )
                );
            }

            if (event.event === "payment.failed" && paymentId) {
                await serviceClient
                    .from("bookings")
                    .update({ status: "cancelled" })
                    .eq("payment_intent_id", paymentId);
            }

            if (event.event === "refund.processed" && refundPaymentId) {
                await serviceClient
                    .from("bookings")
                    .update({ status: "refunded" })
                    .eq("payment_intent_id", refundPaymentId);

                const refundedBookings = await loadBookingsByPaymentId(
                    serviceClient,
                    refundPaymentId
                );
                await notifyBookingStatusTransitions(
                    "booking.refunded",
                    refundedBookings.filter((booking) => booking.status === "refunded"),
                    refundPaymentId,
                    event.event
                );
            }
        } catch (error) {
            Sentry.captureException(error, {
                tags: {
                    layer: "payments",
                    provider: "razorpay",
                    route: "razorpay_webhook",
                },
                extra: {
                    event: event.event || null,
                    paymentId: event.payload?.payment?.entity?.id || null,
                    refundPaymentId: event.payload?.refund?.entity?.payment_id || null,
                },
            });
            // Ack webhook even when post-processing fails to avoid retries storm.
        }
    }

    return NextResponse.json({ received: true });
}
