import { NextResponse, type NextRequest } from "next/server";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { requireSupabaseService } from "@/lib/api-helpers";
import * as Sentry from "@sentry/nextjs";
import { enforceRateLimit } from "@/lib/rate-limit";

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
    const limited = await enforceRateLimit(request, "money", "api-coupon-validate");
    if (!limited.ok) return limited.response;

    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    try {
        const body = await request.json();
        const { code, workshopId, subtotal } = body;

        if (typeof code !== "string" || !code.trim()) {
            return NextResponse.json(
                { valid: false, message: "Coupon code is required" },
                { status: 400 }
            );
        }

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
        if (coupon.min_order_amount && subtotal && subtotal < coupon.min_order_amount) {
            return NextResponse.json(
                {
                    valid: false,
                    message: `Minimum order amount of ₹${coupon.min_order_amount} required.`,
                },
                { status: 400 }
            );
        }

        // Workshop specific validation
        if (coupon.applicable_workshop_ids && coupon.applicable_workshop_ids.length > 0) {
            if (!workshopId || !coupon.applicable_workshop_ids.includes(workshopId)) {
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
