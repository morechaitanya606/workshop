import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createChainableSupabase } from "@/test/chainable-supabase";

const mocks = vi.hoisted(() => ({
    requireAuthenticatedUser: vi.fn(),
    requireSupabaseService: vi.fn(),
    enforceRateLimit: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({ requireAuthenticatedUser: mocks.requireAuthenticatedUser }));
vi.mock("@/lib/api-helpers", () => ({ requireSupabaseService: mocks.requireSupabaseService }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: mocks.enforceRateLimit }));
vi.mock("@sentry/nextjs", () => ({ captureException: () => undefined }));

import { POST } from "./route";

function validateRequest(body: unknown) {
    return new NextRequest("http://localhost/api/coupons/validate", {
        method: "POST",
        body: JSON.stringify(body),
    });
}

function coupon(overrides: Record<string, unknown> = {}) {
    return {
        id: "coupon-1",
        code: "SAVE10",
        discount_type: "percentage",
        discount_value: 10,
        is_active: true,
        valid_from: null,
        valid_until: null,
        max_uses: null,
        used_count: 0,
        min_order_amount: 0,
        applicable_workshop_ids: null,
        applicable_categories: null,
        ...overrides,
    };
}

function mockDb(results: Parameters<typeof createChainableSupabase>[0]) {
    const db = createChainableSupabase(results);
    mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });
    return db;
}

describe("POST /api/coupons/validate", () => {
    beforeEach(() => {
        mocks.enforceRateLimit.mockResolvedValue({ ok: true });
        mocks.requireAuthenticatedUser.mockResolvedValue({
            ok: true,
            user: { id: "user123" },
            accessToken: "token",
        });
    });

    it("returns the auth response when unauthenticated", async () => {
        const mockResponse = { status: 401 } as any;
        mocks.requireAuthenticatedUser.mockResolvedValue({ ok: false, response: mockResponse });

        const req = validateRequest({ code: "TEST", workshopId: "123", subtotal: 100 });
        const res = await POST(req);

        expect(res).toBe(mockResponse);
        expect(mocks.requireAuthenticatedUser).toHaveBeenCalledWith(req);
    });

    it("asks for a code when none is supplied", async () => {
        const res = await POST(validateRequest({}));

        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ valid: false, message: "Coupon code is required" });
    });

    it("rate limits the address and the account, both failing closed", async () => {
        mockDb({ coupons: [{ data: coupon(), error: null }] });

        await POST(validateRequest({ code: "save10", workshopId: "w1", subtotal: 1000 }));

        expect(mocks.enforceRateLimit).toHaveBeenCalledTimes(2);
        for (const call of mocks.enforceRateLimit.mock.calls) {
            expect(call[4]).toEqual({ strict: true });
        }
        expect(mocks.enforceRateLimit.mock.calls[1][3]).toBe("user123");
    });

    it("accepts a coupon with no restrictions", async () => {
        mockDb({ coupons: [{ data: coupon(), error: null }] });

        const res = await POST(
            validateRequest({ code: "save10", workshopId: "w1", subtotal: 1000 })
        );
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body).toMatchObject({
            valid: true,
            discount: 10,
            type: "percentage",
            id: "coupon-1",
        });
    });

    it("rejects an unknown code with the same opaque message as other failures", async () => {
        mockDb({ coupons: [{ data: null, error: { message: "no rows" } }] });

        const res = await POST(validateRequest({ code: "NOPE" }));

        expect(res.status).toBe(400);
        expect((await res.json()).message).toBe("This coupon code is not valid for this order.");
    });

    it("rejects expired, exhausted and inactive coupons", async () => {
        for (const overrides of [
            { valid_until: "2020-01-01T00:00:00.000Z" },
            { max_uses: 5, used_count: 5 },
            { is_active: false },
            { valid_from: "2999-01-01T00:00:00.000Z" },
        ]) {
            mockDb({ coupons: [{ data: coupon(overrides), error: null }] });
            const res = await POST(
                validateRequest({ code: "SAVE10", workshopId: "w1", subtotal: 500 })
            );
            expect(res.status).toBe(400);
        }
    });

    it("enforces the minimum order amount", async () => {
        mockDb({ coupons: [{ data: coupon({ min_order_amount: 1500 }), error: null }] });
        const low = await POST(
            validateRequest({ code: "SAVE10", workshopId: "w1", subtotal: 1000 })
        );
        expect(low.status).toBe(400);
        expect((await low.json()).message).toContain("Minimum order amount");

        mockDb({ coupons: [{ data: coupon({ min_order_amount: 1500 }), error: null }] });
        const missing = await POST(validateRequest({ code: "SAVE10", workshopId: "w1" }));
        expect(missing.status).toBe(400);

        mockDb({ coupons: [{ data: coupon({ min_order_amount: 1500 }), error: null }] });
        const ok = await POST(
            validateRequest({ code: "SAVE10", workshopId: "w1", subtotal: 1500 })
        );
        expect(ok.status).toBe(200);
    });

    it("enforces the applicable workshop list (string ids)", async () => {
        mockDb({
            coupons: [{ data: coupon({ applicable_workshop_ids: ["w1", "w2"] }), error: null }],
        });
        expect((await POST(validateRequest({ code: "SAVE10", workshopId: "w3" }))).status).toBe(
            400
        );

        mockDb({
            coupons: [{ data: coupon({ applicable_workshop_ids: ["w1", "w2"] }), error: null }],
        });
        expect((await POST(validateRequest({ code: "SAVE10", workshopId: "w2" }))).status).toBe(
            200
        );
    });

    describe("applicable_categories (mirrors checkout)", () => {
        it("accepts a workshop in an allowed category", async () => {
            mockDb({
                coupons: [{ data: coupon({ applicable_categories: ["Pottery"] }), error: null }],
                workshops: [{ data: { category: "Pottery" }, error: null }],
            });

            const res = await POST(
                validateRequest({ code: "SAVE10", workshopId: "w1", subtotal: 500 })
            );

            expect(res.status).toBe(200);
        });

        it("rejects a workshop in a different category", async () => {
            mockDb({
                coupons: [{ data: coupon({ applicable_categories: ["Pottery"] }), error: null }],
                workshops: [{ data: { category: "Baking" }, error: null }],
            });

            const res = await POST(
                validateRequest({ code: "SAVE10", workshopId: "w1", subtotal: 500 })
            );

            expect(res.status).toBe(400);
        });

        it("rejects when the workshop is unknown or has no category", async () => {
            mockDb({
                coupons: [{ data: coupon({ applicable_categories: ["Pottery"] }), error: null }],
                workshops: [{ data: null, error: null }],
            });
            expect((await POST(validateRequest({ code: "SAVE10", workshopId: "w1" }))).status).toBe(
                400
            );

            mockDb({
                coupons: [{ data: coupon({ applicable_categories: ["Pottery"] }), error: null }],
                workshops: [{ data: { category: null }, error: null }],
            });
            expect((await POST(validateRequest({ code: "SAVE10", workshopId: "w1" }))).status).toBe(
                400
            );
        });

        it("rejects when no workshop id is supplied", async () => {
            mockDb({
                coupons: [{ data: coupon({ applicable_categories: ["Pottery"] }), error: null }],
            });

            const res = await POST(validateRequest({ code: "SAVE10" }));

            expect(res.status).toBe(400);
        });

        it("ignores an empty category list", async () => {
            mockDb({ coupons: [{ data: coupon({ applicable_categories: [] }), error: null }] });

            const res = await POST(validateRequest({ code: "SAVE10", workshopId: "w1" }));

            expect(res.status).toBe(200);
        });
    });
});
