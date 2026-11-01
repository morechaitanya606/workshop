import { describe, expect, it } from "vitest";

import {
    activeEarlyBirdEndsAt,
    computeCouponDiscount,
    computeEarlyBirdDiscount,
    computeQuote,
    couponDisplayEndMs,
    couponDisplayEndsAt,
    couponFromRow,
    couponRejection,
    earlyBirdEndsAt,
    OFFER_END_GRACE_MINUTES,
    parseServiceFee,
    pickBestCoupon,
    type CouponContext,
    type PricingCoupon,
    type PricingWorkshop,
} from "@/lib/pricing";

/**
 * The expected numbers here are what confirm_booking_from_hold
 * (20261001110400_confirm_booking_approval_check.sql) computes. A drift means the RPC refuses
 * the booking after the card was captured, so treat a failing case as a money bug.
 */

const MINUTE = 60 * 1000;
const NOW = new Date("2026-10-23T10:00:00.000Z");

const workshop: PricingWorkshop = {
    id: "w1",
    price: 1000,
    category: "Art",
    createdAt: "2026-10-20T08:00:00Z",
    earlyBirdEnabled: false,
};

function coupon(overrides: Partial<PricingCoupon> = {}): PricingCoupon {
    return {
        id: "c1",
        code: "SAVE10",
        discountType: "percentage",
        discountValue: 10,
        minOrderAmount: 0,
        maxUses: null,
        usedCount: 0,
        validFrom: "2026-10-01T00:00:00Z",
        validUntil: null,
        applicableWorkshopIds: null,
        applicableCategories: null,
        isActive: true,
        minGuests: null,
        ...overrides,
    };
}

function ctx(overrides: Partial<CouponContext> = {}): CouponContext {
    return { workshop, guests: 1, now: NOW, purpose: "order", ...overrides };
}

describe("OFFER_END_GRACE_MINUTES", () => {
    it("is 30 minutes, well over one seat hold (8 minutes)", () => {
        expect(OFFER_END_GRACE_MINUTES).toBe(30);
    });
});

describe("computeCouponDiscount", () => {
    it("rounds half up like Postgres round(numeric): 1450 at 29% = 420.5 => 421", () => {
        expect(computeCouponDiscount(1450, coupon({ discountValue: 29 }))).toBe(421);
    });

    it("rounds 1999 x 2 at 10% (399.8) up to 400", () => {
        expect(computeCouponDiscount(3998, coupon({ discountValue: 10 }))).toBe(400);
    });

    it("rounds a plain half up: 105 at 10% = 10.5 => 11", () => {
        expect(computeCouponDiscount(105, coupon({ discountValue: 10 }))).toBe(11);
    });

    it("rounds below a half down: 1449 at 29% = 420.21 => 420", () => {
        expect(computeCouponDiscount(1449, coupon({ discountValue: 29 }))).toBe(420);
    });

    it("uses exact decimal maths for fractional percentages", () => {
        // 3000 * 1.15 / 100 is 34.5 in numeric, but 34.49999999999999 in binary floating
        // point, which Math.round would turn into 34 while the RPC computes 35.
        expect(computeCouponDiscount(3000, coupon({ discountValue: 1.15 }))).toBe(35);
        expect(computeCouponDiscount(5000, coupon({ discountValue: 0.57 }))).toBe(29);
        expect(computeCouponDiscount(2750, coupon({ discountValue: 1.4 }))).toBe(39);
    });

    it("takes a fixed coupon once per booking", () => {
        expect(
            computeCouponDiscount(3000, coupon({ discountType: "fixed", discountValue: 150 }))
        ).toBe(150);
    });

    it("rounds a fractional fixed coupon like the RPC's integer assignment", () => {
        expect(
            computeCouponDiscount(3000, coupon({ discountType: "fixed", discountValue: 150.5 }))
        ).toBe(151);
        expect(
            computeCouponDiscount(3000, coupon({ discountType: "fixed", discountValue: 150.49 }))
        ).toBe(150);
    });

    it("clamps to the subtotal", () => {
        expect(
            computeCouponDiscount(500, coupon({ discountType: "fixed", discountValue: 800 }))
        ).toBe(500);
        expect(computeCouponDiscount(500, coupon({ discountValue: 100 }))).toBe(500);
    });

    it("returns 0 for no coupon, an unknown type, a zero subtotal or a negative value", () => {
        expect(computeCouponDiscount(1000, null)).toBe(0);
        expect(computeCouponDiscount(1000, coupon({ discountType: "bogo" }))).toBe(0);
        expect(computeCouponDiscount(0, coupon())).toBe(0);
        expect(computeCouponDiscount(-50, coupon())).toBe(0);
        expect(computeCouponDiscount(1000, coupon({ discountValue: -10 }))).toBe(0);
    });
});

describe("computeEarlyBirdDiscount (shared with booking-time)", () => {
    const base = {
        price: 1999,
        guests: 2,
        enabled: true,
        discountType: "percentage",
        discountValue: 10,
        daysAfterListing: 2,
        createdAt: "2026-10-01T20:00:00Z",
    };

    it("floors on the whole subtotal: 1999 x 2 at 10% = 399.8 => 399", () => {
        expect(computeEarlyBirdDiscount({ ...base, now: new Date("2026-10-02T00:00:00Z") })).toBe(
            399
        );
    });

    it("floors a fractional percentage exactly", () => {
        // 1000 * 2 * 1.15 / 100 = 23 exactly (binary floating point gives 22.999999999999996)
        expect(
            computeEarlyBirdDiscount({
                ...base,
                price: 1000,
                discountValue: 1.15,
                now: new Date("2026-10-02T00:00:00Z"),
            })
        ).toBe(23);
    });

    it("applies through the last UTC day of the window and stops at the next UTC midnight", () => {
        // Listed 20:00 UTC on 1 Oct (01:30 IST on 2 Oct) with a 2-day window: UTC days 1, 2
        // and 3 Oct qualify; it ends at 00:00 UTC on 4 Oct, which is 05:30 IST.
        expect(
            computeEarlyBirdDiscount({ ...base, now: new Date("2026-10-03T23:59:59.999Z") })
        ).toBe(399);
        expect(computeEarlyBirdDiscount({ ...base, now: new Date("2026-10-04T00:00:00Z") })).toBe(
            0
        );
    });

    it("multiplies a fixed Early Bird by guests and clamps it", () => {
        const now = new Date("2026-10-02T00:00:00Z");
        expect(
            computeEarlyBirdDiscount({ ...base, discountType: "fixed", discountValue: 300, now })
        ).toBe(600);
        expect(
            computeEarlyBirdDiscount({ ...base, discountType: "fixed", discountValue: 5000, now })
        ).toBe(3998);
    });

    it("treats any type other than fixed as a percentage, like the SQL else branch", () => {
        const now = new Date("2026-10-02T00:00:00Z");
        expect(computeEarlyBirdDiscount({ ...base, discountType: null, now })).toBe(399);
    });
});

describe("earlyBirdEndsAt", () => {
    it("is the end of UTC day created_at + days (05:30 IST the next morning)", () => {
        expect(earlyBirdEndsAt("2026-10-01T20:00:00Z", 2)).toBe("2026-10-04T00:00:00.000Z");
        expect(earlyBirdEndsAt("2026-10-01T00:00:00Z", 1)).toBe("2026-10-03T00:00:00.000Z");
        expect(earlyBirdEndsAt(new Date("2026-10-01T23:59:59Z"), 7)).toBe(
            "2026-10-09T00:00:00.000Z"
        );
    });

    it("is null without a window or a readable created_at", () => {
        expect(earlyBirdEndsAt("2026-10-01T20:00:00Z", 0)).toBeNull();
        expect(earlyBirdEndsAt("2026-10-01T20:00:00Z", null)).toBeNull();
        expect(earlyBirdEndsAt(null, 3)).toBeNull();
        expect(earlyBirdEndsAt("not a date", 3)).toBeNull();
    });
});

describe("activeEarlyBirdEndsAt", () => {
    const ebWorkshop: PricingWorkshop = {
        ...workshop,
        createdAt: "2026-10-01T20:00:00Z",
        earlyBirdEnabled: true,
        earlyBirdDiscountType: "percentage",
        earlyBirdDiscountValue: 10,
        earlyBirdDaysAfterListing: 2,
    };

    it("agrees with computeEarlyBirdDiscount at every hour around the boundary", () => {
        const start = new Date("2026-10-01T00:00:00Z").getTime();
        for (let hour = 0; hour < 24 * 5; hour += 1) {
            for (const offset of [0, 1, 30 * MINUTE, 60 * MINUTE - 1]) {
                const now = start + hour * 60 * MINUTE + offset;
                const discount = computeQuote({
                    workshop: ebWorkshop,
                    guests: 1,
                    serviceFee: 0,
                    now,
                }).earlyBirdDiscount;
                const active = activeEarlyBirdEndsAt(ebWorkshop, now) !== null;
                expect(active, new Date(now).toISOString()).toBe(discount > 0);
            }
        }
    });

    it("is null when the Early Bird is disabled, zero or has no window", () => {
        const now = new Date("2026-10-02T00:00:00Z");
        expect(activeEarlyBirdEndsAt({ ...ebWorkshop, earlyBirdEnabled: false }, now)).toBeNull();
        expect(activeEarlyBirdEndsAt({ ...ebWorkshop, earlyBirdDiscountValue: 0 }, now)).toBeNull();
        expect(
            activeEarlyBirdEndsAt({ ...ebWorkshop, earlyBirdDaysAfterListing: 0 }, now)
        ).toBeNull();
        expect(activeEarlyBirdEndsAt({ ...ebWorkshop, createdAt: null }, now)).toBeNull();
    });
});

describe("couponDisplayEndMs / couponDisplayEndsAt", () => {
    it("is valid_until minus the grace", () => {
        const c = coupon({ validUntil: "2026-10-23T12:00:00Z" });
        expect(couponDisplayEndMs(c)).toBe(new Date("2026-10-23T11:30:00Z").getTime());
        expect(couponDisplayEndsAt(c)).toBe("2026-10-23T11:30:00.000Z");
    });

    it("is null without an end", () => {
        expect(couponDisplayEndMs(coupon({ validUntil: null }))).toBeNull();
        expect(couponDisplayEndsAt(coupon({ validUntil: "garbage" }))).toBeNull();
    });
});

describe("couponRejection", () => {
    it("accepts a plain active coupon", () => {
        expect(couponRejection(coupon(), ctx())).toBeNull();
    });

    it("rejects a missing or id-less coupon", () => {
        expect(couponRejection(null, ctx())).toBe("COUPON_INVALID");
        expect(couponRejection(coupon({ id: "" }), ctx())).toBe("COUPON_INVALID");
    });

    it("rejects inactive coupons, including is_active null (coalesce false)", () => {
        expect(couponRejection(coupon({ isActive: false }), ctx())).toBe("COUPON_INACTIVE");
        expect(couponRejection(coupon({ isActive: null }), ctx())).toBe("COUPON_INACTIVE");
    });

    it("rejects a coupon before valid_from and accepts it at valid_from", () => {
        expect(couponRejection(coupon({ validFrom: "2026-10-23T10:00:00.001Z" }), ctx())).toBe(
            "COUPON_NOT_YET_VALID"
        );
        expect(couponRejection(coupon({ validFrom: NOW.toISOString() }), ctx())).toBeNull();
        expect(couponRejection(coupon({ validFrom: null }), ctx())).toBeNull();
    });

    describe("advertised offers: display/order stop at the advertised end, confirm at valid_until", () => {
        const validUntil = "2026-10-23T12:00:00.000Z";
        const displayEnd = new Date("2026-10-23T11:30:00.000Z").getTime();
        const timed = coupon({ validUntil, advertised: true });

        it.each(["display", "order", "confirm"] as const)(
            "%s accepts it up to and including the advertised end",
            (purpose) => {
                expect(couponRejection(timed, ctx({ purpose, now: displayEnd }))).toBeNull();
            }
        );

        it.each(["display", "order"] as const)(
            "%s rejects it 1 ms after the advertised end",
            (purpose) => {
                expect(couponRejection(timed, ctx({ purpose, now: displayEnd + 1 }))).toBe(
                    "COUPON_EXPIRED"
                );
            }
        );

        it("confirm keeps honouring it inside the grace, up to valid_until inclusive", () => {
            const until = new Date(validUntil).getTime();
            expect(
                couponRejection(timed, ctx({ purpose: "confirm", now: displayEnd + 1 }))
            ).toBeNull();
            expect(couponRejection(timed, ctx({ purpose: "confirm", now: until }))).toBeNull();
            expect(couponRejection(timed, ctx({ purpose: "confirm", now: until + 1 }))).toBe(
                "COUPON_EXPIRED"
            );
        });
    });

    describe("hidden codes keep today's rule: valid until valid_until for every purpose", () => {
        const validUntil = "2026-10-23T12:00:00.000Z";
        const until = new Date(validUntil).getTime();

        it.each([
            ["no flag", coupon({ validUntil })],
            ["advertised false", coupon({ validUntil, advertised: false })],
            ["advertised null", coupon({ validUntil, advertised: null })],
        ])("%s: accepted in the last 30 minutes, refused after valid_until", (_label, code) => {
            for (const purpose of ["display", "order", "confirm"] as const) {
                expect(
                    couponRejection(code, ctx({ purpose, now: until - 29 * MINUTE }))
                ).toBeNull();
                expect(couponRejection(code, ctx({ purpose, now: until }))).toBeNull();
                expect(couponRejection(code, ctx({ purpose, now: until + 1 }))).toBe(
                    "COUPON_EXPIRED"
                );
            }
        });
    });

    it("rejects an unreadable date rather than guessing", () => {
        expect(couponRejection(coupon({ validUntil: "soon" }), ctx())).toBe("COUPON_INVALID");
        expect(couponRejection(coupon({ validFrom: "yesterday" }), ctx())).toBe("COUPON_INVALID");
    });

    it("rejects a coupon whose uses are exhausted (used_count >= max_uses)", () => {
        expect(couponRejection(coupon({ maxUses: 5, usedCount: 5 }), ctx())).toBe(
            "COUPON_MAX_USES_REACHED"
        );
        expect(couponRejection(coupon({ maxUses: 5, usedCount: 4 }), ctx())).toBeNull();
        expect(couponRejection(coupon({ maxUses: 5, usedCount: null }), ctx())).toBeNull();
        expect(couponRejection(coupon({ maxUses: null, usedCount: 999 }), ctx())).toBeNull();
    });

    it("measures min_order_amount on the post-Early-Bird subtotal, inclusive", () => {
        const eb: PricingWorkshop = {
            ...workshop,
            createdAt: "2026-10-22T00:00:00Z",
            earlyBirdEnabled: true,
            earlyBirdDiscountType: "percentage",
            earlyBirdDiscountValue: 10,
            earlyBirdDaysAfterListing: 3,
        };
        // 1000 list, 900 after Early Bird.
        expect(couponRejection(coupon({ minOrderAmount: 950 }), ctx({ workshop: eb }))).toBe(
            "COUPON_MIN_ORDER_NOT_MET"
        );
        expect(couponRejection(coupon({ minOrderAmount: 900 }), ctx({ workshop: eb }))).toBeNull();
        expect(
            couponRejection(
                coupon({ minOrderAmount: 900 }),
                ctx({ workshop: eb, subtotalAfterEarlyBird: 899 })
            )
        ).toBe("COUPON_MIN_ORDER_NOT_MET");
        expect(couponRejection(coupon({ minOrderAmount: null }), ctx())).toBeNull();
    });

    it("checks applicable_workshop_ids (empty means every workshop)", () => {
        expect(couponRejection(coupon({ applicableWorkshopIds: [] }), ctx())).toBeNull();
        expect(couponRejection(coupon({ applicableWorkshopIds: ["w1", "w9"] }), ctx())).toBeNull();
        expect(couponRejection(coupon({ applicableWorkshopIds: ["w2"] }), ctx())).toBe(
            "COUPON_WORKSHOP_MISMATCH"
        );
    });

    it("checks applicable_categories exactly, and never matches a workshop without one", () => {
        expect(couponRejection(coupon({ applicableCategories: [] }), ctx())).toBeNull();
        expect(couponRejection(coupon({ applicableCategories: ["Art"] }), ctx())).toBeNull();
        expect(couponRejection(coupon({ applicableCategories: ["art"] }), ctx())).toBe(
            "COUPON_CATEGORY_MISMATCH"
        );
        expect(
            couponRejection(
                coupon({ applicableCategories: ["Art"] }),
                ctx({ workshop: { ...workshop, category: null } })
            )
        ).toBe("COUPON_CATEGORY_MISMATCH");
    });

    it("rejects an unknown discount type like the RPC", () => {
        expect(couponRejection(coupon({ discountType: "bogo" }), ctx())).toBe(
            "COUPON_DISCOUNT_TYPE_INVALID"
        );
    });

    it("enforces minGuests for display and order, and leaves confirm to the RPC's rules", () => {
        const group = coupon({ minGuests: 2 });
        expect(couponRejection(group, ctx({ guests: 1, purpose: "display" }))).toBe(
            "COUPON_MIN_GUESTS_NOT_MET"
        );
        expect(couponRejection(group, ctx({ guests: 1, purpose: "order" }))).toBe(
            "COUPON_MIN_GUESTS_NOT_MET"
        );
        expect(couponRejection(group, ctx({ guests: 2 }))).toBeNull();
        expect(couponRejection(group, ctx({ guests: 1, purpose: "confirm" }))).toBeNull();
        expect(couponRejection(coupon({ minGuests: 1 }), ctx({ guests: 1 }))).toBeNull();
    });
});

describe("pickBestCoupon", () => {
    it("picks the largest discount", () => {
        const pct = coupon({ id: "pct", code: "PCT", discountValue: 10 }); // 100 on 1000
        const fixed = coupon({ id: "fix", code: "FIX", discountType: "fixed", discountValue: 150 });
        expect(pickBestCoupon([pct, fixed], ctx())).toEqual({ coupon: fixed, discount: 150 });
        expect(pickBestCoupon([pct, fixed], ctx({ guests: 3 }))).toEqual({
            coupon: pct,
            discount: 300,
        });
    });

    it("skips coupons that do not apply or save nothing", () => {
        const expired = coupon({
            id: "a",
            discountValue: 50,
            validUntil: "2026-10-23T10:10:00Z",
            advertised: true,
        });
        const zero = coupon({ id: "b", discountType: "fixed", discountValue: 0 });
        const group = coupon({ id: "c", discountValue: 40, minGuests: 2 });
        expect(pickBestCoupon([expired, zero, group, null], ctx())).toBeNull();
        expect(pickBestCoupon([], ctx())).toBeNull();
    });

    it("breaks ties by the typed code, then the soonest end, then the lowest id", () => {
        const a = coupon({ id: "a", code: "AAA", validUntil: null });
        const b = coupon({ id: "b", code: "BBB", validUntil: "2026-10-30T00:00:00Z" });
        const c = coupon({ id: "c", code: "CCC", validUntil: "2026-10-25T00:00:00Z" });
        const d = coupon({ id: "d", code: "DDD", validUntil: "2026-10-25T00:00:00Z" });
        const all = [a, b, c, d];
        const orders = [all, [...all].reverse(), [b, d, a, c], [d, c, b, a]];

        for (const candidates of orders) {
            expect(pickBestCoupon(candidates, ctx())?.coupon.id).toBe("c");
            expect(pickBestCoupon(candidates, { ...ctx(), typedCode: " bbb " })?.coupon.id).toBe(
                "b"
            );
            expect(pickBestCoupon(candidates, { ...ctx(), typedCode: "aaa" })?.coupon.id).toBe("a");
        }
        expect(pickBestCoupon([a, b], ctx())?.coupon.id).toBe("b");
        expect(pickBestCoupon([b, a], ctx())?.coupon.id).toBe("b");
    });

    it("still prefers a bigger discount over the typed code", () => {
        const typed = coupon({ id: "t", code: "MINE", discountValue: 5 });
        const auto = coupon({ id: "z", code: "AUTO", discountValue: 10 });
        expect(pickBestCoupon([typed, auto], { ...ctx(), typedCode: "MINE" })?.coupon.id).toBe("z");
    });

    it("uses the given post-Early-Bird subtotal for discounts and minimums", () => {
        const pct = coupon({ id: "p", discountValue: 10 });
        expect(pickBestCoupon([pct], ctx({ subtotalAfterEarlyBird: 4500 }))).toEqual({
            coupon: pct,
            discount: 450,
        });
    });
});

describe("computeQuote", () => {
    const ebWorkshop: PricingWorkshop = {
        id: "w1",
        price: 1999,
        category: "Art",
        createdAt: "2026-10-22T05:00:00Z",
        earlyBirdEnabled: true,
        earlyBirdDiscountType: "percentage",
        earlyBirdDiscountValue: 10,
        earlyBirdDaysAfterListing: 3,
    };

    it("applies Early Bird, then one coupon on the remainder, then the fee", () => {
        const quote = computeQuote({
            workshop: ebWorkshop,
            guests: 2,
            coupon: coupon({ discountValue: 10 }),
            serviceFee: 99,
            now: NOW,
        });
        expect(quote).toEqual({
            listUnitPrice: 1999,
            guests: 2,
            listSubtotal: 3998,
            earlyBirdDiscount: 399, // floor(399.8)
            subtotalAfterEarlyBird: 3599,
            couponId: "c1",
            couponDiscount: 360, // round(359.9)
            couponRejection: null,
            subtotal: 3239,
            serviceFee: 99,
            total: 3338,
            savings: 759,
            earlyBirdEndsAt: "2026-10-26T00:00:00.000Z",
        });
    });

    it("never discounts the service fee", () => {
        const quote = computeQuote({
            workshop,
            guests: 1,
            coupon: coupon({ discountType: "fixed", discountValue: 5000 }),
            serviceFee: 99,
            now: NOW,
        });
        expect(quote.subtotal).toBe(0);
        expect(quote.total).toBe(99);
        expect(quote.savings).toBe(1000);
    });

    it("leaves out a coupon that does not apply and says why", () => {
        const quote = computeQuote({
            workshop,
            guests: 1,
            coupon: coupon({ minGuests: 2 }),
            serviceFee: 99,
            now: NOW,
        });
        expect(quote.couponId).toBeNull();
        expect(quote.couponDiscount).toBe(0);
        expect(quote.couponRejection).toBe("COUPON_MIN_GUESTS_NOT_MET");
        expect(quote.total).toBe(1099);
        expect(quote.savings).toBe(0);
    });

    it("honours an advertised coupon inside the grace only when confirming", () => {
        // Advertised end 09:50, before NOW (10:00).
        const timed = coupon({ validUntil: "2026-10-23T10:20:00Z", advertised: true });
        const order = computeQuote({ workshop, guests: 1, coupon: timed, serviceFee: 0, now: NOW });
        const confirm = computeQuote({
            workshop,
            guests: 1,
            coupon: timed,
            serviceFee: 0,
            now: NOW,
            purpose: "confirm",
        });
        expect(order.couponRejection).toBe("COUPON_EXPIRED");
        expect(order.subtotal).toBe(1000);
        expect(confirm.couponId).toBe("c1");
        expect(confirm.subtotal).toBe(900);
    });

    it("applies a hidden code at order time until valid_until, as checkout does today", () => {
        const hidden = coupon({ validUntil: "2026-10-23T10:20:00Z" });
        const order = computeQuote({
            workshop,
            guests: 1,
            coupon: hidden,
            serviceFee: 0,
            now: NOW,
        });
        expect(order.couponRejection).toBeNull();
        expect(order.subtotal).toBe(900);
    });

    it("rounds the service fee and never lets it go negative", () => {
        expect(computeQuote({ workshop, guests: 1, serviceFee: 49.5, now: NOW }).serviceFee).toBe(
            50
        );
        expect(computeQuote({ workshop, guests: 1, serviceFee: -5, now: NOW }).serviceFee).toBe(0);
        expect(
            computeQuote({ workshop, guests: 1, serviceFee: Number.NaN, now: NOW }).serviceFee
        ).toBe(0);
    });

    it("has no Early Bird end once the window has closed", () => {
        const quote = computeQuote({
            workshop: ebWorkshop,
            guests: 1,
            serviceFee: 0,
            now: new Date("2026-10-26T00:00:00Z"),
        });
        expect(quote.earlyBirdDiscount).toBe(0);
        expect(quote.earlyBirdEndsAt).toBeNull();
    });

    it("handles zero and fractional guest counts like the RPC's integer guests", () => {
        expect(computeQuote({ workshop, guests: 0, serviceFee: 99, now: NOW }).total).toBe(99);
        expect(computeQuote({ workshop, guests: 2.7, serviceFee: 0, now: NOW }).listSubtotal).toBe(
            2000
        );
    });
});

describe("parseServiceFee", () => {
    it("parses and rounds like checkout, falling back to 99", () => {
        expect(parseServiceFee(99)).toBe(99);
        expect(parseServiceFee("49.5")).toBe(50);
        expect(parseServiceFee(-10)).toBe(0);
        expect(parseServiceFee("abc")).toBe(99);
        expect(parseServiceFee(undefined)).toBe(99);
        expect(parseServiceFee(null, 0)).toBe(0);
    });
});

describe("couponFromRow", () => {
    const row = {
        id: "c1",
        code: "SAVE10",
        discount_type: "percentage",
        discount_value: 10,
        min_order_amount: 500,
        max_uses: 100,
        used_count: 3,
        valid_from: "2026-10-01T00:00:00+00:00",
        valid_until: "2026-11-01T00:00:00+00:00",
        applicable_workshop_ids: ["w1"],
        applicable_categories: [],
        is_active: true,
        created_at: "2026-10-01T00:00:00+00:00",
    };

    it("maps a coupons row", () => {
        expect(couponFromRow(row)).toEqual({
            id: "c1",
            code: "SAVE10",
            discountType: "percentage",
            discountValue: 10,
            minOrderAmount: 500,
            maxUses: 100,
            usedCount: 3,
            validFrom: "2026-10-01T00:00:00+00:00",
            validUntil: "2026-11-01T00:00:00+00:00",
            applicableWorkshopIds: ["w1"],
            applicableCategories: [],
            isActive: true,
            minGuests: null,
            advertised: false,
        });
    });

    it("marks a coupon advertised only when asked", () => {
        expect(couponFromRow(row, { advertised: true })?.advertised).toBe(true);
        expect(couponFromRow(row, { advertised: null })?.advertised).toBe(false);
    });

    it("reads numeric columns sent as text and merges the seat minimum", () => {
        const mapped = couponFromRow(
            { ...row, discount_value: "12.5", min_order_amount: "0" },
            { minGuests: 2 }
        );
        expect(mapped?.discountValue).toBe(12.5);
        expect(mapped?.minOrderAmount).toBe(0);
        expect(mapped?.minGuests).toBe(2);
    });

    it("treats missing optional columns as null", () => {
        const mapped = couponFromRow({
            id: "c2",
            code: "X",
            discount_type: "fixed",
            discount_value: 100,
        });
        expect(mapped).toMatchObject({
            minOrderAmount: null,
            maxUses: null,
            usedCount: null,
            validFrom: null,
            validUntil: null,
            applicableWorkshopIds: null,
            applicableCategories: null,
            isActive: false,
        });
    });

    it("refuses a row it cannot read exactly", () => {
        expect(couponFromRow(null)).toBeNull();
        expect(couponFromRow({ ...row, id: 7 })).toBeNull();
        expect(couponFromRow({ ...row, discount_value: "lots" })).toBeNull();
        expect(couponFromRow({ ...row, applicable_workshop_ids: "w1" })).toBeNull();
        expect(couponFromRow({ ...row, applicable_categories: [1] })).toBeNull();
        expect(couponFromRow({ ...row, max_uses: "many" })).toBeNull();
    });
});
