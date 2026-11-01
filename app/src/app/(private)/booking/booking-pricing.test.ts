import { describe, expect, it } from "vitest";
import { pricingCouponFromOffer, type PublicOffer } from "@/lib/offers";
import { computeQuote, type PricingWorkshop } from "@/lib/pricing";
import {
    buildBookingPrice,
    describePriceChange,
    parseCheckoutQuote,
    priceLinesFromServer,
    reconcileOrder,
    type BookingPriceLines,
} from "./booking-pricing";

const NOW = Date.parse("2026-10-24T06:00:00.000Z");
const IN_TWO_DAYS = new Date(NOW + 2 * 24 * 60 * 60 * 1000).toISOString();

const workshop: PricingWorkshop = {
    id: "pottery-1",
    price: 1999,
    category: "Pottery",
    createdAt: "2026-10-20T00:00:00.000Z",
    earlyBirdEnabled: false,
};

const earlyBirdWorkshop: PricingWorkshop = {
    ...workshop,
    earlyBirdEnabled: true,
    earlyBirdDiscountType: "percentage",
    earlyBirdDiscountValue: 10,
    earlyBirdDaysAfterListing: 10,
};

function offer(overrides: Partial<PublicOffer> & Pick<PublicOffer, "id" | "kind">): PublicOffer {
    return {
        label: "Offer",
        discountType: "percentage",
        discountValue: 10,
        minGuests: null,
        minOrderAmount: null,
        startsAt: null,
        availableUntil: IN_TWO_DAYS,
        endsAt: IN_TWO_DAYS,
        code: null,
        workshopIds: null,
        categories: null,
        ...overrides,
    };
}

const limitedTime = offer({ id: "c-auto", kind: "auto", label: "Diwali offer" });
const group = offer({
    id: "c-group",
    kind: "auto",
    label: "Group offer",
    discountType: "fixed",
    discountValue: 600,
    minGuests: 2,
});
const listed = offer({
    id: "c-listed",
    kind: "listed",
    label: "Weekend special",
    discountType: "fixed",
    discountValue: 150,
    code: "WEEKEND150",
});
const community = offer({
    id: "c-community",
    kind: "community",
    label: "Community price drop",
    discountType: "percentage",
    discountValue: 15,
});

function expectSameAsQuote(lines: BookingPriceLines, expected: ReturnType<typeof computeQuote>) {
    expect(lines.listSubtotal).toBe(expected.listSubtotal);
    expect(lines.earlyBirdDiscount).toBe(expected.earlyBirdDiscount);
    expect(lines.offerLine?.amount ?? 0).toBe(expected.couponDiscount);
    expect(lines.subtotal).toBe(expected.subtotal);
    expect(lines.serviceFee).toBe(expected.serviceFee);
    expect(lines.total).toBe(expected.total);
    expect(lines.savings).toBe(expected.savings);
}

describe("buildBookingPrice", () => {
    it("equals computeQuote with no offers", () => {
        const price = buildBookingPrice({
            workshop,
            guests: 2,
            offers: [],
            applied: null,
            serviceFee: 99,
            now: NOW,
        });
        expectSameAsQuote(price, computeQuote({ workshop, guests: 2, serviceFee: 99, now: NOW }));
        expect(price.total).toBe(1999 * 2 + 99);
        expect(price.savings).toBe(0);
        expect(price.offerLine).toBeNull();
    });

    it("applies the best auto offer, after Early Bird, exactly like computeQuote", () => {
        const price = buildBookingPrice({
            workshop: earlyBirdWorkshop,
            guests: 1,
            offers: [limitedTime, group],
            applied: null,
            serviceFee: 99,
            now: NOW,
        });
        const expected = computeQuote({
            workshop: earlyBirdWorkshop,
            guests: 1,
            coupon: pricingCouponFromOffer(limitedTime),
            serviceFee: 99,
            now: NOW,
        });
        expect(expected.earlyBirdDiscount).toBeGreaterThan(0);
        expectSameAsQuote(price, expected);
        expect(price.offerLine).toMatchObject({ label: "Diwali offer", code: null });
        // The group offer is not met with one seat: listed under "Available offers".
        expect(price.offerItems.map((item) => item.id)).toContain("c-group");
    });

    it("switches to the group offer when it saves more for more seats", () => {
        const price = buildBookingPrice({
            workshop,
            guests: 3,
            offers: [limitedTime, group],
            applied: null,
            serviceFee: 49,
            now: NOW,
        });
        // 10% of 5997 = 600 (rounded) vs a flat 600: tie broken by end date / id, same as server.
        const expected = computeQuote({
            workshop,
            guests: 3,
            coupon: pricingCouponFromOffer(
                price.offerLine?.couponId === "c-group" ? group : limitedTime
            ),
            serviceFee: 49,
            now: NOW,
        });
        expectSameAsQuote(price, expected);
    });

    it("prices a tapped listed code and hides it from the offers list", () => {
        const price = buildBookingPrice({
            workshop,
            guests: 1,
            offers: [listed, community],
            applied: {
                code: "WEEKEND150",
                id: "c-listed",
                discount: 150,
                type: "fixed",
            },
            serviceFee: 99,
            now: NOW,
        });
        expectSameAsQuote(
            price,
            computeQuote({
                workshop,
                guests: 1,
                coupon: pricingCouponFromOffer(listed),
                serviceFee: 99,
                now: NOW,
            })
        );
        expect(price.offerLine).toMatchObject({
            label: "Weekend special",
            code: "WEEKEND150",
            amount: 150,
        });
        expect(price.sendTypedCode).toBe(true);
        expect(price.offerItems.map((item) => item.id)).toEqual(["c-community"]);
    });

    it("explains a typed code that loses to a better auto offer", () => {
        const price = buildBookingPrice({
            workshop,
            guests: 1,
            offers: [limitedTime],
            applied: { code: "TINY10", id: "c-hidden", discount: 10, type: "fixed" },
            serviceFee: 99,
            now: NOW,
        });
        expect(price.offerLine?.couponId).toBe("c-auto");
        // Both amounts, so it is plain why: the auto offer saves more than the code.
        expect(price.typedCodeNote).toMatch(
            /^TINY10 is not used: Diwali offer saves you ₹\d+, more than the ₹10 this code saves\. One offer applies per booking\.$/
        );
    });

    it("keeps the fee and total unknown (never 99) until the settings say", () => {
        const price = buildBookingPrice({
            workshop,
            guests: 1,
            offers: [],
            applied: null,
            serviceFee: null,
            now: NOW,
        });
        expect(price.serviceFee).toBeNull();
        expect(price.total).toBeNull();
        expect(price.subtotal).toBe(1999);
    });

    it("drops an offer once its advertised end has passed", () => {
        const price = buildBookingPrice({
            workshop,
            guests: 1,
            offers: [limitedTime],
            applied: null,
            serviceFee: 0,
            now: Date.parse(IN_TWO_DAYS) + 1000,
        });
        expect(price.offerLine).toBeNull();
        expect(price.total).toBe(1999);
    });
});

describe("order_created reconciliation", () => {
    const shown = buildBookingPrice({
        workshop,
        guests: 2,
        offers: [limitedTime],
        applied: null,
        serviceFee: 99,
        now: NOW,
    });
    const serverQuote = {
        listSubtotal: shown.listSubtotal,
        earlyBirdDiscount: shown.earlyBirdDiscount,
        couponDiscount: shown.offerLine?.amount ?? 0,
        couponId: "c-auto",
        couponLabel: "Diwali offer",
        subtotal: shown.subtotal,
        serviceFee: 99,
        total: shown.total,
        savings: shown.savings,
    };

    it("is unchanged when Razorpay charges the total that was shown", () => {
        const result = reconcileOrder({
            shownTotal: shown.total,
            orderAmountPaise: (shown.total as number) * 100,
            quote: serverQuote,
        });
        expect(result.changed).toBe(false);
        expect(result.quote).toEqual(serverQuote);
        const lines = priceLinesFromServer(result, shown);
        expect(lines.total).toBe(shown.total);
        expect(lines.offerLine?.label).toBe("Diwali offer");
    });

    it("flags a different amount and renders the server's lines", () => {
        // The offer ended between the summary and the order.
        const quote = {
            ...serverQuote,
            couponDiscount: 0,
            couponId: null,
            couponLabel: null,
            subtotal: serverQuote.listSubtotal,
            total: serverQuote.listSubtotal + 99,
            savings: 0,
        };
        const result = reconcileOrder({
            shownTotal: shown.total,
            orderAmountPaise: quote.total * 100,
            quote,
        });
        expect(result.changed).toBe(true);
        expect(result.previousTotal).toBe(shown.total);
        const lines = priceLinesFromServer(result, shown);
        expect(lines.total).toBe(quote.total);
        expect(lines.offerLine).toBeNull();
        expect(lines.savings).toBe(0);
        expect(describePriceChange(shown, lines)).toBe("The offer no longer applies.");
    });

    it("follows the server's list price when the host changed it, and says so", () => {
        const plain = buildBookingPrice({
            workshop,
            guests: 2,
            offers: [],
            applied: null,
            serviceFee: 99,
            now: NOW,
        });
        // The server priced 2 seats at 2,200 each.
        const quote = {
            listSubtotal: 4400,
            earlyBirdDiscount: 0,
            couponDiscount: 0,
            couponId: null,
            couponLabel: null,
            subtotal: 4400,
            serviceFee: 99,
            total: 4499,
            savings: 0,
        };
        const result = reconcileOrder({
            shownTotal: plain.total,
            orderAmountPaise: 449_900,
            quote,
        });
        expect(result.changed).toBe(true);
        const lines = priceLinesFromServer(result, plain);
        // "price x seats" adds up to the list subtotal shown beside it.
        expect(lines.listUnitPrice).toBe(2200);
        expect(lines.listUnitPrice * lines.guests).toBe(lines.listSubtotal);
        expect(describePriceChange(plain, lines)).toBe("The workshop price changed.");
    });

    it("trusts the order amount over a quote that does not add up to it", () => {
        const result = reconcileOrder({
            shownTotal: shown.total,
            orderAmountPaise: 123_400,
            quote: serverQuote,
        });
        expect(result.changed).toBe(true);
        expect(result.quote).toBeNull();
        expect(priceLinesFromServer(result, shown).total).toBe(1234);
    });

    it("treats an unknown shown total as changed (fee was not known)", () => {
        const result = reconcileOrder({
            shownTotal: null,
            orderAmountPaise: (shown.total as number) * 100,
            quote: serverQuote,
        });
        expect(result.changed).toBe(true);
    });

    it("rejects malformed quotes", () => {
        expect(parseCheckoutQuote(null)).toBeNull();
        expect(parseCheckoutQuote({ ...serverQuote, total: "100" })).toBeNull();
        expect(parseCheckoutQuote({ ...serverQuote, total: serverQuote.total + 1 })).toBeNull();
    });
});
