import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { getRequestId, handleApiError, parseBody } from "@/lib/api-route";
import { bookingCheckoutSchema } from "@/lib/validators";
import { requireSupabaseService } from "@/lib/api-helpers";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { assertRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import {
    getRazorpayKeyId,
    getRazorpayServerClient,
    isRazorpayConfigured,
    verifyRazorpayOrderSignature,
    withRazorpayTimeout,
} from "@/lib/razorpay-server";
import type { SupabaseServerClient } from "@/lib/supabase-server";
import { sendPaymentNotification } from "@/lib/payment-notifications";
import {
    BOOKING_CUTOFF_HOURS,
    computeEarlyBirdDiscount,
    isBookingClosedNow,
} from "@/lib/booking-time";
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
        created_at?: string | null;
        early_bird_enabled?: boolean | null;
        early_bird_discount_type?: string | null;
        early_bird_discount_value?: number | null;
        early_bird_days_after_listing?: number | null;
    } | null;
};

function toPaise(amountInRupees: number) {
    return Math.round(amountInRupees * 100);
}

function isExpired(isoDate: string) {
    return new Date(isoDate).getTime() < Date.now();
}

/**
 * Client-safe keys from a payment error context.
 *
 * The context is built for Sentry and carries `userId`, `holdId`, `razorpayPaymentId`,
 * raw Postgres/RPC text and similar. Spreading the whole thing into the response body
 * handed every caller a map of the money path plus another customer's identifiers on a
 * guessed hold id. Only the stable machine-readable code and the fields the booking UI
 * actually renders cross the boundary.
 */
const CLIENT_SAFE_PAYMENT_ERROR_KEYS = ["code", "cutoffHours"] as const;

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

    const clientSafeContext: Record<string, unknown> = {};
    for (const key of CLIENT_SAFE_PAYMENT_ERROR_KEYS) {
        if (context[key] !== undefined) {
            clientSafeContext[key] = context[key];
        }
    }

    return NextResponse.json(
        {
            error: message,
            ...clientSafeContext,
        },
        { status }
    );
}

function getErrorMessage(error: unknown) {
    if (!error) return null;
    if (typeof error === "string") return error;
    if (typeof error === "object" && "message" in error) {
        const message = String((error as { message?: unknown }).message || "").trim();
        return message || null;
    }
    return String(error);
}

function getErrorCode(error: unknown) {
    if (!error || typeof error !== "object" || !("code" in error)) return null;
    const code = String((error as { code?: unknown }).code || "").trim();
    return code || null;
}

function isMissingExtendedConfirmBookingRpc(error: unknown) {
    const message = (getErrorMessage(error) || "").toLowerCase();
    const code = getErrorCode(error);

    return (
        code === "PGRST202" ||
        (message.includes("confirm_booking_from_hold") &&
            (message.includes("schema cache") ||
                message.includes("could not find the function") ||
                message.includes("p_coupon_id") ||
                message.includes("p_discount_applied")))
    );
}

async function loadBookingById(serviceClient: SupabaseServerClient, bookingId: string) {
    const { data: booking, error: bookingError } = await serviceClient
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

    if (bookingError) {
        throw bookingError;
    }

    return booking;
}

async function loadExistingConfirmedBookingForPayment(
    serviceClient: SupabaseServerClient,
    params: {
        userId: string;
        workshopId: string;
        holdId: string;
        paymentId: string;
    }
) {
    const { data: existingBooking, error: existingBookingError } = await serviceClient
        .from("bookings")
        .select("id")
        .eq("payment_intent_id", params.paymentId)
        .eq("user_id", params.userId)
        .eq("workshop_id", params.workshopId)
        .eq("hold_id", params.holdId)
        .eq("status", "confirmed")
        .maybeSingle();

    // supabase-js reports failures in `error` rather than throwing, so swallowing it made a
    // degraded database indistinguishable from "this payment has no booking". Both callers
    // answer that question with money -- one refunds, the other returns already_confirmed --
    // so a read that FAILED has to be an exception, not a null.
    if (existingBookingError) {
        throw existingBookingError;
    }

    if (!existingBooking?.id) return null;

    const booking = await loadBookingById(serviceClient, existingBooking.id);
    if (!booking) {
        throw new Error(
            `Booking ${existingBooking.id} exists for payment ${params.paymentId} but could not be loaded.`
        );
    }

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
                    time,
                    created_at,
                    early_bird_enabled,
                    early_bird_discount_type,
                    early_bird_discount_value,
                    early_bird_days_after_listing
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
                    time,
                    created_at,
                    early_bird_enabled,
                    early_bird_discount_type,
                    early_bird_discount_value,
                    early_bird_days_after_listing
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

type ConfirmBookingRpcParams = {
    holdId: string;
    userId: string;
    workshopId: string;
    paymentProvider: string;
    paymentIntentId: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    notes: string;
    serviceFee: number;
    subtotal: number;
    total: number;
    couponId: string | null;
    discountApplied: number;
    earlyBirdDiscount: number;
};

function canUseLegacyConfirmBookingRpc(params: ConfirmBookingRpcParams) {
    // The 12-arg legacy RPC ignores the early-bird discount, so an early-bird booking must
    // never silently fall through to it — that would recreate the overcharge this fixes.
    return !params.couponId && params.discountApplied === 0 && params.earlyBirdDiscount === 0;
}

async function confirmBookingFromHold(
    serviceClient: SupabaseServerClient,
    params: ConfirmBookingRpcParams
) {
    const extended = await serviceClient.rpc("confirm_booking_from_hold", {
        p_hold_id: params.holdId,
        p_user_id: params.userId,
        p_workshop_id: params.workshopId,
        p_payment_provider: params.paymentProvider,
        p_payment_intent_id: params.paymentIntentId,
        p_first_name: params.firstName,
        p_last_name: params.lastName,
        p_email: params.email,
        p_phone: params.phone,
        p_notes: params.notes,
        p_service_fee: params.serviceFee,
        p_subtotal: params.subtotal,
        p_total: params.total,
        p_coupon_id: params.couponId,
        p_discount_applied: params.discountApplied,
        p_early_bird_discount: params.earlyBirdDiscount,
    });

    if (!extended.error && typeof extended.data === "string") {
        return {
            bookingId: extended.data,
            error: null,
            attemptedLegacy: false,
            extendedError: null,
            legacyError: null,
        };
    }

    if (
        !extended.error ||
        !isMissingExtendedConfirmBookingRpc(extended.error) ||
        !canUseLegacyConfirmBookingRpc(params)
    ) {
        return {
            bookingId: null,
            error: extended.error || "Extended booking RPC returned no booking id.",
            attemptedLegacy: false,
            extendedError: extended.error,
            legacyError: null,
        };
    }

    const legacy = await serviceClient.rpc("confirm_booking_from_hold", {
        p_hold_id: params.holdId,
        p_user_id: params.userId,
        p_workshop_id: params.workshopId,
        p_payment_provider: params.paymentProvider,
        p_payment_intent_id: params.paymentIntentId,
        p_first_name: params.firstName,
        p_last_name: params.lastName,
        p_email: params.email,
        p_phone: params.phone,
        p_notes: params.notes,
        p_service_fee: params.serviceFee,
    });

    if (!legacy.error && typeof legacy.data === "string") {
        return {
            bookingId: legacy.data,
            error: null,
            attemptedLegacy: true,
            extendedError: extended.error,
            legacyError: null,
        };
    }

    return {
        bookingId: null,
        error: legacy.error || extended.error || "Legacy booking RPC returned no booking id.",
        attemptedLegacy: true,
        extendedError: extended.error,
        legacyError: legacy.error,
    };
}

async function alreadyConfirmedResponse(
    booking: Awaited<ReturnType<typeof loadBookingById>>,
    context: { holdId: string; workshopId: string; paymentId: string; paymentStatus: string }
) {
    await sendConfirmedBookingNotification(booking, {
        holdId: context.holdId,
        workshopId: context.workshopId,
    });

    return NextResponse.json({
        mode: "already_confirmed",
        booking,
        paymentId: context.paymentId,
        paymentStatus: context.paymentStatus,
    });
}

/**
 * Compensating refund for a payment that was captured but could not be turned into a
 * booking.
 *
 * Capture happens before confirmation, so any failure in between -- a coupon mismatch, a
 * seat race, an RPC signature drift -- used to leave the customer charged with nothing to
 * show for it and no automated way back. Refunding is always the safe side of this trade:
 * Razorpay rejects a duplicate refund, whereas an un-refunded capture is money taken for
 * nothing.
 */
async function refundCapturedPayment(
    paymentId: string,
    amountPaise: number,
    context: Record<string, unknown>
) {
    try {
        await withRazorpayTimeout(() =>
            getRazorpayServerClient().payments.refund(paymentId, {
                amount: amountPaise,
                speed: "normal",
                notes: { reason: "booking_confirmation_failed" },
            })
        );
        return true;
    } catch (refundError) {
        // The charge is now stranded and needs a human. Make that unmissable.
        Sentry.captureException(refundError, {
            level: "fatal",
            tags: {
                layer: "payments",
                provider: "razorpay",
                route: "bookings_checkout",
                action: "compensating_refund_failed",
            },
            extra: { ...context, paymentId, amountPaise },
        });
        return false;
    }
}

/**
 * Decide what a captured-but-unbooked payment is owed after the confirmation path threw.
 *
 * Razorpay is the only authority on whether the money actually moved -- an 8s timeout on
 * `payments.capture` proves nothing, because `withRazorpayTimeout` abandons the await while
 * the HTTP request is still in flight. So ask Razorpay, and only then decide:
 *   - a booking already exists for this payment -> the throw was downstream of success
 *   - the payment is captured with no booking  -> compensate, the customer paid for nothing
 *   - anything else                            -> no money moved, nothing to undo
 */
async function reconcileCapturedPaymentAfterFailure(
    serviceClient: SupabaseServerClient,
    params: { userId: string; workshopId: string; holdId: string; paymentId: string }
): Promise<{ booking: Awaited<ReturnType<typeof loadBookingById>> | null; refunded: boolean }> {
    try {
        const booking = await loadExistingConfirmedBookingForPayment(serviceClient, params);
        if (booking) {
            return { booking, refunded: false };
        }

        const payment = await withRazorpayTimeout(() =>
            getRazorpayServerClient().payments.fetch(params.paymentId)
        );

        const status = String(payment?.status || "").toLowerCase();
        const capturedPaise = Number(payment?.amount || 0);
        const alreadyRefundedPaise = Number(payment?.amount_refunded || 0);

        if (status !== "captured" || capturedPaise <= 0 || alreadyRefundedPaise >= capturedPaise) {
            return { booking: null, refunded: false };
        }

        // Refund the REMAINDER, not the original amount. Razorpay rejects a refund that
        // exceeds the refundable balance, so asking for the full capture after a partial
        // refund already went through fails the whole compensation and leaves the rest of
        // the money stranded with a "contact support" message.
        const refundablePaise = capturedPaise - alreadyRefundedPaise;

        const refunded = await refundCapturedPayment(params.paymentId, refundablePaise, {
            ...params,
            reason: "checkout_threw_after_capture",
        });

        return { booking: null, refunded };
    } catch (reconcileError) {
        // Reconciliation itself failed, so a real charge may still be stranded. This needs a
        // human, and the caller must not report a clean refund it did not perform.
        Sentry.captureException(reconcileError, {
            level: "fatal",
            tags: {
                layer: "payments",
                provider: "razorpay",
                route: "bookings_checkout",
                action: "post_exception_reconcile_failed",
            },
            extra: params,
        });
        return { booking: null, refunded: false };
    }
}

export async function POST(request: NextRequest) {
    // Tag every event this request raises, so a customer quoting the x-request-id from their
    // failed checkout lands on the exact Sentry event for it.
    Sentry.setTag("request_id", getRequestId(request));

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

    // Verified here, before anything else can throw or return. It is a pure HMAC over
    // orderId|paymentId -- it depends on nothing we load below -- and it is what proves this
    // caller owns the payment id they sent. Every compensating action in this route (refund,
    // already-confirmed) gates on it, so it has to be latched before the first early return.
    const signatureVerified =
        isPaymentConfirmation &&
        verifyRazorpayOrderSignature({
            orderId: payload.razorpayOrderId!,
            paymentId: payload.razorpayPaymentId!,
            signature: payload.razorpaySignature!,
        });

    if (isPaymentConfirmation && !signatureVerified) {
        return paymentError("Invalid Razorpay payment signature.", 400, {
            userId: auth.user.id,
            holdId: payload.holdId,
            workshopId: payload.workshopId,
            razorpayOrderId: payload.razorpayOrderId,
            razorpayPaymentId: payload.razorpayPaymentId,
        });
    }

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
            if (isPaymentConfirmation && payload.razorpayPaymentId) {
                const existingConfirmedBooking = await loadExistingConfirmedBookingForPayment(
                    serviceClient,
                    {
                        userId: auth.user.id,
                        workshopId: payload.workshopId,
                        holdId: payload.holdId,
                        paymentId: payload.razorpayPaymentId,
                    }
                );

                if (existingConfirmedBooking) {
                    return alreadyConfirmedResponse(existingConfirmedBooking, {
                        holdId: payload.holdId,
                        workshopId: payload.workshopId,
                        paymentId: payload.razorpayPaymentId,
                        paymentStatus: "captured",
                    });
                }

                // The hold is gone and this payment did not buy the booking that consumed it
                // -- a second order against the same hold, paid after the first one won.
                // Razorpay orders stay payable until they expire, and the checkout UI can
                // create more than one for a hold, so this is reachable without any malice.
                // Returning 409 here charged the customer and walked away; ask Razorpay what
                // actually happened to the money and give it back if it moved.
                const reconciliation = await reconcileCapturedPaymentAfterFailure(serviceClient, {
                    userId: auth.user.id,
                    workshopId: payload.workshopId,
                    holdId: payload.holdId,
                    paymentId: payload.razorpayPaymentId,
                });

                if (reconciliation.refunded) {
                    return paymentError(
                        "This seat hold is no longer active, so your payment has been refunded. It should appear within 5-7 working days.",
                        409,
                        {
                            code: "HOLD_NOT_ACTIVE_REFUNDED",
                            userId: auth.user.id,
                            holdId: payload.holdId,
                            workshopId: payload.workshopId,
                            paymentId: payload.razorpayPaymentId,
                        }
                    );
                }
            }

            return paymentError("This seat hold is no longer active.", 409, {
                code: "HOLD_NOT_ACTIVE",
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

        // The early-bird term was missing entirely: the buyer was quoted a discounted total
        // client-side, charged the full price, and then confirm_booking_from_hold raised
        // EARLY_BIRD_DISCOUNT_MISMATCH *after capture*. This helper is shared with the booking
        // hook and mirrors the SQL exactly.
        const earlyBirdDiscount = computeEarlyBirdDiscount({
            price: pricePerGuest,
            guests: Number(hold.guests || 0),
            enabled: workshop.early_bird_enabled,
            discountType: workshop.early_bird_discount_type,
            discountValue: workshop.early_bird_discount_value,
            daysAfterListing: workshop.early_bird_days_after_listing,
            createdAt: workshop.created_at,
        });
        const subtotalAfterEarlyBird = Math.max(0, subtotalOriginal - earlyBirdDiscount);

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
                    !coupon.min_order_amount || subtotalAfterEarlyBird >= coupon.min_order_amount;
                const validWorkshop =
                    !Array.isArray(coupon.applicable_workshop_ids) ||
                    coupon.applicable_workshop_ids.length === 0 ||
                    coupon.applicable_workshop_ids.includes(payload.workshopId);
                const validCategory =
                    !Array.isArray(coupon.applicable_categories) ||
                    coupon.applicable_categories.length === 0 ||
                    Boolean(
                        workshop.category &&
                        coupon.applicable_categories.includes(workshop.category)
                    );

                if (validTime && validUses && validMinimum && validWorkshop && validCategory) {
                    appliedCouponId = coupon.id;
                    // Multiply BEFORE dividing, exactly as confirm_booking_from_hold does in
                    // numeric arithmetic. Dividing first goes through a binary float: at
                    // subtotal 1450 with a 29% coupon, `1450 * (29/100)` is 420.49999999999994
                    // and rounds to 420 while the RPC computes 421, so the RPC raises
                    // COUPON_DISCOUNT_MISMATCH *after the card has been captured*.
                    const rawDiscount =
                        coupon.discount_type === "percentage"
                            ? (subtotalAfterEarlyBird * Number(coupon.discount_value)) / 100
                            : Number(coupon.discount_value);
                    discountAmount = Math.min(
                        subtotalAfterEarlyBird,
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

        const subtotal = Math.max(0, subtotalAfterEarlyBird - discountAmount);
        const total = subtotal + serviceFee;
        const totalPaise = toPaise(total);

        const razorpay = getRazorpayServerClient();

        if (!isPaymentConfirmation) {
            const order = await withRazorpayTimeout(() =>
                razorpay.orders.create({
                    amount: totalPaise,
                    currency: PAYMENT_CURRENCY,
                    receipt: payload.holdId,
                    notes: {
                        holdId: payload.holdId,
                        workshopId: payload.workshopId,
                        userId: auth.user.id,
                    },
                })
            );

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

        const order = await withRazorpayTimeout(() =>
            razorpay.orders.fetch(payload.razorpayOrderId!)
        );
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

        const payment = await withRazorpayTimeout(() =>
            razorpay.payments.fetch(payload.razorpayPaymentId!)
        );
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
            const captured = await withRazorpayTimeout(() =>
                razorpay.payments.capture(payload.razorpayPaymentId!, totalPaise, PAYMENT_CURRENCY)
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

        const existingConfirmedBooking = await loadExistingConfirmedBookingForPayment(
            serviceClient,
            {
                userId: auth.user.id,
                workshopId: payload.workshopId,
                holdId: payload.holdId,
                paymentId: payload.razorpayPaymentId!,
            }
        );

        if (existingConfirmedBooking) {
            return alreadyConfirmedResponse(existingConfirmedBooking, {
                holdId: payload.holdId,
                workshopId: payload.workshopId,
                paymentId: payload.razorpayPaymentId!,
                paymentStatus,
            });
        }

        const confirmation = await confirmBookingFromHold(serviceClient, {
            holdId: payload.holdId,
            userId: auth.user.id,
            workshopId: payload.workshopId,
            paymentProvider: PAYMENT_PROVIDER,
            paymentIntentId: payload.razorpayPaymentId!,
            firstName: payload.firstName,
            lastName: payload.lastName,
            email: payload.email,
            phone: payload.phone,
            notes: payload.notes,
            serviceFee,
            subtotal,
            total,
            couponId: appliedCouponId,
            discountApplied: discountAmount,
            earlyBirdDiscount,
        });

        const bookingId = confirmation.bookingId;

        if (!bookingId) {
            // confirm_booking_from_hold takes the hold FOR UPDATE, so two confirmations of the
            // SAME payment -- a double-clicked "Retry confirmation", a retried fetch, a browser
            // resend -- serialise: the winner inserts the booking and commits, the loser lands
            // here with HOLD_NOT_ACTIVE. Refunding on that error gave the customer their money
            // back for a booking that exists and is still holding a seat. Re-check by payment id
            // before compensating; the winner's transaction has necessarily committed by the
            // time the row lock reached us, so this read cannot miss it.
            //
            // The lookup is deliberately keyed on the payment id and not on the hold id: a
            // SECOND, distinct payment against an already-consumed hold bought nothing, and
            // must still be refunded rather than answered with the first payment's booking.
            const racedBooking = await loadExistingConfirmedBookingForPayment(serviceClient, {
                userId: auth.user.id,
                workshopId: payload.workshopId,
                holdId: payload.holdId,
                paymentId: payload.razorpayPaymentId!,
            });

            if (racedBooking) {
                return alreadyConfirmedResponse(racedBooking, {
                    holdId: payload.holdId,
                    workshopId: payload.workshopId,
                    paymentId: payload.razorpayPaymentId!,
                    paymentStatus,
                });
            }

            const errorContext: Record<string, unknown> = {
                userId: auth.user.id,
                holdId: payload.holdId,
                workshopId: payload.workshopId,
                paymentId: payload.razorpayPaymentId,
                couponId: appliedCouponId,
                details: getErrorMessage(confirmation.error),
                attemptedLegacyRpc: confirmation.attemptedLegacy,
            };

            if (confirmation.extendedError) {
                errorContext.extendedRpcDetails = getErrorMessage(confirmation.extendedError);
            }

            if (confirmation.legacyError) {
                errorContext.legacyRpcDetails = getErrorMessage(confirmation.legacyError);
            }

            // The card was charged at capture above. Give the money back before responding.
            const refunded = await refundCapturedPayment(
                payload.razorpayPaymentId!,
                totalPaise,
                errorContext
            );
            errorContext.refunded = refunded;

            return paymentError(
                refunded
                    ? "We could not complete this booking, so your payment has been refunded. It should appear within 5-7 working days."
                    : "Payment succeeded, but booking confirmation failed and the automatic refund did not go through. Our team has been alerted -- please contact support.",
                refunded ? 409 : 500,
                errorContext
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

        // Anything thrown on the confirmation path may have thrown AFTER the card was charged:
        // withRazorpayTimeout bounds the await but cannot abort the in-flight HTTP request, so
        // a capture that times out at 8s can still succeed at Razorpay. Leaving this to
        // handleApiError alone meant the customer was charged and got "Checkout failed." with
        // no booking and no refund. Reconcile against Razorpay's own record of the payment
        // instead of guessing from local state.
        //
        // Wrapped in its own try, because building the response can throw too:
        // alreadyConfirmedResponse re-sends the confirmation notification, and that
        // notification failing is one of the ways control reaches this catch in the first
        // place. A second throw here would escape the handler entirely and replace the API
        // error envelope with a bare framework 500.
        try {
            if (signatureVerified && payload.razorpayPaymentId) {
                const reconciliation = await reconcileCapturedPaymentAfterFailure(serviceClient, {
                    userId: auth.user.id,
                    workshopId: payload.workshopId,
                    holdId: payload.holdId,
                    paymentId: payload.razorpayPaymentId,
                });

                if (reconciliation.booking) {
                    return alreadyConfirmedResponse(reconciliation.booking, {
                        holdId: payload.holdId,
                        workshopId: payload.workshopId,
                        paymentId: payload.razorpayPaymentId,
                        paymentStatus: "captured",
                    });
                }

                if (reconciliation.refunded) {
                    return paymentError(
                        "We could not complete this booking, so your payment has been refunded. It should appear within 5-7 working days.",
                        409,
                        {
                            code: "CHECKOUT_FAILED_REFUNDED",
                            userId: auth.user.id,
                            holdId: payload.holdId,
                            workshopId: payload.workshopId,
                            paymentId: payload.razorpayPaymentId,
                        }
                    );
                }
            }
        } catch (reconcileResponseError) {
            Sentry.captureException(reconcileResponseError, {
                level: "fatal",
                tags: {
                    layer: "payments",
                    provider: "razorpay",
                    route: "bookings_checkout",
                    action: "post_exception_response_failed",
                },
                extra: {
                    userId: auth.user.id,
                    holdId: payload.holdId,
                    paymentId: payload.razorpayPaymentId ?? null,
                },
            });
        }

        return handleApiError("Checkout failed.", error);
    }
}
