import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/core";
import { handleApiError, parseBody } from "@/lib/api-route";
import { bookingCheckoutSchema } from "@/lib/validators";
import { requireSupabaseService } from "@/lib/api-helpers";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { assertRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import {
    getRazorpayKeyId,
    getRazorpayServerClient,
    isRazorpayConfigured,
    verifyRazorpayOrderSignature,
} from "@/lib/razorpay-server";
import type { SupabaseServerClient } from "@/lib/supabase-server";
import { ensureWorkshopSeededFromMock } from "@/lib/workshop-utils";
import { sendPaymentNotification } from "@/lib/payment-notifications";

const SERVICE_FEE = 99;
const PAYMENT_CURRENCY = "INR";
const PAYMENT_PROVIDER = "razorpay";

type HoldWithWorkshop = {
    id: string;
    workshop_id: string;
    user_id: string;
    guests: number;
    status: string;
    expires_at: string;
    workshop: {
        id: string;
        title: string;
        price: number;
        seats_remaining: number;
    } | null;
};

function toPaise(amountInRupees: number) {
    return Math.round(amountInRupees * 100);
}

function isExpired(isoDate: string) {
    return new Date(isoDate).getTime() < Date.now();
}

function paymentError(message: string, status: number, context: Record<string, unknown> = {}) {
    Sentry.captureMessage(message, {
        level: "error",
        tags: {
            layer: "payments",
            provider: "razorpay",
            route: "bookings_checkout",
        },
        extra: context,
    });

    return NextResponse.json(
        {
            error: message,
            ...context,
        },
        { status }
    );
}

async function loadBookingById(serviceClient: SupabaseServerClient, bookingId: string) {
    const { data: booking } = await serviceClient
        .from("bookings")
        .select(
            `
            id,
            user_id,
            guests,
            total,
            status,
            payment_intent_id,
            first_name,
            last_name,
            email,
            phone,
            created_at,
            workshop:workshops (
                id,
                title,
                date,
                time,
                location,
                city,
                cover_image
            )
        `
        )
        .eq("id", bookingId)
        .single();

    return booking;
}

async function sendConfirmedBookingNotification(
    booking: Awaited<ReturnType<typeof loadBookingById>>,
    context: { holdId: string; workshopId: string }
) {
    if (!booking || booking.status !== "confirmed") return;

    await sendPaymentNotification({
        event: "booking.confirmed",
        source: "bookings_checkout",
        idempotencyKey: `booking-confirmed:${booking.id}`,
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
            context,
        },
    });
}

export async function POST(request: NextRequest) {
    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    const rateLimitResult = await assertRateLimit({
        key: getRateLimitKey(request, "bookings-checkout", auth.user.id),
        limit: 30,
        windowMs: 60_000,
        message: "Too many checkout attempts. Please wait and retry.",
    });
    if (!rateLimitResult.ok) {
        return rateLimitResult.response;
    }

    const service = requireSupabaseService();
    if (!service.ok) return service.response;
    const serviceClient = service.client;

    if (!isRazorpayConfigured) {
        return NextResponse.json(
            {
                error: "Razorpay is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.",
            },
            { status: 500 }
        );
    }

    const parsed = await parseBody(
        request,
        bookingCheckoutSchema,
        "Invalid JSON payload.",
        "Booking checkout validation failed."
    );
    if (!parsed.ok) {
        return parsed.response;
    }

    const payload = parsed.data;
    const isPaymentConfirmation =
        Boolean(payload.razorpayOrderId) &&
        Boolean(payload.razorpayPaymentId) &&
        Boolean(payload.razorpaySignature);

    try {
        await ensureWorkshopSeededFromMock(serviceClient, payload.workshopId);

        const { data: holdData, error: holdError } = await serviceClient
            .from("booking_holds")
            .select(
                `
                id,
                workshop_id,
                user_id,
                guests,
                status,
                expires_at,
                workshop:workshops (
                    id,
                    title,
                    price,
                    seats_remaining
                )
            `
            )
            .eq("id", payload.holdId)
            .eq("workshop_id", payload.workshopId)
            .eq("user_id", auth.user.id)
            .single();

        const hold = holdData as HoldWithWorkshop | null;

        if (holdError || !hold) {
            return paymentError("Seat hold not found for this user/workshop.", 404, {
                userId: auth.user.id,
                holdId: payload.holdId,
                workshopId: payload.workshopId,
            });
        }

        if (hold.status !== "active") {
            return paymentError("This seat hold is no longer active.", 409, {
                userId: auth.user.id,
                holdId: payload.holdId,
                workshopId: payload.workshopId,
                holdStatus: hold.status,
            });
        }

        if (isExpired(hold.expires_at)) {
            await serviceClient
                .from("booking_holds")
                .update({ status: "expired" })
                .eq("id", hold.id);
            return paymentError("Seat hold expired. Please reserve seats again.", 409, {
                userId: auth.user.id,
                holdId: payload.holdId,
                workshopId: payload.workshopId,
            });
        }

        const workshop = hold.workshop;
        if (!workshop) {
            return paymentError("Workshop not found for this hold.", 404, {
                userId: auth.user.id,
                holdId: payload.holdId,
                workshopId: payload.workshopId,
            });
        }

        const subtotal = Number(workshop.price || 0) * Number(hold.guests || 0);
        const total = subtotal + SERVICE_FEE;
        const totalPaise = toPaise(total);

        const razorpay = getRazorpayServerClient();

        if (!isPaymentConfirmation) {
            const order = await razorpay.orders.create({
                amount: totalPaise,
                currency: PAYMENT_CURRENCY,
                receipt: payload.holdId,
                notes: {
                    holdId: payload.holdId,
                    workshopId: payload.workshopId,
                    userId: auth.user.id,
                },
            });

            return NextResponse.json({
                mode: "order_created",
                order: {
                    id: order.id,
                    amount: Number(order.amount || totalPaise),
                    currency: String(order.currency || PAYMENT_CURRENCY),
                    keyId: getRazorpayKeyId(),
                    name: "Only Workshop",
                    description: workshop.title,
                    prefill: {
                        name: `${payload.firstName} ${payload.lastName}`.trim(),
                        email: payload.email,
                        contact: payload.phone || undefined,
                    },
                },
                hold: {
                    id: hold.id,
                    guests: hold.guests,
                    expiresAt: hold.expires_at,
                },
            });
        }

        const signatureValid = verifyRazorpayOrderSignature({
            orderId: payload.razorpayOrderId!,
            paymentId: payload.razorpayPaymentId!,
            signature: payload.razorpaySignature!,
        });

        if (!signatureValid) {
            return paymentError("Invalid Razorpay payment signature.", 400, {
                userId: auth.user.id,
                holdId: payload.holdId,
                workshopId: payload.workshopId,
                razorpayOrderId: payload.razorpayOrderId,
                razorpayPaymentId: payload.razorpayPaymentId,
            });
        }

        const order = await razorpay.orders.fetch(payload.razorpayOrderId!);
        if (!order || order.id !== payload.razorpayOrderId) {
            return paymentError("Razorpay order not found.", 404, {
                userId: auth.user.id,
                holdId: payload.holdId,
                workshopId: payload.workshopId,
                razorpayOrderId: payload.razorpayOrderId,
            });
        }

        if (String(order.receipt || "") !== payload.holdId) {
            return paymentError("Order does not match the current seat hold.", 400, {
                userId: auth.user.id,
                holdId: payload.holdId,
                workshopId: payload.workshopId,
                razorpayOrderId: payload.razorpayOrderId,
            });
        }

        if (
            Number(order.amount || 0) !== totalPaise ||
            String(order.currency || "").toUpperCase() !== PAYMENT_CURRENCY
        ) {
            return paymentError("Order amount mismatch for this booking.", 400, {
                userId: auth.user.id,
                holdId: payload.holdId,
                workshopId: payload.workshopId,
                expectedAmount: totalPaise,
                actualAmount: Number(order.amount || 0),
                expectedCurrency: PAYMENT_CURRENCY,
                actualCurrency: String(order.currency || "").toUpperCase(),
            });
        }

        const payment = await razorpay.payments.fetch(payload.razorpayPaymentId!);
        if (!payment || payment.id !== payload.razorpayPaymentId) {
            return paymentError("Razorpay payment not found.", 404, {
                userId: auth.user.id,
                holdId: payload.holdId,
                workshopId: payload.workshopId,
                razorpayPaymentId: payload.razorpayPaymentId,
            });
        }

        if (payment.order_id !== payload.razorpayOrderId) {
            return paymentError("Payment does not belong to this order.", 400, {
                userId: auth.user.id,
                holdId: payload.holdId,
                workshopId: payload.workshopId,
                razorpayPaymentId: payload.razorpayPaymentId,
                razorpayOrderId: payload.razorpayOrderId,
            });
        }

        if (
            Number(payment.amount || 0) !== totalPaise ||
            String(payment.currency || "").toUpperCase() !== PAYMENT_CURRENCY
        ) {
            return paymentError("Payment amount mismatch for this booking.", 400, {
                userId: auth.user.id,
                holdId: payload.holdId,
                workshopId: payload.workshopId,
                expectedAmount: totalPaise,
                actualAmount: Number(payment.amount || 0),
                expectedCurrency: PAYMENT_CURRENCY,
                actualCurrency: String(payment.currency || "").toUpperCase(),
            });
        }

        let paymentStatus = String(payment.status || "").toLowerCase();
        if (paymentStatus === "authorized") {
            const captured = await razorpay.payments.capture(
                payload.razorpayPaymentId!,
                totalPaise,
                PAYMENT_CURRENCY
            );
            paymentStatus = String(captured.status || "").toLowerCase();
        }

        if (paymentStatus !== "captured") {
            return paymentError("Payment is not captured yet.", 402, {
                userId: auth.user.id,
                holdId: payload.holdId,
                workshopId: payload.workshopId,
                razorpayPaymentId: payload.razorpayPaymentId,
                paymentStatus,
            });
        }

        const { data: existingBooking } = await serviceClient
            .from("bookings")
            .select("id")
            .eq("payment_intent_id", payload.razorpayPaymentId!)
            .maybeSingle();

        if (existingBooking?.id) {
            const booking = await loadBookingById(serviceClient, existingBooking.id);
            await sendConfirmedBookingNotification(booking, {
                holdId: payload.holdId,
                workshopId: payload.workshopId,
            });
            return NextResponse.json({
                mode: "already_confirmed",
                booking,
                paymentId: payload.razorpayPaymentId,
                paymentStatus,
            });
        }

        let bookingId: string | null = null;
        const { data: rpcBookingId, error: rpcError } = await serviceClient.rpc(
            "confirm_booking_from_hold",
            {
                p_hold_id: payload.holdId,
                p_user_id: auth.user.id,
                p_workshop_id: payload.workshopId,
                p_payment_provider: PAYMENT_PROVIDER,
                p_payment_intent_id: payload.razorpayPaymentId!,
                p_first_name: payload.firstName,
                p_last_name: payload.lastName,
                p_email: payload.email,
                p_phone: payload.phone || null,
                p_notes: payload.notes || null,
                p_service_fee: SERVICE_FEE,
            }
        );

        if (!rpcError && typeof rpcBookingId === "string") {
            bookingId = rpcBookingId;
        }

        if (!bookingId) {
            // Fallback path if RPC migration has not been applied.
            const { data: seatUpdated, error: seatUpdateError } = await serviceClient
                .from("workshops")
                .update({
                    seats_remaining: Math.max(
                        0,
                        Number(hold.workshop?.seats_remaining || 0) - Number(hold.guests || 0)
                    ),
                })
                .eq("id", payload.workshopId)
                .gte("seats_remaining", Number(hold.guests || 0))
                .select("id")
                .single();

            if (seatUpdateError || !seatUpdated) {
                return paymentError(
                    "Payment succeeded, but seat reservation failed. Contact support immediately.",
                    500,
                    {
                        userId: auth.user.id,
                        holdId: payload.holdId,
                        workshopId: payload.workshopId,
                        paymentId: payload.razorpayPaymentId,
                        details: seatUpdateError?.message || rpcError?.message || null,
                    }
                );
            }

            const { data: insertedBooking, error: bookingError } = await serviceClient
                .from("bookings")
                .insert({
                    user_id: auth.user.id,
                    workshop_id: payload.workshopId,
                    hold_id: payload.holdId,
                    guests: hold.guests,
                    subtotal,
                    service_fee: SERVICE_FEE,
                    total,
                    status: "confirmed",
                    payment_provider: PAYMENT_PROVIDER,
                    payment_intent_id: payload.razorpayPaymentId!,
                    first_name: payload.firstName,
                    last_name: payload.lastName,
                    email: payload.email,
                    phone: payload.phone || null,
                    notes: payload.notes || null,
                })
                .select("id")
                .single();

            if (bookingError || !insertedBooking?.id) {
                return paymentError(
                    "Payment succeeded, but booking write failed. Contact support immediately.",
                    500,
                    {
                        userId: auth.user.id,
                        holdId: payload.holdId,
                        workshopId: payload.workshopId,
                        paymentId: payload.razorpayPaymentId,
                        details: bookingError?.message || null,
                    }
                );
            }

            await serviceClient
                .from("booking_holds")
                .update({ status: "confirmed" })
                .eq("id", payload.holdId);

            bookingId = insertedBooking.id;
        }

        if (!bookingId) {
            return paymentError("Booking confirmation failed after payment capture.", 500, {
                userId: auth.user.id,
                holdId: payload.holdId,
                workshopId: payload.workshopId,
                paymentId: payload.razorpayPaymentId,
            });
        }

        const booking = await loadBookingById(serviceClient, bookingId);
        await sendConfirmedBookingNotification(booking, {
            holdId: payload.holdId,
            workshopId: payload.workshopId,
        });

        return NextResponse.json({
            mode: "confirmed",
            booking,
            paymentId: payload.razorpayPaymentId,
            paymentStatus,
        });
    } catch (error) {
        Sentry.captureException(error, {
            tags: {
                layer: "payments",
                provider: "razorpay",
                route: "bookings_checkout",
            },
            extra: {
                userId: auth.user.id,
                holdId: payload.holdId,
                workshopId: payload.workshopId,
                razorpayOrderId: payload.razorpayOrderId ?? null,
                razorpayPaymentId: payload.razorpayPaymentId ?? null,
            },
        });
        return handleApiError("Checkout failed.", error);
    }
}
