/**
 * What the workshop page charges, computed with the same functions as checkout
 * (src/lib/pricing.ts, src/lib/offers.ts), so the price shown is the price charged:
 *
 *   list price x guests - the workshop's Early Bird - at most ONE coupon + service fee
 *
 * The coupon is chosen like checkout chooses it: the best of the "auto" offers and the code the
 * visitor applied (pickBestCoupon, the typed code winning ties). Pure and client-safe. Pass the
 * server render instant before mount and the live clock after it (hydration).
 */

import type { Workshop } from "@/lib/data";
import {
    cardOfferFor,
    offerDetailsText,
    offersForWorkshop,
    pricingCouponFromOffer,
    type CardOffer,
    type PublicOffer,
} from "@/lib/offers";
import {
    computeCouponDiscount,
    computeQuote,
    couponRejection,
    pickBestCoupon,
    type CouponRejection,
    type PricingCoupon,
    type PricingInstant,
    type PricingWorkshop,
    type Quote,
} from "@/lib/pricing";
import { formatCurrency } from "@/lib/utils";

/** The short line under "Bookings closed" (BOOKINGS_CLOSED_LABEL) on the workshop page. */
export const BOOKINGS_CLOSED_NOTE = "New bookings for this workshop are closed.";

/** A code the server accepted (POST /api/coupons/validate) for this workshop. */
export type AppliedCode = {
    /** Upper-case, as checkout reads it. */
    code: string;
    couponId: string;
    discountType: "percentage" | "fixed";
    discountValue: number;
    /** The guest count the server checked it for. */
    guests: number;
};

/**
 * - none: no code applied;
 * - checking: the guest count changed and a code with rules this page cannot see (a hidden code)
 *   is being checked again; it is left out of the price meanwhile;
 * - applied: the code is in the price;
 * - better_offer: the code is valid, but another offer saves more (one coupon per booking);
 * - rejected: the code does not apply to this booking (see `rejection`).
 */
export type CodeStatus = "none" | "checking" | "applied" | "better_offer" | "rejected";

/**
 * How an offer stands for the current booking:
 * - applied: part of the price;
 * - needs_seats / needs_order: a seat minimum or minimum order is not met yet;
 * - better_applied: valid, but a bigger offer is applied (one coupon per booking);
 * - available: a listed code or community teaser that is not applied.
 */
export type OfferRowStatus =
    | "applied"
    | "needs_seats"
    | "needs_order"
    | "better_applied"
    | "available";

export type OfferRow = {
    offer: PublicOffer;
    /** offerDetailsText: render it under the label. */
    details: string;
    status: OfferRowStatus;
    /**
     * Rupees this offer takes off this booking: what it saves while applied, what it would save
     * on its own otherwise (compare it with the applied offer's: one coupon per booking). Null
     * while its seat or order minimum is not met.
     */
    saves: number | null;
};

export type WorkshopPricing = {
    quote: Quote;
    /** Offers live at `now`, Early Bird first. Empty when bookings are closed. */
    offers: PublicOffer[];
    rows: OfferRow[];
    /** The coupon offer in the price (auto, listed or community), if it is a public one. */
    appliedOffer: PublicOffer | null;
    /** Name of the coupon line in the price breakdown, or null without one. */
    couponLabel: string | null;
    /** True when the coupon in the price is the visitor's code (it can be removed). */
    codeInPrice: boolean;
    code: { status: CodeStatus; rejection: CouponRejection | null };
    /**
     * The one-guest price after Early Bird and the best auto offer without a seat minimum: the
     * same figure the workshop cards show (cardOfferFor). Null when nothing is discounted.
     */
    headline: CardOffer | null;
};

const MISSING_CATEGORY = new Set(["", "null", "undefined"]);

/**
 * The fields pricing reads, from a mapped Workshop. mapWorkshopRowToWorkshop turns a NULL
 * category into the text "null": read that as no category, as checkout reads the row.
 */
export function toPricingWorkshop(
    workshop: Pick<
        Workshop,
        | "id"
        | "price"
        | "category"
        | "createdAt"
        | "earlyBirdEnabled"
        | "earlyBirdDiscountType"
        | "earlyBirdDiscountValue"
        | "earlyBirdDaysAfterListing"
    >
): PricingWorkshop {
    const category = typeof workshop.category === "string" ? workshop.category : "";
    return {
        id: String(workshop.id),
        price: Number(workshop.price) || 0,
        category: MISSING_CATEGORY.has(category.trim().toLowerCase()) ? null : category,
        createdAt: workshop.createdAt ?? null,
        earlyBirdEnabled: workshop.earlyBirdEnabled === true,
        earlyBirdDiscountType: workshop.earlyBirdDiscountType ?? null,
        earlyBirdDiscountValue: workshop.earlyBirdDiscountValue ?? null,
        earlyBirdDaysAfterListing: workshop.earlyBirdDaysAfterListing ?? null,
    };
}

function sameId(a: string | null | undefined, b: string | null | undefined) {
    return Boolean(a && b) && String(a).toLowerCase() === String(b).toLowerCase();
}

/**
 * The applied code as a coupon to price with. A code that belongs to a public offer (listed,
 * community or auto) takes that offer's rules (seat minimum, minimum order, advertised end), so
 * it needs no new server check when the guest count changes. Any other code only has what the
 * server answered: its discount, valid for the guest count it was checked for.
 */
export function codeCoupon(
    code: AppliedCode,
    offers: ReadonlyArray<PublicOffer>
): { coupon: PricingCoupon; offer: PublicOffer | null } {
    const offer =
        offers.find((item) => item.kind !== "early_bird" && sameId(item.id, code.couponId)) ?? null;
    const fromOffer = offer ? pricingCouponFromOffer(offer) : null;
    if (offer && fromOffer) {
        return { coupon: { ...fromOffer, code: code.code }, offer };
    }
    return {
        coupon: {
            id: code.couponId,
            code: code.code,
            discountType: code.discountType,
            discountValue: code.discountValue,
            isActive: true,
            advertised: false,
        },
        offer: null,
    };
}

/** True when the code's rules are only known for the guest count the server checked. */
export function codeNeedsRecheck(
    code: AppliedCode | null,
    offers: ReadonlyArray<PublicOffer>,
    guests: number
): boolean {
    if (!code) return false;
    return codeCoupon(code, offers).offer === null && code.guests !== guests;
}

export function priceWorkshop(input: {
    workshop: PricingWorkshop;
    guests: number;
    /** Offers for this workshop (from the server: offersForWorkshop), Early Bird included or not. */
    offers: ReadonlyArray<PublicOffer>;
    code: AppliedCode | null;
    serviceFee: number;
    now: PricingInstant;
    /** The admin "Bookings closed" switch: no offers and no code at all. */
    bookingsClosed?: boolean;
}): WorkshopPricing {
    const { workshop, guests, serviceFee, now } = input;
    const closed = input.bookingsClosed === true;
    const live = closed ? [] : offersForWorkshop(input.offers, workshop, now);
    const context = { workshop, guests, now, purpose: "display" as const };

    const autoCoupons = live
        .filter((offer) => offer.kind === "auto")
        .map(pricingCouponFromOffer)
        .filter((coupon): coupon is PricingCoupon => coupon !== null);

    let codeStatus: CodeStatus = "none";
    let codeRejection: CouponRejection | null = null;
    let codeCandidate: PricingCoupon | null = null;
    if (input.code && !closed) {
        if (codeNeedsRecheck(input.code, input.offers, guests)) {
            codeStatus = "checking";
        } else {
            const { coupon } = codeCoupon(input.code, input.offers);
            codeRejection = couponRejection(coupon, context);
            if (codeRejection) {
                codeStatus = "rejected";
            } else {
                codeCandidate = coupon;
            }
        }
    }

    const typed = codeCandidate;
    const candidates = typed
        ? [...autoCoupons.filter((coupon) => !sameId(coupon.id, typed.id)), typed]
        : autoCoupons;
    const best = pickBestCoupon(candidates, { ...context, typedCode: input.code?.code ?? null });
    const quote = computeQuote({
        workshop,
        guests,
        coupon: best?.coupon ?? null,
        serviceFee,
        now,
        purpose: "display",
    });

    const codeInPrice = Boolean(
        codeCandidate && quote.couponId && sameId(quote.couponId, codeCandidate.id)
    );
    if (codeCandidate) codeStatus = codeInPrice ? "applied" : "better_offer";

    const appliedOffer =
        quote.couponId && quote.couponDiscount > 0
            ? (live.find(
                  (offer) => offer.kind !== "early_bird" && sameId(offer.id, quote.couponId)
              ) ?? null)
            : null;
    const couponLabel =
        quote.couponDiscount > 0
            ? (appliedOffer?.label ?? (input.code ? `Code ${input.code.code}` : "Offer"))
            : null;

    const earlyBirdActive = quote.earlyBirdDiscount > 0;
    const rows: OfferRow[] = [];
    for (const offer of live) {
        const details = offerDetailsText(offer, {
            earlyBirdActive: earlyBirdActive && offer.kind !== "early_bird",
        });
        if (offer.kind === "early_bird") {
            if (earlyBirdActive) {
                rows.push({ offer, details, status: "applied", saves: quote.earlyBirdDiscount });
            }
            continue;
        }
        if (quote.couponDiscount > 0 && sameId(quote.couponId, offer.id)) {
            rows.push({ offer, details, status: "applied", saves: quote.couponDiscount });
            continue;
        }
        const coupon = pricingCouponFromOffer(offer);
        const rejection = coupon ? couponRejection(coupon, context) : "COUPON_INVALID";
        if (rejection === "COUPON_MIN_GUESTS_NOT_MET") {
            rows.push({ offer, details, status: "needs_seats", saves: null });
        } else if (rejection === "COUPON_MIN_ORDER_NOT_MET") {
            rows.push({ offer, details, status: "needs_order", saves: null });
        } else if (rejection || !coupon) {
            // Out of its window or scope at this instant: not an offer for this booking.
            continue;
        } else {
            // What this offer alone would take off this booking (after Early Bird).
            const saves = computeCouponDiscount(quote.subtotalAfterEarlyBird, coupon);
            if (offer.kind === "auto" || saves <= quote.couponDiscount) {
                // One coupon per booking: a valid one that is not in the price saves no more.
                rows.push({ offer, details, status: "better_applied", saves });
            } else {
                rows.push({ offer, details, status: "available", saves });
            }
        }
    }

    return {
        quote,
        offers: live,
        rows,
        appliedOffer,
        couponLabel,
        codeInPrice,
        code: { status: codeStatus, rejection: codeRejection },
        headline: closed ? null : cardOfferFor(workshop, input.offers, now),
    };
}

/**
 * The offer the page's Event markup (JSON-LD) may state: only a per-person discount, so that
 * `offers.price` is the price the page shows. A per-booking amount (a fixed coupon) has no honest
 * per-person price: the page shows the list price beside the offer's name, and so does the markup.
 */
export function eventMarkupOffer(headline: CardOffer | null): CardOffer | null {
    return headline && !headline.perBooking ? headline : null;
}

/** Why a code does not apply, in plain words. */
export function codeRejectionMessage(
    rejection: CouponRejection | null,
    rules: Pick<PricingCoupon, "minGuests" | "minOrderAmount"> | null = null
): string {
    switch (rejection) {
        case "COUPON_MIN_GUESTS_NOT_MET":
            return rules?.minGuests
                ? `This code is for bookings of ${rules.minGuests} or more seats.`
                : "This code needs more seats.";
        case "COUPON_MIN_ORDER_NOT_MET":
            return rules?.minOrderAmount
                ? `This code is for bookings of ${formatCurrency(rules.minOrderAmount)} or more (before service fee).`
                : "This booking is below the code's minimum order.";
        case "COUPON_EXPIRED":
            return "This offer has ended.";
        case "COUPON_NOT_YET_VALID":
            return "This offer has not started yet.";
        case "COUPON_WORKSHOP_MISMATCH":
        case "COUPON_CATEGORY_MISMATCH":
            return "This code is not valid for this workshop.";
        default:
            return "This code cannot be used for this booking.";
    }
}

/** "Ends 25 Oct, 11:30 pm IST": an offer end, in India time. Render after mount only. */
export function formatOfferEnd(iso: string | null): string | null {
    if (!iso) return null;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    const text = new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    }).format(date);
    return `Ends ${text} IST`;
}
