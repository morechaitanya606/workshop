/**
 * The booking page's price, computed by the one pricing module (src/lib/pricing.ts) the way
 * checkout computes it: list subtotal, minus Early Bird, minus ONE coupon (the best of the
 * workshop's auto offers and the customer's typed code, pickBestCoupon with purpose "order"),
 * plus the service fee. Once checkout has created the Razorpay order, its quote replaces this
 * (reconcileOrder): that is the amount Razorpay charges.
 *
 * Pure and client-safe. Pass the live clock (nowMs, read after mount).
 */

import type { CheckoutQuote } from "@/lib/api-client";
import {
    offerDetailsText,
    offersForWorkshop,
    pricingCouponFromOffer,
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
import type { AppliedCoupon } from "./types";

export type BookingOfferLine = {
    couponId: string | null;
    /** The offer's name ("Diwali offer"), or the typed code for a hidden code. */
    label: string;
    amount: number;
    /** The customer's own code when this line is it (it can then be removed). */
    code: string | null;
    /** Advertised end, when the offer shows one. Render after mount. */
    endsAt: string | null;
};

/** What the order summary, the mobile bar and the Pay button render. */
export type BookingPriceLines = {
    listUnitPrice: number;
    guests: number;
    listSubtotal: number;
    earlyBirdDiscount: number;
    /** When the Early Bird ends, while it applies. Render after mount. */
    earlyBirdEndsAt: string | null;
    offerLine: BookingOfferLine | null;
    /** Null while the fee is unknown: the summary shows a placeholder, never a guess. */
    serviceFee: number | null;
    /** After every discount, before the service fee. */
    subtotal: number;
    /** Null while the service fee is unknown. */
    total: number | null;
    /** listSubtotal - subtotal (Early Bird + offer). Never includes the fee. */
    savings: number;
};

export type BookingOfferItem = {
    id: string;
    kind: "auto" | "listed" | "community";
    label: string;
    /** offerDetailsText: the discount with its unit and every condition. */
    details: string;
    /** Listed offers only: one tap applies it. */
    code: string | null;
    /** Advertised end. Render after mount. */
    endsAt: string | null;
};

export type BookingPrice = BookingPriceLines & {
    quote: Quote;
    /** Why the typed code does not apply by its own rules, or null. */
    typedRejection: CouponRejection | null;
    /** A line for the customer about their typed code when it is not part of the price. */
    typedCodeNote: string | null;
    /** Send the typed code to checkout (it applies by its own rules, even if not the best). */
    sendTypedCode: boolean;
    /**
     * "Available offers" that are not already in the price: listed coupons (one-tap Apply), the
     * community teaser (its code is shared in the WhatsApp community) and auto offers this
     * booking does not meet yet (a group offer, a minimum order).
     */
    offerItems: BookingOfferItem[];
};

export type BookingPriceInput = {
    workshop: PricingWorkshop;
    guests: number;
    /** Coupon offers from GET /api/offers (no Early Bird). */
    offers: ReadonlyArray<PublicOffer>;
    applied: AppliedCoupon | null;
    /** From the platform settings, or null when unknown. */
    serviceFee: number | null;
    now: PricingInstant;
};

/**
 * The typed code as a PricingCoupon. When it is one of the public offers (matched by the id the
 * validate route returned), the offer's rules apply (seat minimum, minimum order, advertised
 * end), as pricingCouponFromRow gives checkout. Otherwise it is a hidden code that the server
 * has just validated for this workshop: no scope limits are known client-side, and a seat count
 * change re-validates it.
 */
export function pricingCouponFromApplied(
    applied: AppliedCoupon,
    offers: ReadonlyArray<PublicOffer>
): PricingCoupon {
    const offer = applied.id
        ? offers.find((item) => item.kind !== "early_bird" && item.id === applied.id)
        : undefined;
    const fromOffer = offer ? pricingCouponFromOffer(offer) : null;
    if (fromOffer) return { ...fromOffer, code: applied.code };

    return {
        id: applied.id || `code:${applied.code}`,
        code: applied.code,
        discountType: applied.type,
        discountValue: Number(applied.discount) || 0,
        minOrderAmount: applied.minOrderAmount ?? null,
        maxUses: null,
        usedCount: null,
        validFrom: null,
        validUntil: null,
        applicableWorkshopIds: null,
        applicableCategories: null,
        isActive: true,
        minGuests: applied.minGuests ?? null,
        advertised: false,
    };
}

/** Plain words for a coupon that does not apply. */
export function couponRejectionText(
    rejection: CouponRejection,
    coupon: Pick<PricingCoupon, "minGuests" | "minOrderAmount">
): string {
    switch (rejection) {
        case "COUPON_MIN_GUESTS_NOT_MET":
            return `Valid for ${Number(coupon.minGuests) || 2} or more seats.`;
        case "COUPON_MIN_ORDER_NOT_MET":
            return `Valid on bookings of ${formatCurrency(
                Number(coupon.minOrderAmount) || 0
            )} or more (before service fee).`;
        case "COUPON_EXPIRED":
            return "This offer has ended.";
        case "COUPON_NOT_YET_VALID":
            return "This offer has not started yet.";
        default:
            return "This code does not apply to this booking.";
    }
}

/** The booking's price now, exactly as checkout will quote it (see the module header). */
export function buildBookingPrice(input: BookingPriceInput): BookingPrice {
    const { workshop, guests, now } = input;
    const applicableOffers = offersForWorkshop(input.offers, workshop, now);
    const autoOffers = applicableOffers.filter((offer) => offer.kind === "auto");
    const autoCoupons = autoOffers
        .map(pricingCouponFromOffer)
        .filter((coupon): coupon is PricingCoupon => coupon !== null);

    const typed = input.applied ? pricingCouponFromApplied(input.applied, input.offers) : null;
    const context = { workshop, guests, now, purpose: "order" as const };
    const typedRejection = typed ? couponRejection(typed, context) : null;

    const best = pickBestCoupon([...autoCoupons, typed], {
        ...context,
        typedCode: input.applied?.code ?? null,
    });
    const quote = computeQuote({
        workshop,
        guests,
        coupon: best?.coupon ?? null,
        serviceFee: input.serviceFee ?? 0,
        now,
        purpose: "order",
    });

    let offerLine: BookingOfferLine | null = null;
    if (best && quote.couponId && quote.couponDiscount > 0) {
        const isTyped = best.coupon === typed;
        const offer = isTyped
            ? input.offers.find((item) => item.id === input.applied?.id)
            : autoOffers.find((item) => item.id === quote.couponId);
        offerLine = {
            couponId: quote.couponId,
            label:
                offer?.label ||
                (isTyped ? input.applied?.label || input.applied?.code : null) ||
                "Offer",
            amount: quote.couponDiscount,
            code: isTyped ? (input.applied?.code ?? null) : null,
            endsAt: offer?.endsAt ?? null,
        };
    }

    let typedCodeNote: string | null = null;
    if (typed && input.applied) {
        if (typedRejection) {
            typedCodeNote = `${input.applied.code}: ${couponRejectionText(typedRejection, typed)}`;
        } else if (!best) {
            typedCodeNote = `${input.applied.code} does not lower the price of this booking.`;
        } else if (best.coupon !== typed && offerLine) {
            // Both amounts, so it is plain why the code is not used: the other offer saves more.
            const typedSaves = computeCouponDiscount(quote.subtotalAfterEarlyBird, typed);
            typedCodeNote = `${input.applied.code} is not used: ${offerLine.label} saves you ${formatCurrency(offerLine.amount)}, more than the ${formatCurrency(typedSaves)} this code saves. One offer applies per booking.`;
        }
    }

    const offerItems: BookingOfferItem[] = [];
    const earlyBirdActive = quote.earlyBirdDiscount > 0;
    for (const offer of applicableOffers) {
        if (offer.kind === "early_bird" || offer.id === quote.couponId) continue;
        if (input.applied?.id && offer.id === input.applied.id) continue;
        if (offer.kind === "auto") {
            const coupon = pricingCouponFromOffer(offer);
            const rejection = coupon ? couponRejection(coupon, context) : null;
            // An auto offer that applies but saves less than the one in the price is noise.
            if (
                rejection !== "COUPON_MIN_GUESTS_NOT_MET" &&
                rejection !== "COUPON_MIN_ORDER_NOT_MET"
            ) {
                continue;
            }
        }
        offerItems.push({
            id: offer.id,
            kind: offer.kind,
            label: offer.label,
            details: offerDetailsText(offer, { earlyBirdActive }),
            code: offer.kind === "listed" ? offer.code : null,
            endsAt: offer.endsAt,
        });
    }

    const serviceFee = input.serviceFee === null ? null : quote.serviceFee;

    return {
        listUnitPrice: quote.listUnitPrice,
        guests: quote.guests,
        listSubtotal: quote.listSubtotal,
        earlyBirdDiscount: quote.earlyBirdDiscount,
        earlyBirdEndsAt: quote.earlyBirdDiscount > 0 ? quote.earlyBirdEndsAt : null,
        offerLine,
        serviceFee,
        subtotal: quote.subtotal,
        total: serviceFee === null ? null : quote.total,
        savings: quote.savings,
        quote,
        typedRejection,
        typedCodeNote,
        sendTypedCode: Boolean(typed) && !typedRejection,
        offerItems,
    };
}

/* -------------------------------------------------------------------------- */
/* The server's quote                                                          */
/* -------------------------------------------------------------------------- */

export function toPaise(rupees: number): number {
    return Math.round(rupees * 100);
}

function wholeRupees(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * The `quote` of an order_created answer, or null when it is missing or does not add up (the
 * page then trusts the order amount alone).
 */
export function parseCheckoutQuote(raw: unknown): CheckoutQuote | null {
    if (!raw || typeof raw !== "object") return null;
    const value = raw as Record<string, unknown>;
    const listSubtotal = wholeRupees(value.listSubtotal);
    const earlyBirdDiscount = wholeRupees(value.earlyBirdDiscount);
    const couponDiscount = wholeRupees(value.couponDiscount);
    const subtotal = wholeRupees(value.subtotal);
    const serviceFee = wholeRupees(value.serviceFee);
    const total = wholeRupees(value.total);
    if (
        listSubtotal === null ||
        earlyBirdDiscount === null ||
        couponDiscount === null ||
        subtotal === null ||
        serviceFee === null ||
        total === null
    ) {
        return null;
    }
    if (subtotal + serviceFee !== total) return null;
    if (Math.max(0, listSubtotal - earlyBirdDiscount - couponDiscount) !== subtotal) return null;

    const label =
        typeof value.couponLabel === "string" && value.couponLabel.trim()
            ? value.couponLabel.trim().slice(0, 80)
            : null;
    return {
        listSubtotal,
        earlyBirdDiscount,
        couponDiscount,
        couponId: typeof value.couponId === "string" && value.couponId ? value.couponId : null,
        couponLabel: label,
        subtotal,
        serviceFee,
        total,
        savings: listSubtotal - subtotal,
    };
}

export type OrderReconciliation = {
    /** True when what Razorpay will charge is not the total the customer was shown. */
    changed: boolean;
    /** What Razorpay will charge, in rupees. */
    total: number;
    /** The server's breakdown, when it sent one that adds up to the charged amount. */
    quote: CheckoutQuote | null;
    /** The total that was shown (null: it was not known yet). */
    previousTotal: number | null;
};

/**
 * Compares an order_created answer with the total the customer saw when they tapped Pay. The
 * order amount (paise) is what Razorpay charges, so it always wins; the quote is used for the
 * line items only when it adds up to that amount.
 */
export function reconcileOrder(params: {
    shownTotal: number | null;
    orderAmountPaise: number;
    quote: unknown;
}): OrderReconciliation {
    const parsed = parseCheckoutQuote(params.quote);
    const quote = parsed && toPaise(parsed.total) === params.orderAmountPaise ? parsed : null;
    return {
        changed:
            params.shownTotal === null || toPaise(params.shownTotal) !== params.orderAmountPaise,
        total: params.orderAmountPaise / 100,
        quote,
        previousTotal: params.shownTotal,
    };
}

/** The summary lines for an order the server has priced (its quote is the truth). */
export function priceLinesFromServer(
    reconciliation: OrderReconciliation,
    local: BookingPriceLines
): BookingPriceLines {
    const quote = reconciliation.quote;
    if (!quote) {
        // No usable breakdown: keep the local lines but never show a total Razorpay will not
        // charge. A fee that is not known stays a placeholder.
        return { ...local, total: reconciliation.total };
    }
    const sameCoupon =
        local.offerLine !== null &&
        quote.couponId !== null &&
        local.offerLine.couponId === quote.couponId;
    // The per-seat line follows the server's list price (the host may have changed it since the
    // page loaded), so "price x seats" always adds up to the list subtotal beside it.
    const serverUnitPrice = local.guests > 0 ? quote.listSubtotal / local.guests : Number.NaN;
    return {
        listUnitPrice: Number.isInteger(serverUnitPrice) ? serverUnitPrice : local.listUnitPrice,
        guests: local.guests,
        listSubtotal: quote.listSubtotal,
        earlyBirdDiscount: quote.earlyBirdDiscount,
        earlyBirdEndsAt: quote.earlyBirdDiscount > 0 ? local.earlyBirdEndsAt : null,
        offerLine:
            quote.couponDiscount > 0
                ? {
                      couponId: quote.couponId,
                      label:
                          quote.couponLabel ||
                          (sameCoupon ? local.offerLine?.label : null) ||
                          "Offer",
                      amount: quote.couponDiscount,
                      code: sameCoupon ? (local.offerLine?.code ?? null) : null,
                      endsAt: sameCoupon ? (local.offerLine?.endsAt ?? null) : null,
                  }
                : null,
        serviceFee: quote.serviceFee,
        subtotal: quote.subtotal,
        total: quote.total,
        savings: quote.savings,
    };
}

/** Why the server's total differs from the one shown, in plain words ("" when unknown). */
export function describePriceChange(shown: BookingPriceLines, server: BookingPriceLines): string {
    const reasons: string[] = [];
    if (server.listSubtotal !== shown.listSubtotal) {
        reasons.push("the workshop price changed");
    }
    if (server.earlyBirdDiscount < shown.earlyBirdDiscount) {
        reasons.push("the Early Bird offer has ended");
    } else if (server.earlyBirdDiscount > shown.earlyBirdDiscount) {
        reasons.push("an Early Bird offer now applies");
    }
    const shownOffer = shown.offerLine?.amount ?? 0;
    const serverOffer = server.offerLine?.amount ?? 0;
    if (serverOffer < shownOffer) {
        reasons.push(serverOffer > 0 ? "a smaller offer applies" : "the offer no longer applies");
    } else if (serverOffer > shownOffer) {
        reasons.push("a better offer now applies");
    }
    if (shown.serviceFee === null && server.serviceFee !== null) {
        reasons.push(`it includes the ${formatCurrency(server.serviceFee)} service fee`);
    } else if (server.serviceFee !== null && server.serviceFee !== shown.serviceFee) {
        reasons.push("the service fee changed");
    }
    if (reasons.length === 0) return "";
    const text = reasons.join(", and ");
    return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

const OFFER_END_FORMAT = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
});

/** "26 Oct, 5:30 am" in India time, or "" for an unreadable instant. Render after mount. */
export function formatOfferEnd(iso: string | null | undefined): string {
    if (!iso) return "";
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? "" : OFFER_END_FORMAT.format(date);
}
