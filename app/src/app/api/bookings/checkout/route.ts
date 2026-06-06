import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
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
import { sendPaymentNotification } from "@/lib/payment-notifications";
import { BOOKING_CUTOFF_HOURS, isBookingClosedNow } from "@/lib/booking-time";
import {
    getWorkshopApprovalStatus,
    isMissingApprovalStatusColumnError,
} from "@/lib/workshop-approval-compat";

// Removed hardcoded SERVICE_FEE
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
        category?: string | null;
        price: number;
        seats_remaining: number;
        approval_status?: "pending" | "approved" | "rejected" | null;
        date?: string | null;
        time?: string | null;
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

async function loadHoldWithWorkshop(
    serviceClient: SupabaseServerClient,
    holdId: string,
    workshopId: string,
    userId: string
) {
    const primary = await serviceClient
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
                    category,
                    price,
                    seats_remaining,
                    approval_status,
                    date,
                    time
                )
            `
        )
        .eq("id", holdId)
        .eq("workshop_id", workshopId)
        .eq("user_id", userId)
        .single();

    if (!primary.error || !isMissingApprovalStatusColumnError(primary.error)) {
        return {
            data: primary.data as HoldWithWorkshop | null,
            error: primary.error,
        };
    }

    const fallback = await serviceClient
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
                    category,
                    price,
                    seats_remaining,
                    date,
                    time
                )
            `
        )
        .eq("id", holdId)
        .eq("workshop_id", workshopId)
        .eq("user_id", userId)
        .single();

    const fallbackHold = fallback.data as HoldWithWorkshop | null;

    return {
        data:
            fallbackHold && fallbackHold.workshop
                ? {
                      ...fallbackHold,
                      workshop: {
                          ...fallbackHold.workshop,
                          approval_status: "approved",
                      },
                  }
                : fallbackHold,
        error: fallback.error,
    };
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
        const { data: holdData, error: holdError } = await loadHoldWithWorkshop(
            serviceClient,
            payload.holdId,
            payload.workshopId,
            auth.user.id
        );

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
        if (getWorkshopApprovalStatus(workshop.approval_status) !== "approved") {
            return paymentError("This workshop is not open for bookings yet.", 409, {
                userId: auth.user.id,
                holdId: payload.holdId,
                workshopId: payload.workshopId,
                code: "WORKSHOP_PENDING_APPROVAL",
            });
        }

        if (workshop.date && isBookingClosedNow(workshop.date, workshop.time)) {
            return paymentError("Bookings close 3 hours before the workshop starts.", 409, {
                userId: auth.user.id,
                holdId: payload.holdId,
                workshopId: payload.workshopId,
                code: "BOOKING_CLOSED",
                cutoffHours: BOOKING_CUTOFF_HOURS,
            });
        }

        const pricePerGuest = Math.max(0, Number(workshop.price || 0));
        const subtotalOriginal = pricePerGuest * Number(hold.guests || 0);

        let discountAmount = 0;
        let appliedCouponId: string | null = null;

        if (payload.couponCode) {
            const code = payload.couponCode.toUpperCase();
            const { data: coupon } = await serviceClient
                .from("coupons")
                .select("*")
                .eq("code", code)
                .eq("is_active", true)
                .single();

            if (coupon) {
                const now = new Date();
                const validTime =
                    (!coupon.valid_from || new Date(coupon.valid_from) <= now) &&
                    (!coupon.valid_until || new Date(coupon.valid_until) >= now);
                const validUses =
                    coupon.max_uses === null || (coupon.used_count || 0) < coupon.max_uses;
                const validMinimum =
                    !coupon.min_order_amount || subtotalOriginal >= coupon.min_order_amount;
                const validWorkshop =
                    !Array.isArray(coupon.applicable_workshop_ids) ||
                    coupon.applicable_workshop_ids.length === 0 ||
                    coupon.applicable_workshop_ids.includes(payload.workshopId);
                const validCategory =
                    !Array.isArray(coupon.applicable_categories) ||
                    coupon.applicable_categories.length === 0 ||
                    Boolean(
                        workshop.category && coupon.applicable_categories.includes(workshop.category)
                    );

                if (validTime && validUses && validMinimum && validWorkshop && validCategory) {
                    appliedCouponId = coupon.id;
                    const rawDiscount =
                        coupon.discount_type === "percentage"
                            ? subtotalOriginal * (coupon.discount_value / 100)
                            : coupon.discount_value;
                    discountAmount = Math.min(
                        subtotalOriginal,
                        Math.max(0, Math.round(rawDiscount))
                    );
                }
            }
        }

        // Fetch dynamic service fee
        let serviceFee = 99; // Fallback
        const { data: settings } = await serviceClient
            .from("platform_settings")
            .select("setting_value")
            .eq("setting_key", "service_fee")
            .single();

        if (settings?.setting_value !== undefined) {
            const parsed = parseFloat(String(settings.setting_value));
            if (!isNaN(parsed)) serviceFee = Math.max(0, Math.round(parsed));
        }

        const subtotal = Math.max(0, subtotalOriginal - discountAmount);
        const total = subtotal + serviceFee;
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
                    name: "Only Workshops",
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
                p_phone: payload.phone,
                p_notes: payload.notes,
                p_service_fee: serviceFee,
                p_subtotal: subtotal,
                p_total: total,
                p_coupon_id: appliedCouponId,
                p_discount_applied: discountAmount,
            }
        );

        if (!rpcError && typeof rpcBookingId === "string") {
            bookingId = rpcBookingId;
        }

        if (!bookingId) {
            return paymentError(
                "Payment succeeded, but atomic booking confirmation failed. Contact support immediately.",
                500,
                {
                    userId: auth.user.id,
                    holdId: payload.holdId,
                    workshopId: payload.workshopId,
                    paymentId: payload.razorpayPaymentId,
                    couponId: appliedCouponId,
                    details: rpcError?.message || null,
                }
            );
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
