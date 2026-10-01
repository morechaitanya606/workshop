import { describe, expect, it } from "vitest";
import {
    couponCreateSchema,
    couponUpdateSchema,
    couponValidateSchema,
    cursorPageQuerySchema,
    hostApplicationSchema,
    supportTicketCreateSchema,
    toPageCursor,
    workshopFeedbackSchema,
} from "./validators";

describe("workshopFeedbackSchema.photos", () => {
    const base = { comment: "Loved the session" };

    it("accepts up to 10 photos", () => {
        const photos = Array.from({ length: 10 }, (_, index) => `/uploads/p${index}.webp`);
        expect(workshopFeedbackSchema.safeParse({ ...base, photos }).success).toBe(true);
    });

    it("rejects more than 10 photos", () => {
        const photos = Array.from({ length: 11 }, (_, index) => `/uploads/p${index}.webp`);
        expect(workshopFeedbackSchema.safeParse({ ...base, photos }).success).toBe(false);
    });

    it("rejects entries that are not URLs", () => {
        expect(
            workshopFeedbackSchema.safeParse({ ...base, photos: ["javascript:alert(1)"] }).success
        ).toBe(false);
    });
});

describe("hostApplicationSchema.details", () => {
    const base = {
        name: "Asha Rao",
        email: "asha@example.com",
        bio: "I have taught pottery for ten years and run weekly studio sessions.",
    };

    it("defaults to an empty object", () => {
        const parsed = hostApplicationSchema.parse(base);
        expect(parsed.details).toEqual({});
        expect(parsed.applicationType).toBe("creator");
    });

    it("accepts scalars and one level of nesting", () => {
        const result = hostApplicationSchema.safeParse({
            ...base,
            details: { capacity: 40, indoor: true, socialLinks: { website: "https://x.test" } },
        });
        expect(result.success).toBe(true);
    });

    it("rejects arrays, strings and deep nesting", () => {
        for (const details of ["x", [1], { a: { b: { c: 1 } } }]) {
            expect(hostApplicationSchema.safeParse({ ...base, details }).success).toBe(false);
        }
    });

    it("rejects more than 30 keys", () => {
        const details = Object.fromEntries(Array.from({ length: 31 }, (_, i) => [`k${i}`, "v"]));
        expect(hostApplicationSchema.safeParse({ ...base, details }).success).toBe(false);
    });

    it("rejects a payload over the serialised-size cap", () => {
        const details = Object.fromEntries(
            Array.from({ length: 10 }, (_, i) => [`k${i}`, "x".repeat(900)])
        );
        expect(hostApplicationSchema.safeParse({ ...base, details }).success).toBe(false);
    });
});

describe("couponCreateSchema", () => {
    it("normalises the code and parses optional rules", () => {
        const parsed = couponCreateSchema.parse({
            code: " welcome-10 ",
            discount_type: "percentage",
            discount_value: "10",
            valid_until: "2026-12-31",
            applicable_workshop_ids: ["abc"],
        });

        expect(parsed.code).toBe("WELCOME-10");
        expect(parsed.discount_value).toBe(10);
        expect(parsed.valid_until).toBe("2026-12-31T00:00:00.000Z");
    });

    it("caps percentage at 100 but not fixed amounts", () => {
        expect(
            couponCreateSchema.safeParse({
                code: "ABC",
                discount_type: "percentage",
                discount_value: 101,
            }).success
        ).toBe(false);
        expect(
            couponCreateSchema.safeParse({
                code: "ABC",
                discount_type: "fixed",
                discount_value: 500,
            }).success
        ).toBe(true);
    });

    it("treats null/empty timestamps as 'no limit'", () => {
        const parsed = couponCreateSchema.parse({
            code: "ABC",
            discount_type: "fixed",
            discount_value: 5,
            valid_from: null,
            valid_until: "",
        });
        expect(parsed.valid_from).toBeNull();
        expect(parsed.valid_until).toBeNull();
    });
});

describe("couponUpdateSchema", () => {
    it("requires at least one field", () => {
        expect(couponUpdateSchema.safeParse({}).success).toBe(false);
        expect(couponUpdateSchema.safeParse({ is_active: false }).success).toBe(true);
    });

    it("does not allow the code to be changed", () => {
        const parsed = couponUpdateSchema.parse({ is_active: true, code: "HACK" });
        expect(parsed).not.toHaveProperty("code");
    });
});

describe("couponValidateSchema", () => {
    it("requires a bounded code and a non-negative subtotal", () => {
        expect(couponValidateSchema.safeParse({}).success).toBe(false);
        expect(couponValidateSchema.safeParse({ code: "x".repeat(65) }).success).toBe(false);
        expect(couponValidateSchema.safeParse({ code: "A", subtotal: -1 }).success).toBe(false);
        expect(couponValidateSchema.safeParse({ code: "A", subtotal: 100 }).success).toBe(true);
    });
});

describe("cursorPageQuerySchema", () => {
    it("defaults to 50 and caps at 100", () => {
        expect(cursorPageQuerySchema.parse({}).limit).toBe(50);
        expect(cursorPageQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
        expect(cursorPageQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
    });

    it("normalises a valid cursor to ISO and rejects garbage", () => {
        expect(cursorPageQuerySchema.parse({ cursor: "2026-09-04T00:00:00Z" }).cursor).toBe(
            "2026-09-04T00:00:00.000Z"
        );
        expect(cursorPageQuerySchema.safeParse({ cursor: "x,id.neq.0" }).success).toBe(false);
        expect(cursorPageQuerySchema.parse({ cursor: "" }).cursor).toBeUndefined();
    });
});

describe("toPageCursor", () => {
    it("emits a UTC ISO cursor that round-trips through the query schema", () => {
        const cursor = toPageCursor("2026-09-02T10:11:12.123456+00:00");
        expect(cursor).toBe("2026-09-02T10:11:12.123Z");
        expect(cursorPageQuerySchema.parse({ cursor }).cursor).toBe(cursor);
    });

    it("returns null for missing or unparseable values", () => {
        expect(toPageCursor(null)).toBeNull();
        expect(toPageCursor("nope")).toBeNull();
    });
});

describe("supportTicketCreateSchema", () => {
    const base = {
        subject: "Payment failed",
        description: "My card was charged but I got no confirmation.",
        email: "u@example.com",
    };

    it("accepts a uuid workshop id or none", () => {
        expect(supportTicketCreateSchema.safeParse(base).success).toBe(true);
        expect(
            supportTicketCreateSchema.safeParse({
                ...base,
                workshopId: "11111111-2222-4333-8444-555555555555",
            }).success
        ).toBe(true);
    });

    it("rejects a non-uuid workshop id and over-long fields", () => {
        expect(supportTicketCreateSchema.safeParse({ ...base, workshopId: "abc" }).success).toBe(
            false
        );
        expect(
            supportTicketCreateSchema.safeParse({ ...base, email: `${"a".repeat(330)}@x.com` })
                .success
        ).toBe(false);
        expect(
            supportTicketCreateSchema.safeParse({ ...base, subject: "s".repeat(181) }).success
        ).toBe(false);
        expect(
            supportTicketCreateSchema.safeParse({ ...base, description: "d".repeat(4001) }).success
        ).toBe(false);
    });
});
