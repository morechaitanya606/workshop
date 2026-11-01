import { describe, expect, it } from "vitest";

import { buildBookingPrice } from "@/app/(private)/booking/booking-pricing";
import { priceWorkshop } from "@/app/(public)/workshop/[id]/workshop-pricing";
import {
    buildPublicOffers,
    cardOfferFor,
    effectiveOfferDisplay,
    offerSettingsFor,
    parseCouponOffersSetting,
    pricingCouponFromRow,
} from "@/lib/offers";
import {
    computeQuote,
    pickBestCoupon,
    type PricingCoupon,
    type PricingWorkshop,
} from "@/lib/pricing";

/**
 * One workshop with Early Bird + an automatic limited-time 10% + a listed code + a group offer
 * + a hidden code. The price must be the same number on the card, the workshop page, /booking,
 * the checkout order (purpose "order") and the confirmation (purpose "confirm"): the customer
 * is only ever charged what they were shown.
 */

const NOW = new Date("2026-10-23T10:00:00.000Z");
const SERVICE_FEE = 99;

const ID_AUTO = "11111111-1111-4111-8111-111111111111";
const ID_LISTED = "22222222-2222-4222-8222-222222222222";
const ID_GROUP = "33333333-3333-4333-8333-333333333333";
const ID_HIDDEN = "44444444-4444-4444-8444-444444444444";

const workshop: PricingWorkshop = {
    id: "pottery-1",
    price: 1000,
    category: "Art",
    createdAt: "2026-10-22T05:00:00Z",
    earlyBirdEnabled: true,
    earlyBirdDiscountType: "percentage",
    earlyBirdDiscountValue: 10,
    earlyBirdDaysAfterListing: 3,
};

function row(overrides: Record<string, unknown>) {
    return {
        id: ID_AUTO,
        code: "AUTO10",
        discount_type: "percentage",
        discount_value: 10,
        min_order_amount: 0,
        max_uses: null,
        used_count: 0,
        valid_from: "2026-10-01T00:00:00+00:00",
        valid_until: "2026-10-30T12:00:00+00:00",
        applicable_workshop_ids: null,
        applicable_categories: null,
        is_active: true,
        created_by: "admin-1",
        created_at: "2026-10-01T00:00:00+00:00",
        updated_at: null,
        ...overrides,
    };
}

const rows = [
    row({ id: ID_AUTO, code: "AUTO10" }),
    row({
        id: ID_LISTED,
        code: "DIWALI200",
        discount_type: "fixed",
        discount_value: 200,
        valid_until: null,
    }),
    row({ id: ID_GROUP, code: "GROUP15", discount_value: 15, valid_until: null }),
    row({ id: ID_HIDDEN, code: "SECRET25", discount_value: 25, valid_until: null }),
];

const settingRaw = {
    [ID_AUTO]: { visibility: "auto", label: "Limited-time 10% off" },
    [ID_LISTED]: { visibility: "listed", label: "Diwali offer" },
    [ID_GROUP]: { visibility: "auto", label: "Group offer", min_guests: 3 },
    [ID_HIDDEN]: { visibility: "hidden" },
};

const setting = parseCouponOffersSetting(settingRaw);
const publicOffers = buildPublicOffers(rows, settingRaw, NOW);

type Typed = { id: string; code: string; type: "percentage" | "fixed"; value: number } | null;

const TYPED_CODES: Array<{ name: string; typed: Typed }> = [
    { name: "no code", typed: null },
    {
        name: "listed fixed code",
        typed: { id: ID_LISTED, code: "DIWALI200", type: "fixed", value: 200 },
    },
    {
        name: "hidden percentage code",
        typed: { id: ID_HIDDEN, code: "SECRET25", type: "percentage", value: 25 },
    },
];

/** What /api/bookings/checkout does: auto offers + the typed code, best one, then confirm. */
function checkoutQuotes(guests: number, typed: Typed) {
    const auto: PricingCoupon[] = [];
    for (const item of rows) {
        const coupon = pricingCouponFromRow(item, setting);
        if (!coupon) continue;
        const display = effectiveOfferDisplay(coupon, offerSettingsFor(setting, coupon.id));
        if (display?.visibility === "auto") auto.push(coupon);
    }
    const typedRow = typed ? rows.find((item) => item.code === typed.code) : undefined;
    const typedCoupon = typedRow ? pricingCouponFromRow(typedRow, setting) : null;

    const context = { workshop, guests, now: NOW, purpose: "order" as const };
    const best = pickBestCoupon(typedCoupon ? [...auto, typedCoupon] : auto, {
        ...context,
        typedCode: typed?.code ?? null,
    });
    const coupon = best?.coupon ?? null;
    return {
        order: computeQuote({ workshop, guests, coupon, serviceFee: SERVICE_FEE, now: NOW }),
        confirm: computeQuote({
            workshop,
            guests,
            coupon,
            serviceFee: SERVICE_FEE,
            now: NOW,
            purpose: "confirm",
        }),
    };
}

describe("one price on every surface", () => {
    for (const { name, typed } of TYPED_CODES) {
        for (let guests = 1; guests <= 6; guests++) {
            it(`${name}, ${guests} guest(s): page = booking = checkout = confirm`, () => {
                const page = priceWorkshop({
                    workshop,
                    guests,
                    offers: publicOffers,
                    code: typed
                        ? {
                              code: typed.code,
                              couponId: typed.id,
                              discountType: typed.type,
                              discountValue: typed.value,
                              guests,
                          }
                        : null,
                    serviceFee: SERVICE_FEE,
                    now: NOW,
                }).quote;

                const booking = buildBookingPrice({
                    workshop,
                    guests,
                    offers: publicOffers,
                    applied: typed
                        ? {
                              code: typed.code,
                              id: typed.id,
                              discount: typed.value,
                              type: typed.type,
                          }
                        : null,
                    serviceFee: SERVICE_FEE,
                    now: NOW,
                });

                const server = checkoutQuotes(guests, typed);

                expect(page.total).toBe(server.order.total);
                expect(booking.quote.total).toBe(server.order.total);
                expect(booking.total).toBe(server.order.total);
                expect(page.subtotal).toBe(server.order.subtotal);
                expect(booking.subtotal).toBe(server.order.subtotal);
                expect(page.couponId).toBe(server.order.couponId);
                expect(booking.quote.couponId).toBe(server.order.couponId);

                // The RPC confirms with the same coupon and the same amounts.
                expect(server.confirm.total).toBe(server.order.total);
                expect(server.confirm.couponDiscount).toBe(server.order.couponDiscount);
                expect(server.confirm.earlyBirdDiscount).toBe(server.order.earlyBirdDiscount);

                // The fee is added once and never discounted.
                expect(server.order.total).toBe(server.order.subtotal + SERVICE_FEE);
            });
        }
    }

    it("the group offer only applies from 3 guests", () => {
        expect(checkoutQuotes(2, null).order.couponId).toBe(ID_AUTO);
        expect(checkoutQuotes(3, null).order.couponId).toBe(ID_GROUP);
    });

    it("the card shows the one-guest price the page and checkout charge before the fee", () => {
        const card = cardOfferFor(workshop, publicOffers, NOW);
        expect(card).not.toBeNull();
        const oneGuest = checkoutQuotes(1, null).order;
        expect(card?.listPrice).toBe(workshop.price);
        expect(card?.offerPrice).toBe(oneGuest.subtotal);
        expect(card?.savings).toBe(workshop.price - oneGuest.subtotal);
    });

    it("a hidden code never appears in the public offers", () => {
        expect(publicOffers.some((offer) => offer.id === ID_HIDDEN)).toBe(false);
        expect(JSON.stringify(publicOffers)).not.toContain("SECRET25");
        expect(JSON.stringify(publicOffers)).not.toContain("GROUP15");
        expect(JSON.stringify(publicOffers)).not.toContain("AUTO10");
    });
});
