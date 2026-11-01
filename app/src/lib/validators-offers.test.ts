import { describe, expect, it } from "vitest";

import {
    couponCreateSchema,
    couponUpdateSchema,
    workshopCreateSchema,
    workshopUpdateSchema,
} from "@/lib/validators";

const BASE_COUPON = { code: "diwali10", discount_type: "percentage", discount_value: 10 };

describe("coupon display fields", () => {
    it("accepts every visibility and normalises the label", () => {
        for (const visibility of ["hidden", "listed", "auto", "community"]) {
            const parsed = couponCreateSchema.parse({
                ...BASE_COUPON,
                visibility,
                label: "  Festive offer  ",
            });
            expect(parsed.visibility).toBe(visibility);
            expect(parsed.label).toBe("Festive offer");
        }
    });

    it("treats an empty label as no label", () => {
        expect(couponCreateSchema.parse({ ...BASE_COUPON, label: "   " }).label).toBeNull();
        expect(couponUpdateSchema.parse({ label: "" }).label).toBeNull();
        expect(couponUpdateSchema.parse({ label: null }).label).toBeNull();
    });

    it("rejects an unknown visibility, a long or multi-line label", () => {
        expect(couponCreateSchema.safeParse({ ...BASE_COUPON, visibility: "public" }).success).toBe(
            false
        );
        expect(
            couponCreateSchema.safeParse({ ...BASE_COUPON, label: "x".repeat(41) }).success
        ).toBe(false);
        expect(
            couponCreateSchema.safeParse({ ...BASE_COUPON, label: "x".repeat(40) }).success
        ).toBe(true);
        expect(couponUpdateSchema.safeParse({ label: "Two\nlines" }).success).toBe(false);
        expect(couponUpdateSchema.safeParse({ label: "Tab\there" }).success).toBe(false);
    });

    it("takes a seat minimum from 1 to 20 (or none)", () => {
        expect(couponUpdateSchema.parse({ min_guests: 2 }).min_guests).toBe(2);
        expect(couponUpdateSchema.parse({ min_guests: "20" }).min_guests).toBe(20);
        expect(couponUpdateSchema.parse({ min_guests: null }).min_guests).toBeNull();
        expect(couponUpdateSchema.safeParse({ min_guests: 0 }).success).toBe(false);
        expect(couponUpdateSchema.safeParse({ min_guests: 21 }).success).toBe(false);
        expect(couponUpdateSchema.safeParse({ min_guests: 2.5 }).success).toBe(false);
    });

    it("refuses a non-listed label that spells out the code on create", () => {
        for (const visibility of [undefined, "hidden", "auto", "community"]) {
            const result = couponCreateSchema.safeParse({
                ...BASE_COUPON,
                visibility,
                label: "Code Diwali 10 inside",
            });
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0].path).toEqual(["label"]);
            }
        }
        expect(
            couponCreateSchema.safeParse({
                ...BASE_COUPON,
                visibility: "listed",
                label: "Use DIWALI10",
            }).success
        ).toBe(true);
        // A longer code that merely starts with it is not the code.
        expect(
            couponCreateSchema.safeParse({
                ...BASE_COUPON,
                visibility: "community",
                label: "DIWALI100 is not it",
            }).success
        ).toBe(true);
    });

    it("needs an end date to show one", () => {
        expect(
            couponCreateSchema.safeParse({
                ...BASE_COUPON,
                visibility: "auto",
                show_end_date: true,
            }).success
        ).toBe(false);
        expect(
            couponCreateSchema.safeParse({
                ...BASE_COUPON,
                visibility: "auto",
                show_end_date: true,
                valid_until: "2026-11-10T18:30:00+05:30",
            }).success
        ).toBe(true);
        // An update cannot see the stored end, so only an explicit clear is refused.
        expect(couponUpdateSchema.safeParse({ show_end_date: true }).success).toBe(true);
        expect(
            couponUpdateSchema.safeParse({ show_end_date: true, valid_until: null }).success
        ).toBe(false);
    });

    it("normalises an IST end to UTC", () => {
        expect(
            couponUpdateSchema.parse({ valid_until: "2026-11-10T18:30:00+05:30" }).valid_until
        ).toBe("2026-11-10T13:00:00.000Z");
    });

    it("counts a display-only update as an update", () => {
        expect(couponUpdateSchema.safeParse({ visibility: "listed" }).success).toBe(true);
        expect(couponUpdateSchema.safeParse({ show_end_date: false }).success).toBe(true);
        expect(couponUpdateSchema.safeParse({}).success).toBe(false);
    });
});

const FUTURE = "2099-06-10";

function workshop(overrides: Record<string, unknown> = {}) {
    return {
        title: "Pottery for Beginners",
        description: "Learn the wheel and take home a handmade bowl.",
        category: "Pottery",
        price: 1500,
        location: "Studio 12",
        city: "Pune",
        duration: "3 hours",
        maxSeats: 12,
        coverImage: "/images/cover.webp",
        whatYouLearn: ["Centering clay"],
        materialsProvided: ["Clay"],
        hostName: "Asha Rao",
        hostBio: "Potter with ten years of experience.",
        date: FUTURE,
        time: "10:00",
        ...overrides,
    };
}

describe("Early Bird percentage cap", () => {
    it("refuses a percentage Early Bird above 100 on create", () => {
        const result = workshopCreateSchema.safeParse(
            workshop({
                earlyBirdEnabled: true,
                earlyBirdDiscountType: "percentage",
                earlyBirdDiscountValue: 150,
                earlyBirdDaysAfterListing: 3,
            })
        );
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues.map((issue) => issue.path)).toContainEqual([
                "earlyBirdDiscountValue",
            ]);
        }
    });

    it("allows 100% and any fixed amount", () => {
        expect(
            workshopCreateSchema.safeParse(
                workshop({
                    earlyBirdEnabled: true,
                    earlyBirdDiscountType: "percentage",
                    earlyBirdDiscountValue: 100,
                })
            ).success
        ).toBe(true);
        expect(
            workshopCreateSchema.safeParse(
                workshop({
                    earlyBirdEnabled: true,
                    earlyBirdDiscountType: "fixed",
                    earlyBirdDiscountValue: 500,
                })
            ).success
        ).toBe(true);
    });

    it("does not block saving a workshop whose Early Bird is switched off", () => {
        expect(
            workshopCreateSchema.safeParse(
                workshop({
                    earlyBirdEnabled: false,
                    earlyBirdDiscountType: "percentage",
                    earlyBirdDiscountValue: 150,
                })
            ).success
        ).toBe(true);
        expect(
            workshopUpdateSchema.safeParse({
                earlyBirdEnabled: false,
                earlyBirdDiscountType: "percentage",
                earlyBirdDiscountValue: 150,
            }).success
        ).toBe(true);
    });

    it("refuses a percentage above 100 on update", () => {
        const result = workshopUpdateSchema.safeParse({
            earlyBirdEnabled: true,
            earlyBirdDiscountType: "percentage",
            earlyBirdDiscountValue: 101,
        });
        expect(result.success).toBe(false);
        expect(
            workshopUpdateSchema.safeParse({
                earlyBirdDiscountType: "percentage",
                earlyBirdDiscountValue: 150,
            }).success
        ).toBe(false);
        expect(
            workshopUpdateSchema.safeParse({
                earlyBirdDiscountType: "fixed",
                earlyBirdDiscountValue: 150,
            }).success
        ).toBe(true);
    });
});
