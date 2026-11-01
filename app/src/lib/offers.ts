/**
 * Customer-facing offers: what is shown on cards, the workshop page and checkout.
 *
 * Pure and client-safe. Every offer except Early Bird is an ordinary row in `coupons`, so the
 * live confirm_booking_from_hold RPC (Early Bird + exactly one coupon) charges it unchanged.
 * How a coupon is SHOWN lives in the platform setting "coupon_offers" (no migration):
 *
 *   { "<coupon uuid>": { "visibility": "auto", "label": "Diwali offer",
 *                        "min_guests": 2, "show_end_date": true } }
 *
 * - hidden    (or no entry): a code typed at checkout, exactly as before;
 * - listed:   shown under "Available offers" with its code and one-tap Apply;
 * - auto:     applied automatically when it is the best price (no code shown);
 * - community: teaser only ("Community price drop"); the code is shared inside WhatsApp.
 *
 * A missing or malformed setting means "no offers": never an error.
 *
 * The setting is PUBLIC, not secret. The app keeps it out of its own public payloads (GET
 * /api/settings, the cached settings), but platform_settings has an RLS select policy for anon
 * (20261004140000_rls_helpers_private_and_policy_merge.sql), so anyone holding the publishable
 * key can read it straight from Supabase: coupon ids, visibilities, labels, seat minimums. Making
 * it private would need an RLS change (a migration). So it must never hold a secret:
 * - there is no field for a code: the validator rejects every field but the four above;
 * - a code typed INTO a label is only stopped on the admin write path: the validator cannot see
 *   coupon codes, so every route that saves this setting must call findLabelsRevealingCodes
 *   (offers-server.ts) and refuse the save. offerLabelRevealsCode also keeps such a label off
 *   every page, but the stored text itself would already be public.
 * And a coupon id is never a redemption credential: hidden and community coupons are redeemed
 * only by their typed code; only "auto" coupons are applied by the server without one.
 * OFFER_ADMIN_HINTS words all of this for the admin editor.
 *
 * Rendering contract for every surface that lists an offer: the label is only a name (an admin
 * label replaces the default), so always render offerDetailsText(offer) under it (the discount
 * with its unit, plus every condition: seats, minimum order, community-only), and the end from
 * `endsAt` after mount (never from `availableUntil`). An admin label that states a different
 * discount than the coupon's (in digits: "%", "₹"/"Rs"/"INR", "100 off"), a minimum order other
 * than the coupon's, or a per-seat amount for a per-booking coupon is not shown
 * (offerLabelConflicts): the default is used instead. That check reads digits, not prose
 * ("two hundred off" passes), which is one more reason the details line is always rendered.
 *
 * Use limits: auto and community offers should have NO max_uses. Every buyer gets an auto
 * offer, and the RPC counts uses only at confirmation, after the payment is captured: at the
 * cap, concurrent buyers would all be quoted the discount and all but the first refunded. As a
 * safety net, an auto or listed coupon with max_uses stops being auto-applied or listed once
 * CAPPED_OFFER_RESERVE uses or fewer remain (effectiveOfferDisplay), and a used-up coupon is
 * never shown or applied. Customers who have a code can still type it until the cap, as today.
 */

import {
    activeEarlyBirdEndsAt,
    computeQuote,
    couponDisplayEndsAt,
    couponFromRow,
    OFFER_END_GRACE_MINUTES,
    pickBestCoupon,
    type PricingCoupon,
    type PricingInstant,
    type PricingWorkshop,
} from "@/lib/pricing";
import { formatCurrency } from "@/lib/utils";

export const COUPON_OFFERS_SETTING_KEY = "coupon_offers";
export const OFFER_VISIBILITIES = ["hidden", "listed", "auto", "community"] as const;
export const OFFER_LABEL_MAX_LENGTH = 40;
/** A hold has at most 20 guests (validators.ts), so a larger minimum could never be met. */
export const OFFER_MIN_GUESTS_MAX = 20;
export const COUPON_OFFERS_MAX_ENTRIES = 200;
/**
 * An auto or listed coupon with max_uses is no longer auto-applied or listed once this many uses
 * or fewer remain (see the module header). A cap of 3 or less is therefore never auto/listed.
 */
export const CAPPED_OFFER_RESERVE = 3;

/** Helper text for the admin offer editor, so the rules above are explained where offers are made. */
export const OFFER_ADMIN_HINTS = {
    publicSettings:
        "Offer settings (visibility, label, minimum seats, show end date) are not secret: anyone can read them. Never put a code or anything private in a label.",
    maxUses: `Leave max uses empty for Auto and Community offers. Uses are counted only after payment, so at the limit several buyers could pay the offer price and then be refunded. Auto and Listed offers stop showing when ${CAPPED_OFFER_RESERVE} or fewer uses remain.`,
    advertisedEnd: `Customers see the offer end ${OFFER_END_GRACE_MINUTES} minutes before the coupon's valid-until time, so a payment started before the shown end never fails.`,
    label: "The label is only a name. The discount and its conditions (seats, minimum order, community only) are always shown under it. A label that states a different discount or minimum order, or a per-seat amount for a fixed coupon (which comes off once per booking), is not shown. A label that contains the coupon's code is refused unless the offer is Listed.",
} as const;

export type OfferVisibility = (typeof OFFER_VISIBILITIES)[number];

export type OfferDisplaySettings = {
    visibility: OfferVisibility;
    label?: string;
    /** 2 or more; absent means no seat minimum. */
    minGuests?: number;
    showEndDate?: boolean;
};

/** Parsed "coupon_offers": display settings by coupon id (lower-case). */
export type CouponOffersSetting = Record<string, OfferDisplaySettings>;

/** The stored (snake_case) form of one entry. */
export type StoredOfferDisplaySettings = {
    visibility: OfferVisibility;
    label?: string;
    min_guests?: number;
    show_end_date?: boolean;
};

export type PublicOfferKind = "early_bird" | "auto" | "listed" | "community";

/**
 * An offer as the public may see it. Never carries max_uses or used_count, and carries a code
 * only for "listed" offers.
 */
export type PublicOffer = {
    /** The coupon id, or "early-bird:<workshopId>". */
    id: string;
    kind: PublicOfferKind;
    label: string;
    discountType: "percentage" | "fixed";
    /** Fixed Early Bird is per seat; a fixed coupon is per booking. See offerDiscountText. */
    discountValue: number;
    minGuests: number | null;
    /** Minimum post-Early-Bird subtotal, in rupees. */
    minOrderAmount: number | null;
    /** The offer does not apply before this instant. */
    startsAt: string | null;
    /**
     * When the offer stops being shown and applied (valid_until minus the grace). Used for
     * filtering even when the end date is not advertised. Do not render it: render endsAt.
     */
    availableUntil: string | null;
    /** The advertised end (= availableUntil), only when it may be shown. */
    endsAt: string | null;
    /** Only for "listed" offers. */
    code: string | null;
    workshopIds: string[] | null;
    categories: string[] | null;
};

/**
 * What a workshop card shows: the 1-guest price after the offers that apply by themselves.
 * Render the label with the struck list price and the offer price, or "Save ₹X" (`savings`).
 * There is deliberately no percentage: one computed from the rupees saved can contradict the
 * label (₹1,999 at 10% saves ₹199, i.e. 9.95%), so the label alone names the discount.
 *
 * Expiry: pages are cached and tabs stay open, so after mount a card must drop the offer and show
 * the plain price once nowMs >= availableUntil (a fresh render recomputes it). Render only
 * endsAt, never availableUntil.
 */
export type CardOffer = {
    /** Per person, before discounts. */
    listPrice: number;
    /** What checkout charges for ONE guest (before the service fee). */
    offerPrice: number;
    /** listPrice - offerPrice, in rupees (always > 0). */
    savings: number;
    /** Name of the largest discount applied (an admin label may be a plain name). */
    label: string;
    /** Names of every discount applied (Early Bird first). */
    labels: string[];
    /**
     * Every discount applied, with its unit, Early Bird first: "10% off", "₹150 off per seat",
     * "10% off + ₹200 off per booking". Render it with the label whenever perBooking is true.
     */
    discountText: string;
    /** When this price ends, only when that end may be advertised. Render after mount. */
    endsAt: string | null;
    /**
     * When this price stops being valid: the soonest end of any discount in it, advertised or
     * not. Never rendered: used only to drop the offer after mount once it has passed.
     */
    availableUntil: string | null;
    couponId: string | null;
    /**
     * True when a fixed-amount coupon is part of the price. It comes off once per booking, so
     * offerPrice is the 1-seat price, not a per-person price for groups (2 seats at ₹1,000 with
     * ₹200 off pay ₹1,800, i.e. ₹900 each). Then show the label and discountText ("₹200 off per
     * booking") beside the list price rather than a per-person struck price.
     */
    perBooking: boolean;
};

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const ENTRY_FIELDS = ["visibility", "label", "min_guests", "show_end_date"];
const KIND_ORDER: Record<PublicOfferKind, number> = {
    early_bird: 0,
    auto: 1,
    listed: 2,
    community: 3,
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isVisibility(value: unknown): value is OfferVisibility {
    return (OFFER_VISIBILITIES as readonly unknown[]).includes(value);
}

function toMs(now: PricingInstant): number {
    return now instanceof Date ? now.getTime() : now;
}

function isoMs(value: string | null): number | null {
    if (!value) return null;
    const ms = new Date(value).getTime();
    return Number.isNaN(ms) ? null : ms;
}

/* -------------------------------------------------------------------------- */
/* The "coupon_offers" setting                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Strict validation for an admin write of "coupon_offers" (used by validateSettingsPatch).
 * Rejects unknown fields; returns the normalised stored value.
 */
export function validateCouponOffersSetting(
    value: unknown
): Result<Record<string, StoredOfferDisplaySettings>> {
    if (!isPlainObject(value)) return { ok: false, error: "Coupon offers must be an object." };
    const entries = Object.entries(value);
    if (entries.length > COUPON_OFFERS_MAX_ENTRIES) {
        return {
            ok: false,
            error: `At most ${COUPON_OFFERS_MAX_ENTRIES} coupon offers are allowed.`,
        };
    }

    const next: Record<string, StoredOfferDisplaySettings> = {};
    for (const [couponId, entry] of entries) {
        if (!UUID_PATTERN.test(couponId)) {
            return { ok: false, error: "Each coupon offer must be keyed by a coupon id." };
        }
        if (!isPlainObject(entry)) {
            return { ok: false, error: "Each coupon offer must be an object." };
        }
        if (Object.keys(entry).some((field) => !ENTRY_FIELDS.includes(field))) {
            return { ok: false, error: "Coupon offer contains an unknown field." };
        }
        if (!isVisibility(entry.visibility)) {
            return {
                ok: false,
                error: "Coupon offer visibility must be hidden, listed, auto or community.",
            };
        }

        const stored: StoredOfferDisplaySettings = { visibility: entry.visibility };

        if (entry.label !== undefined && entry.label !== null) {
            if (typeof entry.label !== "string") {
                return { ok: false, error: "Coupon offer label must be text." };
            }
            const label = entry.label.trim();
            if (label.length > OFFER_LABEL_MAX_LENGTH) {
                return {
                    ok: false,
                    error: `Coupon offer label must be at most ${OFFER_LABEL_MAX_LENGTH} characters.`,
                };
            }
            if (CONTROL_CHARACTERS.test(label)) {
                return { ok: false, error: "Coupon offer label must be a single line." };
            }
            if (label) stored.label = label;
        }

        if (entry.min_guests !== undefined && entry.min_guests !== null) {
            const minGuests = entry.min_guests;
            if (
                typeof minGuests !== "number" ||
                !Number.isInteger(minGuests) ||
                minGuests < 1 ||
                minGuests > OFFER_MIN_GUESTS_MAX
            ) {
                return {
                    ok: false,
                    error: `Coupon offer minimum seats must be a whole number from 1 to ${OFFER_MIN_GUESTS_MAX}.`,
                };
            }
            if (minGuests > 1) stored.min_guests = minGuests;
        }

        if (entry.show_end_date !== undefined && entry.show_end_date !== null) {
            if (typeof entry.show_end_date !== "boolean") {
                return { ok: false, error: "Coupon offer show-end-date must be true or false." };
            }
            if (entry.show_end_date) stored.show_end_date = true;
        }

        next[couponId.toLowerCase()] = stored;
    }

    return { ok: true, value: next };
}

/**
 * Reads the stored "coupon_offers" value. Never throws: anything unreadable is skipped. An entry
 * whose seat minimum cannot be read is dropped entirely, so the coupon falls back to today's
 * behaviour: never auto-applied or listed, and a typed code works with no seat minimum (as any
 * code without an entry does). The same holds when the setting cannot be read at all.
 */
export function parseCouponOffersSetting(raw: unknown): CouponOffersSetting {
    let value = raw;
    if (typeof value === "string") {
        try {
            value = JSON.parse(value);
        } catch {
            return {};
        }
    }
    if (!isPlainObject(value)) return {};

    const parsed: CouponOffersSetting = {};
    for (const [couponId, entry] of Object.entries(value)) {
        if (!UUID_PATTERN.test(couponId) || !isPlainObject(entry)) continue;
        if (!isVisibility(entry.visibility)) continue;

        const settings: OfferDisplaySettings = { visibility: entry.visibility };

        if (entry.min_guests !== undefined && entry.min_guests !== null) {
            const minGuests = entry.min_guests;
            if (
                typeof minGuests !== "number" ||
                !Number.isInteger(minGuests) ||
                minGuests < 1 ||
                minGuests > OFFER_MIN_GUESTS_MAX
            ) {
                continue;
            }
            if (minGuests > 1) settings.minGuests = minGuests;
        }

        if (typeof entry.label === "string") {
            const label = entry.label.trim();
            if (
                label &&
                label.length <= OFFER_LABEL_MAX_LENGTH &&
                !CONTROL_CHARACTERS.test(label)
            ) {
                settings.label = label;
            }
        }

        if (entry.show_end_date === true) settings.showEndDate = true;

        parsed[couponId.toLowerCase()] = settings;
    }

    return parsed;
}

/** The stored (snake_case) form of a parsed setting, for the admin editor to save. */
export function serializeCouponOffersSetting(
    setting: CouponOffersSetting
): Record<string, StoredOfferDisplaySettings> {
    const stored: Record<string, StoredOfferDisplaySettings> = {};
    for (const [couponId, entry] of Object.entries(setting)) {
        const next: StoredOfferDisplaySettings = { visibility: entry.visibility };
        if (entry.label) next.label = entry.label;
        if (entry.minGuests && entry.minGuests > 1) next.min_guests = entry.minGuests;
        if (entry.showEndDate) next.show_end_date = true;
        stored[couponId.toLowerCase()] = next;
    }
    return stored;
}

/** Display settings for one coupon, or undefined (= hidden, today's behaviour). */
export function offerSettingsFor(
    setting: CouponOffersSetting,
    couponId: string
): OfferDisplaySettings | undefined {
    return setting[String(couponId).toLowerCase()];
}

/**
 * A coupons row as a PricingCoupon, with the seat minimum from its display settings and
 * `advertised` set when its entry is not hidden (it then stops at the advertised end). Without
 * an entry it is a hidden code with today's rules.
 */
export function pricingCouponFromRow(
    row: unknown,
    setting: CouponOffersSetting
): PricingCoupon | null {
    const id = isPlainObject(row) && typeof row.id === "string" ? row.id : "";
    const display = id ? offerSettingsFor(setting, id) : undefined;
    return couponFromRow(row, {
        minGuests: display?.minGuests ?? null,
        advertised: Boolean(display && display.visibility !== "hidden"),
    });
}

/**
 * Display settings as they apply now: an auto or listed coupon with max_uses falls back to
 * hidden once CAPPED_OFFER_RESERVE uses or fewer remain (see the module header). Used by the
 * public offer list and by checkout's auto candidates alike, so both agree.
 */
export function effectiveOfferDisplay(
    coupon: Pick<PricingCoupon, "maxUses" | "usedCount">,
    display: OfferDisplaySettings | undefined
): OfferDisplaySettings | undefined {
    if (!display || (display.visibility !== "auto" && display.visibility !== "listed")) {
        return display;
    }
    if (coupon.maxUses === null || coupon.maxUses === undefined) return display;
    const remaining = Number(coupon.maxUses) - (Number(coupon.usedCount) || 0);
    return remaining > CAPPED_OFFER_RESERVE ? display : { ...display, visibility: "hidden" };
}

/* -------------------------------------------------------------------------- */
/* Labels                                                                      */
/* -------------------------------------------------------------------------- */

function formatPercent(value: number): string {
    return `${Number(value.toFixed(2))}%`;
}

/** "10% off" or "₹200 off", with no unit: see offerDiscountText for what customers read. */
export function describeDiscount(discountType: string, discountValue: number): string {
    return discountType === "percentage"
        ? `${formatPercent(discountValue)} off`
        : `${formatCurrency(discountValue)} off`;
}

/**
 * The discount as customers should read it: "10% off", "₹150 off per seat" (fixed Early Bird,
 * charged per guest) or "₹200 off per booking" (fixed coupon, charged once per booking).
 */
export function offerDiscountText(
    offer: Pick<PublicOffer, "kind" | "discountType" | "discountValue">
): string {
    const text = describeDiscount(offer.discountType, offer.discountValue);
    if (offer.discountType !== "fixed") return text;
    return offer.kind === "early_bird" ? `${text} per seat` : `${text} per booking`;
}

/**
 * The conditions of an offer, for display next to its label and discount, e.g.
 * ["Book 2+ seats", "Bookings of ₹2,000 or more (before service fee)", "For WhatsApp community
 * members"]. The minimum order is measured after Early Bird and before the service fee (checkout
 * shows a total with the fee, so the text says so): pass `earlyBirdActive` when the workshop's
 * Early Bird applies so the text also says "after Early Bird". The end date is not included:
 * render it from `endsAt` after mount.
 */
export function offerTerms(
    offer: Pick<PublicOffer, "kind" | "minGuests" | "minOrderAmount">,
    options: { earlyBirdActive?: boolean } = {}
): string[] {
    const terms: string[] = [];
    if (offer.minGuests && offer.minGuests > 1) terms.push(`Book ${offer.minGuests}+ seats`);
    if (offer.minOrderAmount && offer.minOrderAmount > 0) {
        const measured = options.earlyBirdActive
            ? "after Early Bird, before service fee"
            : "before service fee";
        terms.push(`Bookings of ${formatCurrency(offer.minOrderAmount)} or more (${measured})`);
    }
    if (offer.kind === "community") terms.push("For WhatsApp community members");
    return terms;
}

/** offerTerms joined with " · " ("" when the offer has no conditions). */
export function offerTermsText(
    offer: Pick<PublicOffer, "kind" | "minGuests" | "minOrderAmount">,
    options: { earlyBirdActive?: boolean } = {}
): string {
    return offerTerms(offer, options).join(" · ");
}

/**
 * The line to render under an offer's label: its discount with the unit (left out when the
 * label already says exactly that) and every condition, e.g. "₹200 off per booking · Book 2+
 * seats" or "15% off · For WhatsApp community members". "" when the label says it all.
 */
export function offerDetailsText(
    offer: Pick<
        PublicOffer,
        "kind" | "label" | "discountType" | "discountValue" | "minGuests" | "minOrderAmount"
    >,
    options: { earlyBirdActive?: boolean } = {}
): string {
    const discount = offerDiscountText(offer);
    const parts = offer.label.toLowerCase().includes(discount.toLowerCase()) ? [] : [discount];
    return [...parts, ...offerTerms(offer, options)].join(" · ");
}

function defaultCouponLabel(
    kind: Exclude<PublicOfferKind, "early_bird">,
    discountType: PublicOffer["discountType"],
    discountValue: number,
    minGuests: number | null
): string {
    if (kind === "community") return "Community price drop";
    // A fixed coupon comes off once per booking, never per seat: say so in the label itself.
    const text = offerDiscountText({ kind, discountType, discountValue });
    if (!minGuests || minGuests <= 1) return text;
    return discountType === "fixed"
        ? `${text} of ${minGuests}+ seats`
        : `${text} on ${minGuests}+ seats`;
}

/** A number in a label: "10%", "₹200", "Rs. 1,500", or a bare "100" followed by "off". */
const LABEL_NUMBER =
    /(₹|\brupees?\b|\brs\.?|\binr)?\s*(\d[\d,]*(?:\.\d+)?)(\s*(?:%|percent\b|per\s*cent\b))?/gi;
/** Right after a number: it is an amount off ("200 off", "200/- off", "200 rupees off"). */
const AMOUNT_OFF_AFTER = /^\s*(?:\/-\s*)?(?:(?:rs\b\.?|inr\b|rupees?\b)\s*)?off\b/i;
/** Right after a bare number: it is in rupees ("200/-", "200 Rs", "200 rupees"). */
const RUPEES_AFTER = /^\s*(?:\/-|rs\b\.?|inr\b|rupees?\b)/i;
/** Before a rupee amount: it is a minimum order, not a discount ("orders above ₹2,000"). */
const THRESHOLD_BEFORE =
    /\b(?:above|over|min(?:imum)?|orders?(?:\s+(?:of|above|over|from|worth))?|bookings?(?:\s+(?:of|above|over|from|worth))?|spend(?:ing)?|from|worth|more\s+than|at\s+least)\s*:?\s*$/i;
/** After a rupee amount: it is a minimum order ("₹2,000+", "₹2,000 or more"). */
const THRESHOLD_AFTER = /^\s*(?:\+|or\s+(?:more|above)|and\s+(?:more|above|over)|&\s*above)/i;
/** Per-seat wording, which a fixed coupon (once per booking) must never use. */
const PER_SEAT_WORDING =
    /\bper[\s-]*(?:seat|person|head|ticket|guest|pax|participant|attendee)s?\b|\beach\b(?!\s+booking)|\bpp\b|\/\s*(?:seat|person|head|pax)\b/i;

type LabelAmount = { kind: "percent" | "rupees" | "threshold"; value: number };

/** The amounts a label states, in digits. Bare numbers without "off" ("2+ seats") are ignored. */
function labelAmounts(label: string): LabelAmount[] {
    const amounts: LabelAmount[] = [];
    for (const match of label.matchAll(LABEL_NUMBER)) {
        const value = Number(match[2].replace(/,/g, ""));
        if (match[3]) {
            amounts.push({ kind: "percent", value });
            continue;
        }
        const start = match.index ?? 0;
        const before = label.slice(0, start);
        const after = label.slice(start + match[0].length);
        const amountOff = AMOUNT_OFF_AFTER.test(after);
        if (!match[1] && !amountOff && !RUPEES_AFTER.test(after)) continue;
        const threshold =
            !amountOff && (THRESHOLD_BEFORE.test(before) || THRESHOLD_AFTER.test(after));
        amounts.push({ kind: threshold ? "threshold" : "rupees", value });
    }
    return amounts;
}

/**
 * True when an admin label misstates the coupon, judged from the amounts it gives in digits:
 * - a percentage on a fixed coupon, or a different percentage;
 * - an amount off ("₹200 off", "Rs. 200", "Flat 100 off") on a percentage coupon, or a
 *   different amount on a fixed one;
 * - a minimum order ("above ₹2,000", "₹2,000+", "orders of ₹2,000") other than the coupon's;
 * - per-seat wording ("per person", "each", "/seat") on a fixed coupon, which comes off once
 *   per booking.
 * A rupee amount counts as a minimum order only when introduced as one and not followed by
 * "off". Such a label is never shown (publicOfferFromCoupon falls back to the default); the
 * admin editor can warn with it. Prose amounts ("two hundred off") are not read.
 */
export function offerLabelConflicts(
    label: string,
    coupon: Pick<PricingCoupon, "discountType" | "discountValue" | "minOrderAmount">
): boolean {
    const value = Number(coupon.discountValue);
    const minOrder = Math.round(Number(coupon.minOrderAmount) || 0);
    const fixed = coupon.discountType === "fixed";
    for (const amount of labelAmounts(label)) {
        if (!(amount.value > 0)) return true;
        if (amount.kind === "percent") {
            if (fixed || amount.value !== value) return true;
        } else if (amount.kind === "threshold") {
            if (amount.value !== minOrder) return true;
        } else if (!fixed || amount.value !== Math.round(value)) {
            return true;
        }
    }
    return fixed && PER_SEAT_WORDING.test(label);
}

/**
 * True when a label contains the coupon's code, in any case: its letters and digits in order,
 * with at most one separator between them ("DIWALI10", "get-diwali10", "Diwali 10"), and not
 * inside a longer run of letters and digits ("WHATSAPP150" does not contain "WHATSAPP15").
 * The setting is publicly readable, so such a label leaks a hidden or community code: the admin
 * write path refuses it (findLabelsRevealingCodes in offers-server.ts), and
 * publicOfferFromCoupon never shows it (a listed offer shows its code anyway).
 */
export function offerLabelRevealsCode(label: string, code: string | null | undefined): boolean {
    const compact = String(code ?? "")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
    if (!compact) return false;
    const pattern = new RegExp(
        `(?:^|[^A-Z0-9])${compact.split("").join("[^A-Z0-9]?")}(?:[^A-Z0-9]|$)`
    );
    return pattern.test(String(label ?? "").toUpperCase());
}

/**
 * The labels in a "coupon_offers" value (stored or parsed form) that must not contain their
 * coupon's code: every entry except "listed" ones, since even a hidden entry's label is public.
 * Ids are lower-case. Entries without a uuid key or a label are skipped.
 */
export function offerLabelsToCheckForCodes(
    settingRaw: unknown
): Array<{ couponId: string; label: string }> {
    let value = settingRaw;
    if (typeof value === "string") {
        try {
            value = JSON.parse(value);
        } catch {
            return [];
        }
    }
    if (!isPlainObject(value)) return [];
    const labels: Array<{ couponId: string; label: string }> = [];
    for (const [couponId, entry] of Object.entries(value)) {
        if (!UUID_PATTERN.test(couponId) || !isPlainObject(entry)) continue;
        if (entry.visibility === "listed") continue;
        if (typeof entry.label !== "string" || !entry.label.trim()) continue;
        labels.push({ couponId: couponId.toLowerCase(), label: entry.label });
    }
    return labels;
}

/**
 * Coupon ids (lower-case) whose label in this "coupon_offers" value spells out the coupon's own
 * code, given the codes of those coupons. Pure half of findLabelsRevealingCodes.
 */
export function offerLabelsRevealingCodes(
    settingRaw: unknown,
    coupons: ReadonlyArray<{ id: string; code: string | null }>
): string[] {
    const codes = new Map<string, string | null>();
    for (const coupon of coupons) {
        if (coupon && typeof coupon.id === "string") {
            codes.set(coupon.id.toLowerCase(), coupon.code ?? null);
        }
    }
    return offerLabelsToCheckForCodes(settingRaw)
        .filter(({ couponId, label }) => offerLabelRevealsCode(label, codes.get(couponId)))
        .map(({ couponId }) => couponId);
}

/* -------------------------------------------------------------------------- */
/* Public offers                                                               */
/* -------------------------------------------------------------------------- */

/** One coupon as a PublicOffer, or null when it must not be shown. */
export function publicOfferFromCoupon(
    coupon: PricingCoupon,
    display: OfferDisplaySettings | undefined
): PublicOffer | null {
    if (!display || display.visibility === "hidden") return null;
    if (coupon.discountType !== "percentage" && coupon.discountType !== "fixed") return null;
    const discountValue = Number(coupon.discountValue);
    if (!Number.isFinite(discountValue) || discountValue <= 0) return null;

    const kind = display.visibility;
    const minGuests = display.minGuests && display.minGuests > 1 ? display.minGuests : null;
    const availableUntil = couponDisplayEndsAt(coupon);
    const minOrderAmount =
        coupon.minOrderAmount !== null && coupon.minOrderAmount !== undefined
            ? Number(coupon.minOrderAmount)
            : null;

    // An admin label is only a name; one that states another discount, or spells out a code
    // that is not listed, is never shown.
    const customLabel =
        display.label &&
        !offerLabelConflicts(display.label, coupon) &&
        (kind === "listed" || !offerLabelRevealsCode(display.label, coupon.code))
            ? display.label
            : "";

    return {
        id: coupon.id,
        kind,
        label:
            customLabel || defaultCouponLabel(kind, coupon.discountType, discountValue, minGuests),
        discountType: coupon.discountType,
        discountValue,
        minGuests,
        minOrderAmount: minOrderAmount && minOrderAmount > 0 ? minOrderAmount : null,
        startsAt: coupon.validFrom ?? null,
        availableUntil,
        endsAt: display.showEndDate ? availableUntil : null,
        code: kind === "listed" ? coupon.code : null,
        workshopIds: coupon.applicableWorkshopIds?.length
            ? [...coupon.applicableWorkshopIds]
            : null,
        categories: coupon.applicableCategories?.length ? [...coupon.applicableCategories] : null,
    };
}

/**
 * Builds the public offer list from coupons rows (select("*")) and the raw "coupon_offers"
 * value. Drops hidden, inactive, used-up, malformed and already-ended coupons, and auto or
 * listed ones close to their use cap (effectiveOfferDisplay). Never throws.
 */
export function buildPublicOffers(
    rows: unknown,
    settingRaw: unknown,
    now: PricingInstant
): PublicOffer[] {
    if (!Array.isArray(rows)) return [];
    const setting = parseCouponOffersSetting(settingRaw);
    const nowMs = toMs(now);
    const offers: PublicOffer[] = [];

    for (const row of rows) {
        const coupon = pricingCouponFromRow(row, setting);
        if (!coupon || coupon.isActive !== true) continue;
        if (
            coupon.maxUses !== null &&
            coupon.maxUses !== undefined &&
            (Number(coupon.usedCount) || 0) >= coupon.maxUses
        ) {
            continue;
        }
        const display = effectiveOfferDisplay(coupon, offerSettingsFor(setting, coupon.id));
        const offer = publicOfferFromCoupon(coupon, display);
        if (!offer) continue;
        // An end no Date can read ("infinity" from timestamptz) would show as "no end", but
        // checkout refuses the coupon (COUPON_INVALID): never show what is not charged.
        if (coupon.validUntil && offer.availableUntil === null) continue;
        const ends = isoMs(offer.availableUntil);
        if (ends !== null && ends < nowMs) continue;
        if (offer.startsAt && isoMs(offer.startsAt) === null) continue;
        offers.push(offer);
    }

    return offers.sort((a, b) => {
        if (KIND_ORDER[a.kind] !== KIND_ORDER[b.kind])
            return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
        const endA = isoMs(a.availableUntil) ?? Number.POSITIVE_INFINITY;
        const endB = isoMs(b.availableUntil) ?? Number.POSITIVE_INFINITY;
        if (endA !== endB) return endA < endB ? -1 : 1;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}

/**
 * The workshop's own Early Bird as a PublicOffer, while it applies. The value shown is the one
 * charged: the RPC clamps the discount to the subtotal, so a percentage shows at most 100% and
 * a fixed amount at most the seat price. Null when it saves nothing (e.g. a free workshop).
 */
export function earlyBirdOfferFor(
    workshop: PricingWorkshop,
    now: PricingInstant
): PublicOffer | null {
    const endsAt = activeEarlyBirdEndsAt(workshop, now);
    if (!endsAt) return null;
    const discountType = workshop.earlyBirdDiscountType === "fixed" ? "fixed" : "percentage";
    const configured = Math.max(0, Number(workshop.earlyBirdDiscountValue) || 0);
    const seatPrice = Math.max(0, Number(workshop.price) || 0);
    const discountValue = Math.min(configured, discountType === "fixed" ? seatPrice : 100);
    if (discountValue <= 0 || seatPrice <= 0) return null;
    const offer: PublicOffer = {
        id: `early-bird:${workshop.id}`,
        kind: "early_bird",
        label: "",
        discountType,
        discountValue,
        minGuests: null,
        minOrderAmount: null,
        startsAt: null,
        availableUntil: endsAt,
        endsAt,
        code: null,
        workshopIds: [String(workshop.id)],
        categories: null,
    };
    offer.label = `Early bird ${offerDiscountText(offer)}`;
    return offer;
}

function inScope(offer: PublicOffer, workshop: PricingWorkshop): boolean {
    if (offer.workshopIds?.length && !offer.workshopIds.includes(String(workshop.id))) {
        return false;
    }
    if (offer.categories?.length) {
        if (!workshop.category || !offer.categories.includes(workshop.category)) return false;
    }
    return true;
}

/**
 * A fixed offer as this workshop can actually give it: never more than the largest booking
 * (price x OFFER_MIN_GUESTS_MAX seats), since the discount is clamped to the subtotal. The
 * default label follows the capped value, and so does an admin label that names the amount.
 * Quotes are unchanged: no subtotal can exceed the cap.
 */
function cappedForWorkshop(offer: PublicOffer, workshop: PricingWorkshop): PublicOffer {
    if (offer.discountType !== "fixed" || offer.kind === "early_bird") return offer;
    const largestBooking = Math.max(0, Number(workshop.price) || 0) * OFFER_MIN_GUESTS_MAX;
    if (offer.discountValue <= largestBooking) return offer;
    const kind = offer.kind;
    const relabel =
        offer.label === defaultCouponLabel(kind, "fixed", offer.discountValue, offer.minGuests) ||
        offerLabelConflicts(offer.label, {
            discountType: "fixed",
            discountValue: largestBooking,
            minOrderAmount: offer.minOrderAmount,
        });
    return {
        ...offer,
        discountValue: largestBooking,
        label: relabel
            ? defaultCouponLabel(kind, "fixed", largestBooking, offer.minGuests)
            : offer.label,
    };
}

function isLive(offer: PublicOffer, nowMs: number): boolean {
    if (offer.startsAt) {
        const starts = isoMs(offer.startsAt);
        if (starts === null || starts > nowMs) return false;
    }
    const ends = isoMs(offer.availableUntil);
    return ends === null || ends >= nowMs;
}

/**
 * Offers that apply to this workshop at `now`: its Early Bird first, then the coupon offers in
 * scope (workshop and category) and inside their window. Early Bird offers passed in are
 * ignored and recomputed from the workshop, so they can never leak across workshops. A free
 * workshop gets none (nothing to discount), and a fixed amount larger than the largest
 * possible booking is shown at that largest booking (cappedForWorkshop).
 * Pass a stable server-provided instant before mount and the live clock after it. A workshop
 * whose bookings are closed (src/lib/workshop-availability.ts) shows no offers: do not call it.
 */
export function offersForWorkshop(
    offers: ReadonlyArray<PublicOffer> | null | undefined,
    workshop: PricingWorkshop,
    now: PricingInstant
): PublicOffer[] {
    const nowMs = toMs(now);
    const result: PublicOffer[] = [];
    const earlyBird = earlyBirdOfferFor(workshop, nowMs);
    if (earlyBird) result.push(earlyBird);
    if (!(Number(workshop.price) > 0)) return result;
    for (const offer of offers ?? []) {
        if (offer.kind === "early_bird") continue;
        if (inScope(offer, workshop) && isLive(offer, nowMs)) {
            result.push(cappedForWorkshop(offer, workshop));
        }
    }
    return result;
}

/**
 * The coupon behind a public offer, for quoting it with the shared pricing functions. Null for
 * Early Bird (part of every quote already). Use/limit counts are unknown here (the server
 * dropped used-up coupons); checkout re-validates the real row.
 */
export function pricingCouponFromOffer(offer: PublicOffer): PricingCoupon | null {
    if (offer.kind === "early_bird") return null;
    const availableUntil = isoMs(offer.availableUntil);
    return {
        id: offer.id,
        code: offer.code ?? "",
        discountType: offer.discountType,
        discountValue: offer.discountValue,
        minOrderAmount: offer.minOrderAmount,
        maxUses: null,
        usedCount: null,
        validFrom: offer.startsAt,
        // availableUntil is valid_until minus the grace; add it back so the shared rules
        // compute the same advertised end.
        validUntil:
            availableUntil === null
                ? null
                : new Date(availableUntil + OFFER_END_GRACE_MINUTES * 60 * 1000).toISOString(),
        applicableWorkshopIds: offer.workshopIds,
        applicableCategories: offer.categories,
        isActive: true,
        minGuests: offer.minGuests,
        advertised: true,
    };
}

/**
 * The card price for one guest: Early Bird plus the best "auto" offer with no seat minimum,
 * computed by the same quote as checkout (which picks among the same auto offers). Null when
 * nothing is actually discounted, so a card never shows a struck-through price without a real
 * discount. Used-up and nearly used-up auto offers never reach here (buildPublicOffers drops
 * them), and checkout skips them too (loadOfferCoupons applies effectiveOfferDisplay).
 * Pass a stable server-provided instant before mount and the live clock after it. A workshop
 * whose bookings are closed (src/lib/workshop-availability.ts) shows no offer: do not call it.
 */
export function cardOfferFor(
    workshop: PricingWorkshop,
    offers: ReadonlyArray<PublicOffer> | null | undefined,
    now: PricingInstant
): CardOffer | null {
    const nowMs = toMs(now);
    const applicable = offersForWorkshop(offers, workshop, nowMs);
    const autoOffers = applicable.filter(
        (offer) => offer.kind === "auto" && (offer.minGuests ?? 1) <= 1
    );

    const best = pickBestCoupon(autoOffers.map(pricingCouponFromOffer), {
        workshop,
        guests: 1,
        now: nowMs,
        purpose: "display",
    });
    const quote = computeQuote({
        workshop,
        guests: 1,
        coupon: best?.coupon ?? null,
        serviceFee: 0,
        now: nowMs,
        purpose: "display",
    });
    if (quote.savings <= 0 || quote.listSubtotal <= 0) return null;

    const earlyBird = applicable.find((offer) => offer.kind === "early_bird") ?? null;
    const coupon =
        quote.couponId && quote.couponDiscount > 0
            ? (autoOffers.find((offer) => offer.id === quote.couponId) ?? null)
            : null;

    type Part = { label: string; text: string; amount: number; end: number | null; shown: boolean };
    const parts: Part[] = [];
    if (earlyBird && quote.earlyBirdDiscount > 0) {
        parts.push({
            label: earlyBird.label,
            text: offerDiscountText(earlyBird),
            amount: quote.earlyBirdDiscount,
            end: isoMs(earlyBird.availableUntil),
            shown: true,
        });
    }
    if (coupon) {
        parts.push({
            label: coupon.label,
            text: offerDiscountText(coupon),
            amount: quote.couponDiscount,
            end: isoMs(coupon.availableUntil),
            shown: coupon.endsAt !== null,
        });
    }
    if (parts.length === 0) return null;

    const primary = parts.reduce((top, part) => (part.amount > top.amount ? part : top));
    const ending = parts.filter((part) => part.end !== null);
    let endsAt: string | null = null;
    let availableUntil: string | null = null;
    if (ending.length > 0) {
        const soonest = Math.min(...ending.map((part) => part.end as number));
        // The price is valid until the first discount in it ends, advertised or not.
        availableUntil = new Date(soonest).toISOString();
        // Only advertise the end when every discount that ends then may be advertised.
        if (ending.filter((part) => part.end === soonest).every((part) => part.shown)) {
            endsAt = availableUntil;
        }
    }

    return {
        listPrice: quote.listSubtotal,
        offerPrice: quote.subtotal,
        savings: quote.savings,
        label: primary.label,
        labels: parts.map((part) => part.label),
        discountText: parts.map((part) => part.text).join(" + "),
        endsAt,
        availableUntil,
        couponId: coupon ? coupon.id : null,
        perBooking: coupon !== null && coupon.discountType === "fixed",
    };
}
