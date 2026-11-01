import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { requireSupabaseService } from "@/lib/api-helpers";
import * as Sentry from "@sentry/nextjs";
import { enforceRateLimit } from "@/lib/rate-limit";
import { couponValidateSchema } from "@/lib/validators";
import {
    COUPON_OFFERS_SETTING_KEY,
    offerSettingsFor,
    parseCouponOffersSetting,
    pricingCouponFromRow,
    publicOfferFromCoupon,
    type CouponOffersSetting,
} from "@/lib/offers";
import {
    computeCouponDiscount,
    computeQuote,
    couponRejection,
    type PricingCoupon,
    type PricingWorkshop,
} from "@/lib/pricing";
import type { SupabaseServerClient } from "@/lib/supabase-server";
import { formatCurrency } from "@/lib/utils";

/**
 * One opaque rejection for every failure mode.
 *
 * Distinct messages ("nonexistent" vs "expired" vs "maximum uses") let an attacker
 * separate "real code, not usable right now" from "no such code" and walk the namespace
 * a wordlist at a time, revealing the naming scheme and then live codes.
 */
const COUPON_REJECTED = "This coupon code is not valid for this order.";

/**
 * The shared request schema plus what only this route reads: the seats being booked, so a
 * group offer's seat minimum is checked and the discount computed exactly as checkout will, and
 * workshop ids up to 120 characters (the booking validators' limit: ids are
 * "<slug>-<timestamp>", which outgrows the shared schema's 64).
 */
const couponValidateRequestSchema = couponValidateSchema.extend({
    workshopId: z.string().trim().max(120).nullable().optional(),
    guests: z.coerce.number().int().min(1).max(20).nullable().optional(),
});

/** Only what pricing reads. These columns exist on every database checkout runs against. */
const WORKSHOP_PRICING_COLUMNS =
    "id, price, category, created_at, early_bird_enabled, early_bird_discount_type, early_bird_discount_value, early_bird_days_after_listing";

type WorkshopPricingRow = {
    id?: string | null;
    price?: number | null;
    category?: string | null;
    created_at?: string | null;
    early_bird_enabled?: boolean | null;
    early_bird_discount_type?: string | null;
    early_bird_discount_value?: number | null;
    early_bird_days_after_listing?: number | null;
};

function rejectCoupon(message = COUPON_REJECTED) {
    return NextResponse.json({ valid: false, message }, { status: 400 });
}

function toPricingWorkshop(row: WorkshopPricingRow | null, workshopId: string): PricingWorkshop {
    return {
        id: String(row?.id || workshopId),
        price: Math.max(0, Number(row?.price || 0)),
        category: row?.category ?? null,
        createdAt: row?.created_at ?? null,
        earlyBirdEnabled: row?.early_bird_enabled ?? null,
        earlyBirdDiscountType: row?.early_bird_discount_type ?? null,
        earlyBirdDiscountValue: row?.early_bird_discount_value ?? null,
        earlyBirdDaysAfterListing: row?.early_bird_days_after_listing ?? null,
    };
}

/**
 * The offer display settings. They decide a coupon's seat minimum and whether it stops at its
 * advertised end; a missing or unreadable setting means none (a hidden code, today's rules).
 */
async function loadOfferSetting(supabase: SupabaseServerClient): Promise<CouponOffersSetting> {
    const { data, error } = await supabase
        .from("platform_settings")
        .select("setting_value")
        .eq("setting_key", COUPON_OFFERS_SETTING_KEY)
        .maybeSingle();
    if (error) {
        Sentry.captureException(error, {
            level: "warning",
            tags: { layer: "api", route: "coupons_validate", action: "offer_setting_read" },
        });
        return {};
    }
    return parseCouponOffersSetting(data?.setting_value ?? null);
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

        const parsed = couponValidateRequestSchema.safeParse(rawBody);
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

        const { code, workshopId, subtotal, guests } = parsed.data;

        // Coupons are no longer readable by the anon/authenticated roles: the table holds
        // bearer secrets. Validation runs under the service role behind this
        // authenticated, rate-limited endpoint instead.
        const service = requireSupabaseService();
        if (!service.ok) return service.response;
        const supabase = service.client;

        // Check if coupon exists and is valid
        const { data: row, error } = await supabase
            .from("coupons")
            .select("*")
            .eq("code", code.toUpperCase())
            .single();

        if (error || !row) {
            return rejectCoupon();
        }

        const categoryLimited =
            Array.isArray(row.applicable_categories) && row.applicable_categories.length > 0;
        const seats = typeof guests === "number" ? guests : null;
        // The workshop is read only when it decides something: its price for an exact quote
        // (seats given), or its category for a category-limited coupon.
        const needsWorkshop = Boolean(workshopId) && (seats !== null || categoryLimited);

        const [setting, workshopRead] = await Promise.all([
            loadOfferSetting(supabase),
            needsWorkshop
                ? supabase
                      .from("workshops")
                      .select(WORKSHOP_PRICING_COLUMNS)
                      .eq("id", workshopId!)
                      .maybeSingle()
                : null,
        ]);

        if (workshopRead?.error) {
            // 22P02: the caller sent something that is not a workshop id at all.
            if (workshopRead.error.code === "22P02") {
                return rejectCoupon();
            }
            throw workshopRead.error;
        }
        const workshopRow = (workshopRead?.data ?? null) as WorkshopPricingRow | null;

        const fullCoupon = pricingCouponFromRow(row, setting);
        if (!fullCoupon) {
            // A row this code cannot read exactly is never applied by checkout either.
            return rejectCoupon();
        }
        // The seat minimum can only be judged with the seats; checkout always checks it
        // against the hold, so a caller that does not send them is not refused for it here.
        const coupon: PricingCoupon =
            seats === null ? { ...fullCoupon, minGuests: null } : fullCoupon;

        // The same rules checkout applies when it creates the order (src/lib/pricing.ts,
        // purpose "order", which mirrors confirm_booking_from_hold): an advertised offer stops
        // at its advertised end, a hidden code at valid_until. With the seats and a known
        // workshop the post-Early-Bird subtotal is computed here; otherwise the caller's.
        const workshop = toPricingWorkshop(workshopRow, workshopId || "");
        const exactQuote = seats !== null && workshopRow !== null;
        const callerSubtotal = typeof subtotal === "number" ? subtotal : null;
        const context = {
            workshop,
            guests: seats ?? 1,
            now: new Date(),
            purpose: "order" as const,
            ...(exactQuote ? {} : { subtotalAfterEarlyBird: callerSubtotal ?? 0 }),
        };

        const rejection = couponRejection(coupon, context);

        // Only conditions the shopper can act on are named, and they leak nothing a public
        // offer or their own cart does not already show. Everything else stays opaque.
        if (rejection === "COUPON_MIN_ORDER_NOT_MET") {
            return rejectCoupon(
                `Minimum order amount of ${formatCurrency(Number(coupon.minOrderAmount))} required.`
            );
        }
        if (rejection === "COUPON_MIN_GUESTS_NOT_MET") {
            return rejectCoupon(`Valid for ${coupon.minGuests} or more seats.`);
        }
        if (rejection) {
            return rejectCoupon();
        }

        // The discount this booking would get, computed the way checkout computes it. Null
        // when there is nothing to compute it from.
        let couponDiscount: number | null = null;
        if (exactQuote) {
            couponDiscount = computeQuote({
                workshop,
                guests: seats,
                coupon,
                serviceFee: 0,
                now: context.now,
                purpose: "order",
            }).couponDiscount;
        } else if (callerSubtotal !== null) {
            couponDiscount = computeCouponDiscount(callerSubtotal, coupon);
        }

        // An advertised offer's public label; never another coupon's code, never use counts.
        const display = offerSettingsFor(setting, coupon.id);
        const offer = display ? publicOfferFromCoupon(coupon, display) : null;

        return NextResponse.json(
            {
                valid: true,
                discount: row.discount_value,
                type: row.discount_type,
                message: "Coupon applied successfully!",
                id: row.id,
                minGuests: fullCoupon.minGuests ?? null,
                label: offer?.label ?? null,
                couponDiscount,
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
