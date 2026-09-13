import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createHash } from "crypto";
import { requireSupabaseService } from "@/lib/api-helpers";
import { jsonError } from "@/lib/api-auth";
import { getRequestId } from "@/lib/api-route";
import { claimIdempotencyKey, releaseIdempotencyKey } from "@/lib/idempotency";
import { revalidatePath } from "next/cache";
import { verifyRazorpayWebhookSignature } from "@/lib/razorpay-server";
import { sendPaymentNotification } from "@/lib/payment-notifications";
import type { SupabaseServerClient } from "@/lib/supabase-server";

type RazorpayWebhookPayload = {
    event?: string;
    payload?: {
        payment?: {
            entity?: {
                id?: string;
                /** Paise. Present on payment.* events. */
                amount?: number;
                /** Paise already refunded against this payment. */
                amount_refunded?: number;
                /** Unix seconds. Used to stop retrying a capture whose booking never came. */
                created_at?: number;
            };
        };
        refund?: {
            entity?: {
                payment_id?: string;
                /** Paise refunded by THIS refund event. */
                amount?: number;
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

/**
 * Statuses a late-arriving `payment.captured` or `payment.failed` must never overwrite.
 *
 * Razorpay does not guarantee ordering and retries a failed delivery for up to 24 hours,
 * so a delayed capture can land after a refund. Writing the status unconditionally
 * resurrected refunded bookings whose seats had already gone back into inventory, then
 * re-credited the host and re-sent the confirmation email.
 */
const TERMINAL_BOOKING_STATUSES = ["refunded", "cancelled"] as const;
const TERMINAL_BOOKING_STATUS_FILTER = `(${TERMINAL_BOOKING_STATUSES.join(",")})`;

/**
 * How long a `payment.captured` may go without a booking row before we stop asking Razorpay
 * to redeliver it.
 *
 * Checkout captures and THEN inserts the booking, so a capture webhook routinely overtakes
 * its own booking by a few hundred milliseconds; that window deserves a retry. But a capture
 * that checkout compensated (refunded) has no booking and never will, and answering those
 * with 503 would burn Razorpay's full 24h retry schedule on an event nothing can act on.
 * Seat holds live 15 minutes, so nothing legitimate is still mid-checkout after 30.
 */
const CAPTURE_WITHOUT_BOOKING_RETRY_WINDOW_MS = 30 * 60 * 1000;

function isWithinCaptureRetryWindow(paymentCreatedAtSeconds: unknown) {
    // The payload is JSON.parse output; the `created_at?: number` annotation is compile-time
    // only. Number.isFinite does not coerce, so Razorpay quoting the value would reject a
    // perfectly good timestamp and pin every delivery into the retry branch for the full 24h
    // schedule. Coerce before testing.
    const seconds = Number(paymentCreatedAtSeconds);

    if (!Number.isFinite(seconds) || seconds <= 0) {
        // No timestamp to reason about: prefer the retry, since dropping a capture silently
        // is what costs the host their payout.
        return true;
    }

    return Date.now() - seconds * 1000 < CAPTURE_WITHOUT_BOOKING_RETRY_WINDOW_MS;
}

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

        // The host's share is workshop revenue only. Falling back to `total` folded the
        // platform service fee into the payout, so a fully discounted booking paid the host
        // out of the platform's own fee.
        const hostGross = Math.max(0, Number(booking.subtotal ?? 0));
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

/**
 * Reverse host credit when a booking is refunded.
 *
 * Earnings were credited at capture and never reversed, so /api/admin/payouts summed
 * refunded bookings into the next payout and real cash left the business for orders that
 * had been returned. Rows already paid out are left intact and reported instead: that is
 * a clawback for a human to handle, and silently zeroing a paid row would hide it.
 */
async function reverseHostEarningsForBookings(
    serviceClient: SupabaseServerClient,
    bookings: BookingNotificationRow[]
) {
    for (const booking of bookings) {
        const { data: earning, error: readError } = await serviceClient
            .from("host_earnings")
            .select("id, status")
            .eq("booking_id", booking.id)
            .maybeSingle();

        if (readError || !earning) {
            continue;
        }

        if (earning.status === "paid") {
            Sentry.captureMessage(
                "Refund on an already paid-out host earning; manual clawback required.",
                {
                    level: "error",
                    tags: { layer: "payments", subsystem: "host_earnings_reversal" },
                    extra: { bookingId: booking.id, earningId: earning.id },
                }
            );
            continue;
        }

        const { error: reverseError } = await serviceClient
            .from("host_earnings")
            .update({ amount: 0, fee_deducted: 0, status: "pending" })
            .eq("id", earning.id)
            .neq("status", "paid");

        if (reverseError) {
            Sentry.captureException(reverseError, {
                tags: { layer: "payments", subsystem: "host_earnings_reversal" },
                extra: { bookingId: booking.id, earningId: earning.id },
            });
        }
    }
}

/**
 * Throws on a query failure rather than reporting an empty result.
 *
 * supabase-js returns errors in `error` instead of throwing, so dropping it made a degraded
 * PostgREST indistinguishable from "this payment has no booking" -- and the capture branch
 * now makes a decision on exactly that distinction. Swallowed there, it would ACK a capture
 * whose booking existed all along and burn the idempotency key for good.
 */
async function loadBookingsByPaymentId(
    serviceClient: SupabaseServerClient,
    paymentIntentId: string
) {
    const { data: bookingRows, error: bookingRowsError } = await serviceClient
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

    if (bookingRowsError) {
        throw bookingRowsError;
    }

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
    // Same reason as checkout: a payment that goes wrong has to be traceable from one id
    // across the Vercel log line, the Sentry event and Razorpay's own event id.
    Sentry.setTag("request_id", getRequestId(request));

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

    let claimed: boolean;
    try {
        claimed = await claimIdempotencyKey(
            "razorpay-webhook",
            idempotencyKey,
            24 * 60 * 60 * 1000
        );
    } catch (error) {
        // The durable dedup store is unreachable. Processing now risks double-crediting a
        // payment, so decline and let Razorpay retry.
        Sentry.captureException(error, {
            tags: { layer: "payments", provider: "razorpay", subsystem: "idempotency" },
            extra: { event: event.event || null },
        });
        return jsonError("Idempotency store unavailable; retry later.", 503);
    }

    if (!claimed) {
        return NextResponse.json({ received: true, duplicate: true });
    }

    const service = requireSupabaseService();
    if (!service.ok) {
        // The key is already claimed, so ACKing here would burn the event permanently: the
        // retry short-circuits as a duplicate and the capture is never recorded. Give it back
        // and let Razorpay redeliver once the service role is configured again.
        await releaseIdempotencyKey("razorpay-webhook", idempotencyKey);
        return service.response;
    }

    try {
        const serviceClient = service.client;

        const paymentId = event.payload?.payment?.entity?.id;
        const refundPaymentId = event.payload?.refund?.entity?.payment_id;

        if (event.event === "payment.captured" && paymentId) {
            await serviceClient
                .from("bookings")
                .update({ status: "confirmed" })
                .eq("payment_intent_id", paymentId)
                .not("status", "in", TERMINAL_BOOKING_STATUS_FILTER);

            const confirmedBookings = await loadBookingsByPaymentId(serviceClient, paymentId);

            // Checkout captures before it inserts, so this event can legitimately arrive
            // before the booking exists. Claiming the idempotency key and ACKing anyway
            // meant the retry was discarded as a duplicate and the row that eventually
            // appeared never got its host_earnings credit or confirmation email -- the
            // host stayed permanently short-paid and the customer never got their mail.
            if (!confirmedBookings.length) {
                const paymentCreatedAt = event.payload?.payment?.entity?.created_at;

                if (isWithinCaptureRetryWindow(paymentCreatedAt)) {
                    await releaseIdempotencyKey("razorpay-webhook", idempotencyKey);
                    return jsonError("Booking not persisted yet; retry later.", 503);
                }

                Sentry.captureMessage(
                    "Razorpay payment.captured has no booking after the retry window; capture may be stranded.",
                    {
                        level: "error",
                        tags: {
                            layer: "payments",
                            provider: "razorpay",
                            route: "razorpay_webhook",
                            action: "capture_without_booking",
                        },
                        extra: { paymentId, paymentCreatedAt: paymentCreatedAt ?? null },
                    }
                );

                // No side effects ran on this path, and the 200 is what stops Razorpay
                // retrying. Holding the claim as well would make the event unreplayable:
                // claimInDatabase writes a permanent row (the 24h TTL reaches only the
                // in-memory store), so an operator who fixed the cause later could never
                // redeliver it.
                await releaseIdempotencyKey("razorpay-webhook", idempotencyKey);
                return NextResponse.json({ received: true, bookingMissing: true });
            }

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
            // A booking row only ever exists because checkout captured the payment and
            // confirm_booking_from_hold inserted it as `confirmed`; there is no pending
            // row for a failure to clean up. Razorpay neither orders nor deduplicates its
            // retries, so a `payment.failed` for an earlier attempt on the same payment id
            // could arrive AFTER the capture that succeeded. Excluding only refunded and
            // cancelled let that event flip a paid, seated booking to `cancelled` --
            // without returning the seat, reversing the host's credit or refunding anyone.
            //
            // Scoped to `pending` so it stays a no-op today and does the right thing on its
            // own if a pre-capture booking status is ever introduced.
            await serviceClient
                .from("bookings")
                .update({ status: "cancelled" })
                .eq("payment_intent_id", paymentId)
                .eq("status", "pending");
        }

        if (event.event === "refund.processed" && refundPaymentId) {
            // A PARTIAL refund must not mark the whole booking refunded. Razorpay reports
            // the amount refunded by this event and the running total on the payment;
            // only a full refund changes booking status and returns seats.
            const refundedPaise = Number(event.payload?.refund?.entity?.amount ?? 0);
            const paymentPaise = Number(event.payload?.payment?.entity?.amount ?? 0);
            const totalRefundedPaise = Number(
                event.payload?.payment?.entity?.amount_refunded ?? refundedPaise
            );
            const isFullRefund =
                paymentPaise > 0 ? totalRefundedPaise >= paymentPaise : refundedPaise > 0;

            const bookingsForPayment = await loadBookingsByPaymentId(
                serviceClient,
                refundPaymentId
            );

            if (!isFullRefund) {
                Sentry.captureMessage("Partial Razorpay refund recorded; booking left intact.", {
                    level: "info",
                    tags: { layer: "payments", provider: "razorpay" },
                    extra: {
                        refundPaymentId,
                        refundedPaise,
                        paymentPaise,
                        totalRefundedPaise,
                    },
                });
            } else {
                // Only seats for bookings that were actually holding inventory come back.
                const seatsToRestore = bookingsForPayment.filter(
                    (booking) => booking.status === "confirmed"
                );

                await serviceClient
                    .from("bookings")
                    .update({ status: "refunded" })
                    .eq("payment_intent_id", refundPaymentId);

                // Host credit comes back out before seats go back in, so a payout run
                // racing this handler cannot catch the window where the booking reads
                // refunded but the earning is still 'available'.
                await reverseHostEarningsForBookings(serviceClient, seatsToRestore);

                // Seats were decremented at confirmation and were never given back, so every
                // refund permanently destroyed inventory. Restore them relatively (never as an
                // absolute write) so concurrent bookings are not clobbered.
                await Promise.all(
                    seatsToRestore.map(async (booking) => {
                        const seats = Number(booking.guests || 0);
                        if (!booking.workshop_id || seats < 1) return;

                        const { error: restoreError } = await serviceClient.rpc(
                            "restore_workshop_seats",
                            {
                                p_workshop_id: booking.workshop_id,
                                p_seats: seats,
                            }
                        );

                        if (restoreError) {
                            Sentry.captureException(restoreError, {
                                tags: { layer: "payments", subsystem: "seat_restore" },
                                extra: { bookingId: booking.id, seats },
                            });
                            return;
                        }

                        revalidatePath(`/workshop/${booking.workshop_id}`);
                        revalidatePath("/explore");
                    })
                );

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

        // The key was claimed before any work was done. Leaving it claimed after a failure
        // meant one transient error discarded the event forever: Razorpay's retry would
        // short-circuit as a duplicate. Release it and ask for the retry explicitly.
        await releaseIdempotencyKey("razorpay-webhook", idempotencyKey);
        return jsonError("Webhook processing failed; retry later.", 500);
    }

    return NextResponse.json({ received: true });
}
