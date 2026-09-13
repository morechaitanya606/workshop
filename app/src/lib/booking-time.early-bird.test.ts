import { describe, expect, it } from "vitest";

import { computeEarlyBirdDiscount } from "@/lib/booking-time";

/**
 * These assertions encode the contract in confirm_booking_from_hold
 * (20260714193000_early_bird_checkout_totals.sql). If they drift, checkout starts failing
 * with EARLY_BIRD_DISCOUNT_MISMATCH *after* the payment has been captured.
 */
describe("computeEarlyBirdDiscount", () => {
    const base = {
        price: 1000,
        guests: 2,
        enabled: true,
        discountType: "percentage",
        discountValue: 10,
        daysAfterListing: 7,
        createdAt: "2026-01-01T00:00:00Z",
        now: new Date("2026-01-03T12:00:00Z"),
    };

    it("returns zero when early bird is disabled", () => {
        expect(computeEarlyBirdDiscount({ ...base, enabled: false })).toBe(0);
    });

    it("returns zero when the discount value is zero", () => {
        expect(computeEarlyBirdDiscount({ ...base, discountValue: 0 })).toBe(0);
    });

    it("returns zero when the window is zero days", () => {
        expect(computeEarlyBirdDiscount({ ...base, daysAfterListing: 0 })).toBe(0);
    });

    it("returns zero when createdAt is missing", () => {
        expect(computeEarlyBirdDiscount({ ...base, createdAt: null })).toBe(0);
    });

    it("applies a percentage discount to the whole subtotal, floored", () => {
        // subtotal 2000, 10% => 200
        expect(computeEarlyBirdDiscount(base)).toBe(200);
    });

    it("floors rather than rounds, matching SQL floor()", () => {
        // subtotal 3 * 333 = 999, 7% = 69.93 => 69
        expect(computeEarlyBirdDiscount({ ...base, price: 333, guests: 3, discountValue: 7 })).toBe(
            69
        );
    });

    it("multiplies a fixed discount by guest count, matching SQL", () => {
        expect(
            computeEarlyBirdDiscount({ ...base, discountType: "fixed", discountValue: 150 })
        ).toBe(300);
    });

    it("clamps the discount to the subtotal", () => {
        expect(
            computeEarlyBirdDiscount({ ...base, discountType: "fixed", discountValue: 99999 })
        ).toBe(2000);
    });

    it("is inclusive on the final eligible day", () => {
        // ceil(7 days) <= 7 => still eligible
        expect(computeEarlyBirdDiscount({ ...base, now: new Date("2026-01-08T23:59:00Z") })).toBe(
            200
        );
    });

    it("expires the day after the window closes", () => {
        expect(computeEarlyBirdDiscount({ ...base, now: new Date("2026-01-09T00:00:00Z") })).toBe(
            0
        );
    });

    it("truncates to UTC days, not local midnight", () => {
        // 18:30 UTC on the boundary day is the next day in IST. Truncating locally would
        // push this out of the window; UTC truncation keeps it eligible, matching Postgres.
        expect(
            computeEarlyBirdDiscount({
                ...base,
                createdAt: "2026-01-01T18:30:00Z",
                now: new Date("2026-01-08T18:30:00Z"),
            })
        ).toBe(200);
    });

    it("returns zero for zero guests", () => {
        expect(computeEarlyBirdDiscount({ ...base, guests: 0 })).toBe(0);
    });
});
