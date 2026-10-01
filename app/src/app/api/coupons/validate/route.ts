import { NextResponse, type NextRequest } from "next/server";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { requireSupabaseService } from "@/lib/api-helpers";
import * as Sentry from "@sentry/nextjs";
import { enforceRateLimit } from "@/lib/rate-limit";
import { couponValidateSchema } from "@/lib/validators";

/**
 * One opaque rejection for every failure mode.
 *
 * Distinct messages ("nonexistent" vs "expired" vs "maximum uses") let an attacker
 * separate "real code, not usable right now" from "no such code" and walk the namespace
 * a wordlist at a time, revealing the naming scheme and then live codes.
 */
const COUPON_REJECTED = "This coupon code is not valid for this order.";

function rejectCoupon() {
    return NextResponse.json({ valid: false, message: COUPON_REJECTED }, { status: 400 });
}

export async function POST(request: NextRequest) {
    // Coupon codes are guessable secrets, so a store outage must not lift the ceiling.
    const limited = await enforceRateLimit(request, "money", "api-coupon-validate", undefined, {
        strict: true,
    });
    if (!limited.ok) return limited.response;

    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    // The address bucket above is shared by everyone behind one NAT; a per-account bucket
    // stops a single logged-in user from enumerating codes at the address's full rate.
    const userLimited = await enforceRateLimit(
        request,
        "money",
        "api-coupon-validate-user",
        auth.user.id,
        { strict: true }
    );
    if (!userLimited.ok) return userLimited.response;

    try {
        let rawBody: unknown;
        try {
            rawBody = await request.json();
        } catch {
            return NextResponse.json(
                { valid: false, message: "Coupon code is required" },
                { status: 400 }
            );
        }

        const parsed = couponValidateSchema.safeParse(rawBody);
        if (!parsed.success) {
            const codeMissing = parsed.error.issues.some((issue) => issue.path[0] === "code");
            return NextResponse.json(
                {
                    valid: false,
                    message: codeMissing ? "Coupon code is required" : "Invalid coupon request.",
                },
                { status: 400 }
            );
        }

        const { code, workshopId, subtotal } = parsed.data;

        // Coupons are no longer readable by the anon/authenticated roles: the table holds
        // bearer secrets. Validation runs under the service role behind this
        // authenticated, rate-limited endpoint instead.
        const service = requireSupabaseService();
        if (!service.ok) return service.response;
        const supabase = service.client;

        // Check if coupon exists and is valid
        const { data: coupon, error } = await supabase
            .from("coupons")
            .select("*")
            .eq("code", code.toUpperCase())
            .single();

        if (error || !coupon) {
            return rejectCoupon();
        }

        // The rules below mirror /api/bookings/checkout line for line (and the
        // confirm_booking_from_hold RPC behind it). If this endpoint accepts a coupon that
        // checkout then drops, the UI shows a discount the buyer is never given.
        if (!coupon.is_active) {
            return rejectCoupon();
        }

        const now = new Date();
        if (coupon.valid_from && new Date(coupon.valid_from) > now) {
            return rejectCoupon();
        }

        if (coupon.valid_until && new Date(coupon.valid_until) < now) {
            return rejectCoupon();
        }

        if (coupon.max_uses !== null && (coupon.used_count || 0) >= coupon.max_uses) {
            return rejectCoupon();
        }

        // The minimum-order rule is the one case worth naming: the shopper can act on it,
        // and it leaks nothing they could not already infer from their own cart.
        if (coupon.min_order_amount && coupon.min_order_amount > 0) {
            if (typeof subtotal !== "number" || subtotal < coupon.min_order_amount) {
                return NextResponse.json(
                    {
                        valid: false,
                        message: `Minimum order amount of ₹${coupon.min_order_amount} required.`,
                    },
                    { status: 400 }
                );
            }
        }

        // Workshop specific validation. Ids are compared as strings: the column is moving
        // from uuid[] to text[].
        if (
            Array.isArray(coupon.applicable_workshop_ids) &&
            coupon.applicable_workshop_ids.length > 0
        ) {
            if (!workshopId || !coupon.applicable_workshop_ids.map(String).includes(workshopId)) {
                return rejectCoupon();
            }
        }

        // Category restriction: checkout requires the workshop to HAVE a category that is on
        // the list, so a missing workshop / category fails here too.
        if (
            Array.isArray(coupon.applicable_categories) &&
            coupon.applicable_categories.length > 0
        ) {
            if (!workshopId) {
                return rejectCoupon();
            }

            const { data: workshop, error: workshopError } = await supabase
                .from("workshops")
                .select("category")
                .eq("id", workshopId)
                .maybeSingle();

            if (workshopError) {
                // 22P02: the caller sent something that is not a workshop id at all.
                if (workshopError.code === "22P02") {
                    return rejectCoupon();
                }
                throw workshopError;
            }

            if (!workshop?.category || !coupon.applicable_categories.includes(workshop.category)) {
                return rejectCoupon();
            }
        }

        return NextResponse.json(
            {
                valid: true,
                discount: coupon.discount_value,
                type: coupon.discount_type,
                message: "Coupon applied successfully!",
                id: coupon.id,
            },
            { status: 200 }
        );
    } catch (error) {
        Sentry.captureException(error, {
            tags: { layer: "api", route: "coupons_validate" },
        });
        return NextResponse.json(
            { valid: false, message: "Internal server error." },
            { status: 500 }
        );
    }
}
