import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createChainableSupabase } from "@/test/chainable-supabase";

const mocks = vi.hoisted(() => ({
    requireAdminUser: vi.fn(),
    requireSupabaseService: vi.fn(),
    enforceRateLimit: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
    requireAdminUser: mocks.requireAdminUser,
    jsonError: (message: string, status = 400) =>
        new Response(JSON.stringify({ error: message }), {
            status,
            headers: { "content-type": "application/json" },
        }),
}));
vi.mock("@/lib/api-helpers", () => ({ requireSupabaseService: mocks.requireSupabaseService }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: mocks.enforceRateLimit }));
vi.mock("@sentry/nextjs", () => ({ captureException: () => undefined }));

import { PATCH } from "./route";

const COUPON_ID = "11111111-2222-4333-8444-555555555555";

function patch(body: unknown, id = COUPON_ID) {
    return PATCH(
        new NextRequest(`http://localhost/api/coupons/${id}`, {
            method: "PATCH",
            body: JSON.stringify(body),
        }),
        { params: Promise.resolve({ id }) }
    );
}

describe("PATCH /api/coupons/[id]", () => {
    beforeEach(() => {
        mocks.enforceRateLimit.mockResolvedValue({ ok: true });
        mocks.requireAdminUser.mockResolvedValue({ ok: true, user: { id: "admin-1" } });
    });

    it("toggles is_active (the shape the admin UI sends)", async () => {
        const db = createChainableSupabase({
            coupons: [{ data: { id: COUPON_ID, is_active: false }, error: null }],
        });
        mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });

        const response = await patch({ is_active: false });

        expect(response.status).toBe(200);
        const update = db.callsFor("coupons").find((call) => call.op === "update");
        expect(update!.args[0]).toMatchObject({ is_active: false });
        expect(update!.args[0]).not.toHaveProperty("discount_type");
    });

    it("updates the usage rules", async () => {
        const db = createChainableSupabase({
            coupons: [{ data: { id: COUPON_ID }, error: null }],
        });
        mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });

        const response = await patch({
            max_uses: 50,
            valid_until: "2026-12-31T00:00:00.000Z",
            applicable_categories: ["Baking"],
        });

        expect(response.status).toBe(200);
        const update = db.callsFor("coupons").find((call) => call.op === "update");
        expect(update!.args[0]).toMatchObject({
            max_uses: 50,
            valid_until: "2026-12-31T00:00:00.000Z",
            applicable_categories: ["Baking"],
        });
    });

    it("rejects an empty update and a non-uuid id", async () => {
        mocks.requireSupabaseService.mockReturnValue({
            ok: true,
            client: createChainableSupabase().client,
        });

        expect((await patch({})).status).toBe(400);
        expect((await patch({ is_active: true }, "not-a-uuid")).status).toBe(400);
    });

    it("re-checks the 100% cap against the stored discount type", async () => {
        const db = createChainableSupabase({
            coupons: [{ data: { discount_type: "percentage", discount_value: 10 }, error: null }],
        });
        mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });

        const response = await patch({ discount_value: 250 });

        expect(response.status).toBe(400);
        expect(db.callsFor("coupons").some((call) => call.op === "update")).toBe(false);
    });

    it("returns 404 when the coupon does not exist", async () => {
        const db = createChainableSupabase({ coupons: [{ data: null, error: null }] });
        mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });

        const response = await patch({ is_active: true });

        expect(response.status).toBe(404);
    });
});
