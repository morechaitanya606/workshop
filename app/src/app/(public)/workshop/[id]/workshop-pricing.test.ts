import { describe, expect, it } from "vitest";
import {
    buildPublicOffers,
    cardOfferFor,
    effectiveOfferDisplay,
    offerSettingsFor,
    offersForWorkshop,
    parseCouponOffersSetting,
    pricingCouponFromOffer,
    pricingCouponFromRow,
    type PublicOffer,
} from "@/lib/offers";
import { computeQuote, pickBestCoupon, type PricingWorkshop } from "@/lib/pricing";
import {
    codeNeedsRecheck,
    eventMarkupOffer,
    priceWorkshop,
    toPricingWorkshop,
} from "./workshop-pricing";

const NOW = Date.parse("2026-10-24T06:00:00.000Z");
const FEE = 99;

const workshop: PricingWorkshop = {
    id: "pottery-1760000000000",
    price: 1999,
    category: "Art",
    createdAt: "2026-10-22T10:00:00.000Z",
    earlyBirdEnabled: true,
    earlyBirdDiscountType: "percentage",
    earlyBirdDiscountValue: 10,
    earlyBirdDaysAfterListing: 10,
};

function offer(partial: Partial<PublicOffer> & Pick<PublicOffer, "id" | "kind">): PublicOffer {
    return {
        label: "Offer",
        discountType: "percentage",
        discountValue: 10,
        minGuests: null,
        minOrderAmount: null,
        startsAt: null,
        availableUntil: "2026-10-30T18:00:00.000Z",
        endsAt: "2026-10-30T18:00:00.000Z",
        code: null,
        workshopIds: null,
        categories: null,
        ...partial,
    };
}

const auto10 = offer({
    id: "00000000-0000-4000-8000-000000000001",
    kind: "auto",
    label: "Limited-time 10% off",
});
const group15 = offer({
    id: "00000000-0000-4000-8000-000000000002",
    kind: "auto",
    label: "15% off on 3+ seats",
    discountValue: 15,
    minGuests: 3,
});
const listed300 = offer({
    id: "00000000-0000-4000-8000-000000000003",
    kind: "listed",
    label: "₹300 off per booking",
    discountType: "fixed",
    discountValue: 300,
    code: "SAVE300",
});
const community20 = offer({
    id: "00000000-0000-4000-8000-000000000004",
    kind: "community",
    label: "Community price drop",
    discountValue: 20,
});
const OFFERS = [auto10, group15, listed300, community20];

describe("priceWorkshop", () => {
    it("charges exactly what computeQuote charges for the same inputs", () => {
        for (const guests of [1, 2, 3, 5]) {
            const pricing = priceWorkshop({
                workshop,
                guests,
                offers: OFFERS,
                code: null,
                serviceFee: FEE,
                now: NOW,
            });
            const coupon = pricing.quote.couponId
                ? OFFERS.find((item) => item.id === pricing.quote.couponId)
                : null;
            const expected = computeQuote({
                workshop,
                guests,
                coupon: coupon ? pricingCouponFromOffer(coupon) : null,
                serviceFee: FEE,
                now: NOW,
                purpose: "display",
            });
            expect(pricing.quote).toEqual(expected);
            expect(pricing.quote.total).toBe(expected.subtotal + FEE);
        }
    });

    it("applies Early Bird and the best auto offer, and the group offer at its minimum", () => {
        const two = priceWorkshop({
            workshop,
            guests: 2,
            offers: OFFERS,
            code: null,
            serviceFee: FEE,
            now: NOW,
        });
        // 3998 - 399 (10% Early Bird, floored) = 3599; - 360 (10%, rounded) = 3239.
        expect(two.quote.earlyBirdDiscount).toBe(399);
        expect(two.quote.couponId).toBe(auto10.id);
        expect(two.quote.subtotal).toBe(3239);
        expect(two.quote.total).toBe(3239 + FEE);
        expect(two.quote.savings).toBe(3998 - 3239);
        const status = Object.fromEntries(two.rows.map((row) => [row.offer.id, row.status]));
        expect(status[`early-bird:${workshop.id}`]).toBe("applied");
        expect(status[auto10.id]).toBe("applied");
        expect(status[group15.id]).toBe("needs_seats");
        expect(status[listed300.id]).toBe("better_applied");
        expect(status[community20.id]).toBe("available");
        expect(two.rows.every((row) => typeof row.details === "string")).toBe(true);

        // What each offer takes off this booking, so the page can say why only one applies:
        // the applied ones their real saving, the others what they would save on their own.
        const saves = Object.fromEntries(two.rows.map((row) => [row.offer.id, row.saves]));
        expect(saves[`early-bird:${workshop.id}`]).toBe(399);
        expect(saves[auto10.id]).toBe(360);
        expect(saves[group15.id]).toBeNull();
        expect(saves[listed300.id]).toBe(300);
        expect(saves[community20.id]).toBe(720);
        // The applied coupon's saving is exactly what the quote takes off.
        expect(saves[auto10.id]).toBe(two.quote.couponDiscount);

        const three = priceWorkshop({
            workshop,
            guests: 3,
            offers: OFFERS,
            code: null,
            serviceFee: FEE,
            now: NOW,
        });
        expect(three.quote.couponId).toBe(group15.id);
        expect(three.couponLabel).toBe(group15.label);
    });

    it("prices a typed code with its offer's rules, and keeps the better offer", () => {
        const community = priceWorkshop({
            workshop,
            guests: 2,
            offers: OFFERS,
            code: {
                code: "WA20",
                couponId: community20.id,
                discountType: "percentage",
                discountValue: 20,
                guests: 2,
            },
            serviceFee: FEE,
            now: NOW,
        });
        expect(community.code.status).toBe("applied");
        expect(community.codeInPrice).toBe(true);
        expect(community.quote.couponDiscount).toBe(720);

        const listed = priceWorkshop({
            workshop,
            guests: 2,
            offers: OFFERS,
            code: {
                code: "SAVE300",
                couponId: listed300.id,
                discountType: "fixed",
                discountValue: 300,
                guests: 2,
            },
            serviceFee: FEE,
            now: NOW,
        });
        expect(listed.code.status).toBe("better_offer");
        expect(listed.quote.couponId).toBe(auto10.id);
    });

    it("re-checks a hidden code only when the guest count changes", () => {
        const hidden = {
            code: "SECRET",
            couponId: "00000000-0000-4000-8000-0000000000ff",
            discountType: "fixed" as const,
            discountValue: 100,
            guests: 2,
        };
        expect(codeNeedsRecheck(hidden, OFFERS, 2)).toBe(false);
        expect(codeNeedsRecheck(hidden, OFFERS, 3)).toBe(true);
        const pricing = priceWorkshop({
            workshop,
            guests: 3,
            offers: OFFERS,
            code: hidden,
            serviceFee: FEE,
            now: NOW,
        });
        expect(pricing.code.status).toBe("checking");
    });

    it("drops an offer once it has ended", () => {
        const after = Date.parse("2026-10-31T00:00:00.000Z");
        const pricing = priceWorkshop({
            workshop,
            guests: 2,
            offers: [auto10],
            code: null,
            serviceFee: FEE,
            now: after,
        });
        expect(pricing.quote.couponId).toBeNull();
        expect(pricing.rows.some((row) => row.offer.id === auto10.id)).toBe(false);
    });

    it("shows no offers, no code and no headline when bookings are closed", () => {
        const pricing = priceWorkshop({
            workshop,
            guests: 2,
            offers: OFFERS,
            code: {
                code: "WA20",
                couponId: community20.id,
                discountType: "percentage",
                discountValue: 20,
                guests: 2,
            },
            serviceFee: FEE,
            now: NOW,
            bookingsClosed: true,
        });
        expect(pricing.offers).toEqual([]);
        expect(pricing.rows).toEqual([]);
        expect(pricing.headline).toBeNull();
        expect(pricing.quote.couponDiscount).toBe(0);
        expect(pricing.code.status).toBe("none");
    });

    it("headline is the card price (cardOfferFor) for one guest", () => {
        const pricing = priceWorkshop({
            workshop,
            guests: 4,
            offers: OFFERS,
            code: null,
            serviceFee: FEE,
            now: NOW,
        });
        expect(pricing.headline).toEqual(cardOfferFor(workshop, OFFERS, NOW));
        const oneGuest = computeQuote({
            workshop,
            guests: 1,
            coupon: pricingCouponFromOffer(auto10),
            serviceFee: 0,
            now: NOW,
            purpose: "display",
        });
        expect(pricing.headline?.offerPrice).toBe(oneGuest.subtotal);
    });
});

/**
 * The page against checkout, with checkout's algorithm written out here from
 * handoff/core-api-final.md and run on the same database rows: candidates = every "auto" coupon
 * + the code the customer typed, pickBestCoupon (purpose "order", typed code wins ties), then
 * computeQuote. The page's own chain is the other way round: buildPublicOffers (server) ->
 * offersForWorkshop (render) -> priceWorkshop (browser, later clock).
 */
describe("the page charges what checkout charges", () => {
    const id = (n: number) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
    const [AUTO10, GROUP15, LISTED300, COMMUNITY20, HIDDEN25, BIG500] = [1, 2, 3, 4, 5, 6].map(id);

    function row(over: Record<string, unknown>) {
        return {
            id: id(99),
            code: "CODE",
            discount_type: "percentage",
            discount_value: 10,
            is_active: true,
            valid_from: null,
            valid_until: "2026-10-30T18:30:00.000Z",
            max_uses: null,
            used_count: 0,
            min_order_amount: null,
            applicable_workshop_ids: null,
            applicable_categories: null,
            ...over,
        } as Record<string, unknown> & { id: string; code: string };
    }

    const ROWS = [
        row({ id: AUTO10, code: "AUTO10" }),
        row({ id: GROUP15, code: "GROUP15", discount_value: 15 }),
        row({ id: LISTED300, code: "SAVE300", discount_type: "fixed", discount_value: 300 }),
        row({ id: COMMUNITY20, code: "WA20", discount_value: 20 }),
        // A hidden code: no display entry, valid long after the advertised offers end.
        row({
            id: HIDDEN25,
            code: "HIDDEN25",
            discount_value: 25,
            valid_until: "2027-01-01T00:00:00.000Z",
        }),
        row({
            id: BIG500,
            code: "BIG500",
            discount_type: "fixed",
            discount_value: 500,
            min_order_amount: 4000,
        }),
    ];
    const SETTING = {
        [AUTO10]: { visibility: "auto", show_end_date: true },
        [GROUP15]: { visibility: "auto", min_guests: 3 },
        [LISTED300]: { visibility: "listed" },
        [COMMUNITY20]: { visibility: "community" },
        [BIG500]: { visibility: "listed" },
    };
    const parsedSetting = parseCouponOffersSetting(SETTING);

    // The advertised end is 18:00Z (valid_until 18:30Z minus the 30 minute grace).
    const MOMENTS: Record<string, number> = {
        "at render time": NOW,
        "after the advertised end, before valid_until": Date.parse("2026-10-30T18:10:00.000Z"),
        "after valid_until": Date.parse("2026-10-30T18:31:00.000Z"),
    };
    const WORKSHOPS: Record<string, PricingWorkshop> = {
        "Early Bird 10%": workshop,
        "Early Bird ₹150 per seat": {
            ...workshop,
            earlyBirdDiscountType: "fixed",
            earlyBirdDiscountValue: 150,
        },
        "no Early Bird": { ...workshop, earlyBirdEnabled: false },
    };
    const TYPED = [null, ...ROWS];

    function checkoutQuote(
        w: PricingWorkshop,
        guests: number,
        typed: (typeof ROWS)[number] | null,
        now: number
    ) {
        const autoCoupons = ROWS.flatMap((candidate) => {
            const coupon = pricingCouponFromRow(candidate, parsedSetting);
            const display = coupon
                ? effectiveOfferDisplay(coupon, offerSettingsFor(parsedSetting, coupon.id))
                : undefined;
            return coupon && display?.visibility === "auto" ? [coupon] : [];
        });
        const typedCoupon = typed ? pricingCouponFromRow(typed, parsedSetting) : null;
        const pick = pickBestCoupon([...autoCoupons, typedCoupon], {
            workshop: w,
            guests,
            now,
            purpose: "order",
            typedCode: typed ? typed.code : null,
        });
        return computeQuote({
            workshop: w,
            guests,
            coupon: pick?.coupon ?? null,
            serviceFee: FEE,
            now,
            purpose: "order",
        });
    }

    for (const [workshopName, w] of Object.entries(WORKSHOPS)) {
        for (const [momentName, now] of Object.entries(MOMENTS)) {
            it(`${workshopName}, ${momentName}: 1 to 8 guests, with and without a typed code`, () => {
                // What the server sent when it built the page (a minute-old render at most).
                const serverOffers = offersForWorkshop(
                    buildPublicOffers(ROWS, SETTING, NOW),
                    w,
                    NOW
                );
                for (let guests = 1; guests <= 8; guests += 1) {
                    for (const typed of TYPED) {
                        const page = priceWorkshop({
                            workshop: w,
                            guests,
                            offers: serverOffers,
                            code: typed
                                ? {
                                      code: typed.code,
                                      couponId: typed.id,
                                      discountType: typed.discount_type as "percentage" | "fixed",
                                      discountValue: Number(typed.discount_value),
                                      guests,
                                  }
                                : null,
                            serviceFee: FEE,
                            now,
                        }).quote;
                        const charged = checkoutQuote(w, guests, typed, now);
                        const where = `${guests} guest(s), code ${typed?.code ?? "none"}`;
                        expect(page.couponId, where).toBe(charged.couponId);
                        expect(page.earlyBirdDiscount, where).toBe(charged.earlyBirdDiscount);
                        expect(page.couponDiscount, where).toBe(charged.couponDiscount);
                        expect(page.subtotal, where).toBe(charged.subtotal);
                        expect(page.total, where).toBe(charged.total);
                    }
                }
            });
        }
    }

    it("really prices something in this matrix (not zero everywhere)", () => {
        const serverOffers = offersForWorkshop(
            buildPublicOffers(ROWS, SETTING, NOW),
            workshop,
            NOW
        );
        const two = priceWorkshop({
            workshop,
            guests: 2,
            offers: serverOffers,
            code: null,
            serviceFee: FEE,
            now: NOW,
        }).quote;
        const three = priceWorkshop({
            workshop,
            guests: 3,
            offers: serverOffers,
            code: {
                code: "HIDDEN25",
                couponId: HIDDEN25,
                discountType: "percentage",
                discountValue: 25,
                guests: 3,
            },
            serviceFee: FEE,
            now: NOW,
        }).quote;
        expect(two.earlyBirdDiscount).toBeGreaterThan(0);
        expect(two.couponDiscount).toBeGreaterThan(0);
        expect(three.couponId).toBe(HIDDEN25);
    });
});

describe("eventMarkupOffer", () => {
    it("states a per-person discount, and none for a per-booking amount or no offer", () => {
        const perSeat = cardOfferFor(workshop, [auto10], NOW);
        expect(perSeat?.perBooking).toBe(false);
        expect(eventMarkupOffer(perSeat)).toBe(perSeat);

        const flat = offer({
            id: "00000000-0000-4000-8000-000000000009",
            kind: "auto",
            label: "₹200 off per booking",
            discountType: "fixed",
            discountValue: 200,
        });
        const perBooking = cardOfferFor(workshop, [flat], NOW);
        expect(perBooking?.perBooking).toBe(true);
        expect(eventMarkupOffer(perBooking)).toBeNull();

        expect(eventMarkupOffer(null)).toBeNull();
    });
});

describe("toPricingWorkshop", () => {
    it("reads the mapped 'null' category as no category", () => {
        const mapped = toPricingWorkshop({
            id: "x-1",
            price: 500,
            category: "null",
            createdAt: undefined,
            earlyBirdEnabled: undefined,
            earlyBirdDiscountType: undefined,
            earlyBirdDiscountValue: undefined,
            earlyBirdDaysAfterListing: undefined,
        } as unknown as Parameters<typeof toPricingWorkshop>[0]);
        expect(mapped.category).toBeNull();
        expect(mapped.earlyBirdEnabled).toBe(false);
    });
});
