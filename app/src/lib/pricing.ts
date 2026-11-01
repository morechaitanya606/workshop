/**
 * The one pricing module. Every surface that shows a price (cards, the workshop page, the
 * booking page, checkout) computes it here, so the price shown is the price charged.
 *
 * Pure and client-safe: no server-only imports, no Date.now() unless the caller omits `now`.
 *
 * The maths MUST stay equivalent to `confirm_booking_from_hold`
 * (supabase/migrations/20261001110400_confirm_booking_approval_check.sql). That RPC recomputes
 * every amount after the payment has been captured and raises on any difference, which ends in
 * an automatic refund. Order of operations, all in whole rupees:
 *
 *   list subtotal = price x guests
 *   - Early Bird (per workshop): percentage = floor(subtotal x v / 100) on the WHOLE subtotal,
 *     fixed = v x guests; clamped to [0, subtotal]
 *   - at most ONE coupon on the post-Early-Bird subtotal: percentage = round(sub x v / 100),
 *     fixed = round(v) per booking; clamped to [0, sub]
 *   + service fee (never discounted)
 *
 * Prices are GST-inclusive; GST is display text only and never calculated.
 */

/**
 * Advertised offers (coupons with a non-hidden "coupon_offers" entry, see PricingCoupon
 * `advertised`) are shown, listed, auto-applied and accepted for new orders only until
 * `valid_until` minus this grace. The RPC keeps honouring the coupon until `valid_until`
 * itself, and a paid order must be confirmed within its seat hold (BOOKING_HOLD_MINUTES, 8),
 * so an order created before the advertised end is never refused at confirmation.
 * Coupons that are not advertised (hidden codes) keep today's rule: valid until `valid_until`.
 */
export const OFFER_END_GRACE_MINUTES = 30;

const OFFER_END_GRACE_MS = OFFER_END_GRACE_MINUTES * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** A moment in time: a Date or epoch milliseconds. */
export type PricingInstant = Date | number;

export type PricingWorkshop = {
    id: string;
    /** Price per guest, in rupees. */
    price: number;
    category?: string | null;
    /** Workshop `created_at`: the Early Bird window is counted from it. */
    createdAt?: string | Date | null;
    earlyBirdEnabled?: boolean | null;
    earlyBirdDiscountType?: string | null;
    earlyBirdDiscountValue?: number | null;
    earlyBirdDaysAfterListing?: number | null;
};

export type PricingCoupon = {
    id: string;
    code: string;
    /** "percentage" or "fixed"; anything else is rejected, as the RPC does. */
    discountType: string;
    discountValue: number;
    minOrderAmount?: number | null;
    maxUses?: number | null;
    usedCount?: number | null;
    validFrom?: string | null;
    validUntil?: string | null;
    applicableWorkshopIds?: string[] | null;
    applicableCategories?: string[] | null;
    isActive: boolean | null;
    /**
     * App-only rule from the offer display settings (group offers). The RPC does not know it,
     * so it is enforced when the order is created; the hold's guest count cannot change later.
     */
    minGuests?: number | null;
    /**
     * True when the coupon has a non-hidden entry in the "coupon_offers" setting (auto, listed
     * or community): display and order then stop at the advertised end (valid_until minus
     * OFFER_END_GRACE_MINUTES). False or absent: a hidden code, valid until valid_until exactly
     * as before. Set by pricingCouponFromRow / pricingCouponFromOffer (src/lib/offers.ts).
     */
    advertised?: boolean | null;
};

/**
 * - "display": cards, pages and offer lists. An advertised coupon stops at its advertised end.
 * - "order": creating the Razorpay order. Same cut-off as display.
 * - "confirm": confirming a paid order. Exactly the RPC's rules (valid until `valid_until`,
 *   no app-only rules), so a payment that was quoted correctly is never refunded.
 */
export type CouponPurpose = "display" | "order" | "confirm";

/** Why a coupon does not apply. Named after the RPC's exceptions where one exists. */
export type CouponRejection =
    | "COUPON_INVALID"
    | "COUPON_INACTIVE"
    | "COUPON_NOT_YET_VALID"
    | "COUPON_EXPIRED"
    | "COUPON_MAX_USES_REACHED"
    | "COUPON_MIN_ORDER_NOT_MET"
    | "COUPON_WORKSHOP_MISMATCH"
    | "COUPON_CATEGORY_MISMATCH"
    | "COUPON_DISCOUNT_TYPE_INVALID"
    | "COUPON_MIN_GUESTS_NOT_MET";

export type CouponContext = {
    workshop: PricingWorkshop;
    guests: number;
    /** Computed from the workshop, guests and `now` when omitted. */
    subtotalAfterEarlyBird?: number;
    now: PricingInstant;
    purpose: CouponPurpose;
};

function toMs(value: PricingInstant | undefined): number {
    if (value instanceof Date) return value.getTime();
    if (typeof value === "number") return value;
    return Date.now();
}

/** ISO text to epoch ms. Undefined when absent, NaN when present but unreadable. */
function parseInstant(value: string | null | undefined): number | undefined {
    if (value === null || value === undefined || value === "") return undefined;
    return new Date(value).getTime();
}

function wholeGuests(guests: unknown): number {
    return Math.max(0, Math.trunc(Number(guests) || 0));
}

function unitPrice(price: unknown): number {
    return Math.max(0, Number(price) || 0);
}

/** date_trunc('day', ...) in UTC, matching Postgres on Supabase (session time zone UTC). */
function truncUtcDay(value: Date): number {
    return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

/* -------------------------------------------------------------------------- */
/* Exact decimal arithmetic                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A non-negative number as an exact decimal (digits / 10^scale), read from its shortest
 * round-trip text. That text is what PostgREST sent for a numeric column, so this reproduces
 * Postgres numeric maths instead of binary floating point.
 */
function toDecimal(value: number): { digits: number; scale: number } | null {
    if (!Number.isFinite(value) || value < 0) return null;
    const match = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(String(value));
    if (!match) return null;
    const fraction = match[2] ?? "";
    let scale = fraction.length - Number(match[3] ?? 0);
    let digitsText = `${match[1]}${fraction}`;
    if (scale < 0) {
        digitsText += "0".repeat(-scale);
        scale = 0;
    }
    const digits = Number(digitsText);
    return Number.isSafeInteger(digits) ? { digits, scale } : null;
}

/**
 * `amount x value / 100` like Postgres numeric: "floor" (Early Bird) or "round" (coupons;
 * half away from zero, which is half up for these non-negative inputs).
 */
function percentOf(amount: number, value: number, mode: "floor" | "round"): number {
    const decimal = toDecimal(value);
    if (decimal && Number.isSafeInteger(amount) && amount >= 0) {
        const numerator = amount * decimal.digits;
        const denominator = 100 * 10 ** decimal.scale;
        if (Number.isSafeInteger(numerator + denominator)) {
            let quotient = Math.floor(numerator / denominator);
            let remainder = numerator - quotient * denominator;
            if (remainder < 0) {
                quotient -= 1;
                remainder += denominator;
            } else if (remainder >= denominator) {
                quotient += 1;
                remainder -= denominator;
            }
            if (mode === "floor") return quotient;
            return remainder * 2 >= denominator ? quotient + 1 : quotient;
        }
    }
    // Only reachable with absurd inputs. Multiply before dividing, as the old code did.
    const raw = (amount * value) / 100;
    return mode === "floor" ? Math.floor(raw) : Math.round(raw);
}

/* -------------------------------------------------------------------------- */
/* Early Bird                                                                  */
/* -------------------------------------------------------------------------- */

export type EarlyBirdInput = {
    /** Price per guest, in rupees. */
    price: number;
    guests: number;
    enabled?: boolean | null;
    discountType?: string | null;
    discountValue?: number | null;
    daysAfterListing?: number | null;
    /** Workshop `created_at`. */
    createdAt?: string | Date | null;
    now?: Date;
};

function earlyBirdConfigured(input: {
    enabled?: boolean | null;
    discountValue?: number | null;
    daysAfterListing?: number | null;
    createdAt?: string | Date | null;
}): Date | null {
    const value = Math.max(0, Number(input.discountValue) || 0);
    const daysAfterListing = Math.max(0, Number(input.daysAfterListing) || 0);
    if (!input.enabled || value <= 0 || daysAfterListing <= 0 || !input.createdAt) return null;
    const createdAt = input.createdAt instanceof Date ? input.createdAt : new Date(input.createdAt);
    return Number.isNaN(createdAt.getTime()) ? null : createdAt;
}

/**
 * Early-bird discount, in rupees.
 *
 * This MUST stay equivalent to the SQL in `confirm_booking_from_hold` (latest:
 * 20261001110400_confirm_booking_approval_check.sql; introduced by
 * 20260912171425_early_bird_checkout_totals.sql), because that RPC recomputes the value and
 * raises EARLY_BIRD_DISCOUNT_MISMATCH if the caller disagrees -- after the payment has been
 * captured. Specifically:
 *
 *  - eligibility uses `ceil(days between UTC day-truncated now and created_at) <= daysAfterListing`
 *    (UTC, not local midnight -- a local-midnight comparison is off by one at the boundary);
 *  - percentage uses `floor(subtotal * value / 100)`; fixed is `value * guests`;
 *  - the result is clamped to [0, subtotal].
 */
export function computeEarlyBirdDiscount(input: EarlyBirdInput): number {
    const guests = wholeGuests(input.guests);
    const price = unitPrice(input.price);
    const subtotal = price * guests;
    const value = Math.max(0, Number(input.discountValue) || 0);
    const daysAfterListing = Math.max(0, Number(input.daysAfterListing) || 0);

    const createdAt = earlyBirdConfigured(input);
    if (!createdAt) return 0;

    const now = input.now ?? new Date();
    const elapsedDays = Math.ceil((truncUtcDay(now) - truncUtcDay(createdAt)) / DAY_MS);
    if (elapsedDays > daysAfterListing) return 0;

    const discount =
        input.discountType === "fixed" ? value * guests : percentOf(subtotal, value, "floor");

    return Math.min(subtotal, Math.max(discount, 0));
}

/**
 * The first instant at which the Early Bird no longer applies: the end of UTC day
 * `created_at + days`, i.e. 05:30 IST the next morning. ISO text, or null when there is no
 * window (days <= 0 or no valid created_at).
 */
export function earlyBirdEndsAt(
    createdAt: string | Date | null | undefined,
    daysAfterListing: number | null | undefined
): string | null {
    const days = Math.floor(Math.max(0, Number(daysAfterListing) || 0));
    if (days <= 0 || !createdAt) return null;
    const created = createdAt instanceof Date ? createdAt : new Date(createdAt);
    if (Number.isNaN(created.getTime())) return null;
    return new Date(truncUtcDay(created) + (days + 1) * DAY_MS).toISOString();
}

/** End of the workshop's Early Bird when it applies at `now`, otherwise null. */
export function activeEarlyBirdEndsAt(
    workshop: PricingWorkshop,
    now: PricingInstant
): string | null {
    const createdAt = earlyBirdConfigured({
        enabled: workshop.earlyBirdEnabled,
        discountValue: workshop.earlyBirdDiscountValue,
        daysAfterListing: workshop.earlyBirdDaysAfterListing,
        createdAt: workshop.createdAt,
    });
    if (!createdAt) return null;
    const endsAt = earlyBirdEndsAt(createdAt, workshop.earlyBirdDaysAfterListing);
    if (!endsAt) return null;
    return toMs(now) < new Date(endsAt).getTime() ? endsAt : null;
}

function workshopEarlyBirdDiscount(
    workshop: PricingWorkshop,
    guests: number,
    now: PricingInstant
): number {
    return computeEarlyBirdDiscount({
        price: workshop.price,
        guests,
        enabled: workshop.earlyBirdEnabled,
        discountType: workshop.earlyBirdDiscountType,
        discountValue: workshop.earlyBirdDiscountValue,
        daysAfterListing: workshop.earlyBirdDaysAfterListing,
        createdAt: workshop.createdAt,
        now: new Date(toMs(now)),
    });
}

/* -------------------------------------------------------------------------- */
/* Coupons                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Coupon discount on the post-Early-Bird subtotal, in rupees: percentage = round(sub x v / 100),
 * fixed = round(v) per booking (the RPC assigns the numeric to an integer, which rounds),
 * clamped to [0, sub]. Does NOT check whether the coupon applies: see couponRejection.
 */
export function computeCouponDiscount(
    subtotalAfterEarlyBird: number,
    coupon: Pick<PricingCoupon, "discountType" | "discountValue"> | null | undefined
): number {
    if (!coupon) return 0;
    const base = Math.max(0, Number(subtotalAfterEarlyBird) || 0);
    const value = Math.max(0, Number(coupon.discountValue) || 0);

    let discount: number;
    if (coupon.discountType === "percentage") {
        discount = percentOf(base, value, "round");
    } else if (coupon.discountType === "fixed") {
        discount = Math.round(value);
    } else {
        return 0;
    }

    return Math.min(base, Math.max(discount, 0));
}

/**
 * When a timed coupon stops being advertised, listed and auto-applied (ms), or null when it
 * has no end. `valid_until` minus OFFER_END_GRACE_MINUTES. Only advertised coupons use it.
 */
export function couponDisplayEndMs(coupon: Pick<PricingCoupon, "validUntil">): number | null {
    const until = parseInstant(coupon.validUntil);
    if (until === undefined || Number.isNaN(until)) return null;
    return until - OFFER_END_GRACE_MS;
}

/** couponDisplayEndMs as ISO text. */
export function couponDisplayEndsAt(coupon: Pick<PricingCoupon, "validUntil">): string | null {
    const end = couponDisplayEndMs(coupon);
    return end === null ? null : new Date(end).toISOString();
}

function resolveSubtotalAfterEarlyBird(ctx: CouponContext): number {
    if (typeof ctx.subtotalAfterEarlyBird === "number") {
        return Math.max(0, ctx.subtotalAfterEarlyBird);
    }
    const guests = wholeGuests(ctx.guests);
    const listSubtotal = unitPrice(ctx.workshop.price) * guests;
    return Math.max(0, listSubtotal - workshopEarlyBirdDiscount(ctx.workshop, guests, ctx.now));
}

/**
 * Null when the coupon applies, otherwise the first rule it breaks. Same rules and order as
 * the RPC (is_active, valid_from, valid_until, max_uses vs used_count, min_order_amount on the
 * post-Early-Bird subtotal, applicable_workshop_ids, applicable_categories, discount_type),
 * plus, except for "confirm": minGuests, and for an advertised coupon the advertised end
 * (valid_until minus the grace). A hidden code keeps the RPC's valid_until for every purpose.
 *
 * Deliberately stricter than the RPC in one place: a category-limited coupon never applies to
 * a workshop without a category (the RPC's NULL comparison lets it through). Stricter is safe:
 * the coupon is then simply not used.
 */
export function couponRejection(
    coupon: PricingCoupon | null | undefined,
    ctx: CouponContext
): CouponRejection | null {
    if (!coupon || typeof coupon.id !== "string" || !coupon.id) return "COUPON_INVALID";
    if (coupon.isActive !== true) return "COUPON_INACTIVE";

    const nowMs = toMs(ctx.now);

    const validFrom = parseInstant(coupon.validFrom);
    if (validFrom !== undefined) {
        if (Number.isNaN(validFrom)) return "COUPON_INVALID";
        if (validFrom > nowMs) return "COUPON_NOT_YET_VALID";
    }

    const validUntil = parseInstant(coupon.validUntil);
    if (validUntil !== undefined) {
        if (Number.isNaN(validUntil)) return "COUPON_INVALID";
        const cutoff =
            ctx.purpose !== "confirm" && coupon.advertised === true
                ? validUntil - OFFER_END_GRACE_MS
                : validUntil;
        if (cutoff < nowMs) return "COUPON_EXPIRED";
    }

    if (coupon.maxUses !== null && coupon.maxUses !== undefined) {
        if ((Number(coupon.usedCount) || 0) >= Number(coupon.maxUses)) {
            return "COUPON_MAX_USES_REACHED";
        }
    }

    if (coupon.minOrderAmount !== null && coupon.minOrderAmount !== undefined) {
        if (resolveSubtotalAfterEarlyBird(ctx) < Number(coupon.minOrderAmount)) {
            return "COUPON_MIN_ORDER_NOT_MET";
        }
    }

    const workshopIds = coupon.applicableWorkshopIds;
    if (Array.isArray(workshopIds) && workshopIds.length > 0) {
        if (!workshopIds.includes(String(ctx.workshop.id))) return "COUPON_WORKSHOP_MISMATCH";
    }

    const categories = coupon.applicableCategories;
    if (Array.isArray(categories) && categories.length > 0) {
        const category = ctx.workshop.category;
        if (!category || !categories.includes(category)) return "COUPON_CATEGORY_MISMATCH";
    }

    if (coupon.discountType !== "percentage" && coupon.discountType !== "fixed") {
        return "COUPON_DISCOUNT_TYPE_INVALID";
    }

    if (ctx.purpose !== "confirm") {
        const minGuests = Math.trunc(Number(coupon.minGuests) || 0);
        if (minGuests > 1 && wholeGuests(ctx.guests) < minGuests) {
            return "COUPON_MIN_GUESTS_NOT_MET";
        }
    }

    return null;
}

export type CouponPick = { coupon: PricingCoupon; discount: number };

/**
 * The coupon that saves the most, among those that apply (a booking takes one coupon).
 * Ties: the code the customer typed, then the one ending soonest, then the lowest id, so the
 * same inputs always pick the same coupon. Null when none applies or none saves anything.
 */
export function pickBestCoupon(
    candidates: ReadonlyArray<PricingCoupon | null | undefined>,
    ctx: CouponContext & { typedCode?: string | null }
): CouponPick | null {
    const subtotalAfterEarlyBird = resolveSubtotalAfterEarlyBird(ctx);
    const context = { ...ctx, subtotalAfterEarlyBird };
    const typed = ctx.typedCode ? ctx.typedCode.trim().toUpperCase() : "";

    const endOf = (coupon: PricingCoupon) => {
        const until = parseInstant(coupon.validUntil);
        return until === undefined || Number.isNaN(until) ? Number.POSITIVE_INFINITY : until;
    };
    const isTyped = (coupon: PricingCoupon) =>
        Boolean(typed) && String(coupon.code ?? "").toUpperCase() === typed;

    let best: CouponPick | null = null;
    for (const coupon of candidates) {
        if (!coupon || couponRejection(coupon, context)) continue;
        const discount = computeCouponDiscount(subtotalAfterEarlyBird, coupon);
        if (discount <= 0) continue;

        if (!best) {
            best = { coupon, discount };
            continue;
        }

        let better = discount > best.discount;
        if (discount === best.discount) {
            const typedNow = isTyped(coupon);
            const typedBest = isTyped(best.coupon);
            if (typedNow !== typedBest) {
                better = typedNow;
            } else if (endOf(coupon) !== endOf(best.coupon)) {
                better = endOf(coupon) < endOf(best.coupon);
            } else {
                better = coupon.id < best.coupon.id;
            }
        }
        if (better) best = { coupon, discount };
    }

    return best;
}

/* -------------------------------------------------------------------------- */
/* Quote                                                                       */
/* -------------------------------------------------------------------------- */

export type QuoteInput = {
    workshop: PricingWorkshop;
    guests: number;
    /** Applied only when couponRejection(coupon, purpose) is null. */
    coupon?: PricingCoupon | null;
    serviceFee: number;
    now: PricingInstant;
    /**
     * Defaults to "order" (same rules as "display"). Checkout confirmation passes "confirm".
     */
    purpose?: CouponPurpose;
};

export type Quote = {
    listUnitPrice: number;
    guests: number;
    listSubtotal: number;
    earlyBirdDiscount: number;
    subtotalAfterEarlyBird: number;
    /** The coupon actually applied (null when none was given or it does not apply). */
    couponId: string | null;
    couponDiscount: number;
    /** Why the given coupon was not applied, or null. */
    couponRejection: CouponRejection | null;
    /** What the RPC stores as bookings.subtotal. */
    subtotal: number;
    serviceFee: number;
    total: number;
    /** listSubtotal - subtotal: Early Bird + coupon. Never includes the service fee. */
    savings: number;
    /** When the Early Bird ends, if it applies at `now`. */
    earlyBirdEndsAt: string | null;
};

/** Service fee as checkout charges it: parseFloat, rounded, never negative; fallback 99. */
export function parseServiceFee(raw: unknown, fallback = 99): number {
    if (raw === null || raw === undefined) return fallback;
    const parsed = parseFloat(String(raw));
    return Number.isNaN(parsed) ? fallback : Math.max(0, Math.round(parsed));
}

export function computeQuote(input: QuoteInput): Quote {
    const guests = wholeGuests(input.guests);
    const listUnitPrice = unitPrice(input.workshop.price);
    const listSubtotal = listUnitPrice * guests;
    const earlyBirdDiscount = workshopEarlyBirdDiscount(input.workshop, guests, input.now);
    const subtotalAfterEarlyBird = Math.max(0, listSubtotal - earlyBirdDiscount);

    let couponId: string | null = null;
    let couponDiscount = 0;
    let rejection: CouponRejection | null = null;

    if (input.coupon) {
        rejection = couponRejection(input.coupon, {
            workshop: input.workshop,
            guests,
            subtotalAfterEarlyBird,
            now: input.now,
            purpose: input.purpose ?? "order",
        });
        if (!rejection) {
            couponId = input.coupon.id;
            couponDiscount = computeCouponDiscount(subtotalAfterEarlyBird, input.coupon);
        }
    }

    const subtotal = Math.max(0, subtotalAfterEarlyBird - couponDiscount);
    const serviceFee = Math.max(0, Math.round(Number(input.serviceFee) || 0));

    return {
        listUnitPrice,
        guests,
        listSubtotal,
        earlyBirdDiscount,
        subtotalAfterEarlyBird,
        couponId,
        couponDiscount,
        couponRejection: rejection,
        subtotal,
        serviceFee,
        total: subtotal + serviceFee,
        savings: listSubtotal - subtotal,
        earlyBirdEndsAt: activeEarlyBirdEndsAt(input.workshop, input.now),
    };
}

/* -------------------------------------------------------------------------- */
/* Database rows                                                               */
/* -------------------------------------------------------------------------- */

/** Nullable numeric column: a number, null (also a missing column), undefined if malformed. */
function optionalNumber(value: unknown): number | null | undefined {
    if (value === null || value === undefined) return null;
    if (typeof value !== "number" && typeof value !== "string") return undefined;
    const number = Number(value);
    return value !== "" && Number.isFinite(number) ? number : undefined;
}

function optionalText(value: unknown): string | null {
    return typeof value === "string" && value ? value : null;
}

/** A text[] column: an array of strings, null, or undefined (read as "malformed"). */
function textArray(value: unknown): string[] | null | undefined {
    if (value === null || value === undefined) return null;
    if (!Array.isArray(value)) return undefined;
    return value.every((item) => typeof item === "string") ? (value as string[]) : undefined;
}

/**
 * A `coupons` row (select("*"), snake_case) as a PricingCoupon. Null for a malformed row: a
 * coupon this code cannot read exactly is never applied, because guessing a rule wrong makes
 * the RPC refuse the booking after capture. Columns that do not exist yet just read undefined.
 * Without extras the coupon is a hidden code (no seat minimum, not advertised): today's rules.
 */
export function couponFromRow(
    row: unknown,
    extras: { minGuests?: number | null; advertised?: boolean | null } = {}
): PricingCoupon | null {
    if (!row || typeof row !== "object") return null;
    const record = row as Record<string, unknown>;

    if (typeof record.id !== "string" || !record.id) return null;
    if (typeof record.code !== "string") return null;
    if (typeof record.discount_type !== "string") return null;

    const discountValue = Number(record.discount_value);
    if (!Number.isFinite(discountValue)) return null;

    const minOrderAmount = optionalNumber(record.min_order_amount);
    const maxUses = optionalNumber(record.max_uses);
    const usedCount = optionalNumber(record.used_count);
    const applicableWorkshopIds = textArray(record.applicable_workshop_ids);
    const applicableCategories = textArray(record.applicable_categories);
    if (
        minOrderAmount === undefined ||
        maxUses === undefined ||
        usedCount === undefined ||
        applicableWorkshopIds === undefined ||
        applicableCategories === undefined
    ) {
        return null;
    }

    const minGuests = Math.trunc(Number(extras.minGuests) || 0);

    return {
        id: record.id,
        code: record.code,
        discountType: record.discount_type,
        discountValue,
        minOrderAmount,
        maxUses,
        usedCount,
        validFrom: optionalText(record.valid_from),
        validUntil: optionalText(record.valid_until),
        applicableWorkshopIds,
        applicableCategories,
        isActive: record.is_active === true,
        minGuests: minGuests > 1 ? minGuests : null,
        advertised: extras.advertised === true,
    };
}
