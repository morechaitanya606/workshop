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

import { GET, POST } from "./route";

function listRequest(query = "") {
    return new NextRequest(`http://localhost/api/coupons${query}`);
}

function createRequest(body: unknown) {
    return new NextRequest("http://localhost/api/coupons", {
        method: "POST",
        body: JSON.stringify(body),
    });
}

describe("GET /api/coupons", () => {
    beforeEach(() => {
        mocks.enforceRateLimit.mockResolvedValue({ ok: true });
        mocks.requireAdminUser.mockResolvedValue({ ok: true, user: { id: "admin-1" } });
    });

    it("pages with limit + cursor and reports nextCursor", async () => {
        const rows = [
            { id: "c3", created_at: "2026-09-03T00:00:00.000Z" },
            { id: "c2", created_at: "2026-09-02T00:00:00.000Z" },
            { id: "c1", created_at: "2026-09-01T00:00:00.000Z" },
        ];
        const db = createChainableSupabase({ coupons: [{ data: rows, error: null }] });
        mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });

        const response = await GET(listRequest("?limit=2&cursor=2026-09-04T00:00:00.000Z"));
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.coupons).toHaveLength(2);
        expect(body.nextCursor).toBe("2026-09-02T00:00:00.000Z");
        expect(db.callsFor("coupons")).toContainEqual({ op: "limit", args: [3] });
        expect(db.callsFor("coupons")).toContainEqual({
            op: "lt",
            args: ["created_at", "2026-09-04T00:00:00.000Z"],
        });
    });

    it("rejects a limit above the cap", async () => {
        const response = await GET(listRequest("?limit=101"));

        expect(response.status).toBe(400);
    });

    it("does not leak the database error message", async () => {
        const db = createChainableSupabase({
            coupons: [{ data: null, error: { message: "permission denied for table coupons" } }],
        });
        mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });

        const response = await GET(listRequest());

        expect(response.status).toBe(500);
        expect(await response.text()).not.toContain("permission denied for table");
    });
});

describe("POST /api/coupons", () => {
    beforeEach(() => {
        mocks.enforceRateLimit.mockResolvedValue({ ok: true });
        mocks.requireAdminUser.mockResolvedValue({ ok: true, user: { id: "admin-1" } });
    });

    it("creates a coupon with every optional rule, upper-casing the code", async () => {
        const db = createChainableSupabase({
            coupons: [{ data: { id: "coupon-1", code: "SUMMER25" }, error: null }],
        });
        mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });

        const response = await POST(
            createRequest({
                code: "summer25",
                discount_type: "percentage",
                discount_value: 25,
                min_order_amount: 500,
                max_uses: 100,
                valid_from: "2026-10-01T00:00:00.000Z",
                valid_until: "2026-12-31T00:00:00.000Z",
                applicable_categories: ["Pottery"],
                applicable_workshop_ids: ["11111111-2222-4333-8444-555555555555"],
            })
        );

        expect(response.status).toBe(201);
        const insert = db.callsFor("coupons").find((call) => call.op === "insert");
        expect(insert!.args[0]).toMatchObject({
            code: "SUMMER25",
            discount_type: "percentage",
            discount_value: 25,
            min_order_amount: 500,
            max_uses: 100,
            valid_from: "2026-10-01T00:00:00.000Z",
            valid_until: "2026-12-31T00:00:00.000Z",
            applicable_categories: ["Pottery"],
            applicable_workshop_ids: ["11111111-2222-4333-8444-555555555555"],
            created_by: "admin-1",
        });
    });

    it("keeps column defaults by omitting fields that were not sent", async () => {
        const db = createChainableSupabase({ coupons: [{ data: { id: "c" }, error: null }] });
        mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });

        await POST(createRequest({ code: "FLAT100", discount_type: "fixed", discount_value: 100 }));

        const insert = db.callsFor("coupons").find((call) => call.op === "insert");
        const payload = insert!.args[0] as Record<string, unknown>;
        expect(payload).not.toHaveProperty("valid_from");
        expect(payload).not.toHaveProperty("max_uses");
        expect(payload).not.toHaveProperty("is_active");
    });

    it.each([
        ["an unknown discount type", { discount_type: "bogo", discount_value: 10 }],
        ["a percentage above 100", { discount_type: "percentage", discount_value: 150 }],
        ["a negative value", { discount_type: "fixed", discount_value: -5 }],
        ["a zero value", { discount_type: "fixed", discount_value: 0 }],
        ["a non-numeric value", { discount_type: "fixed", discount_value: "lots" }],
        ["max_uses of zero", { discount_type: "fixed", discount_value: 5, max_uses: 0 }],
        [
            "an expiry before the start",
            {
                discount_type: "fixed",
                discount_value: 5,
                valid_from: "2026-12-01T00:00:00.000Z",
                valid_until: "2026-11-01T00:00:00.000Z",
            },
        ],
        [
            "a negative minimum order",
            { discount_type: "fixed", discount_value: 5, min_order_amount: -1 },
        ],
    ])("rejects %s", async (_label, fields) => {
        const db = createChainableSupabase();
        mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });

        const response = await POST(createRequest({ code: "BADCODE", ...fields }));

        expect(response.status).toBe(400);
        expect(db.tables()).not.toContain("coupons");
    });

    it("rejects a code with unsafe characters", async () => {
        const response = await POST(
            createRequest({ code: "A,B)(", discount_type: "fixed", discount_value: 5 })
        );

        expect(response.status).toBe(400);
    });

    it("answers 409 for a duplicate code and never echoes the Postgres message", async () => {
        const db = createChainableSupabase({
            coupons: [
                {
                    data: null,
                    error: {
                        code: "23505",
                        message:
                            'duplicate key value violates unique constraint "coupons_code_key"',
                    },
                },
            ],
        });
        mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });

        const response = await POST(
            createRequest({ code: "SAVE10", discount_type: "fixed", discount_value: 10 })
        );
        const text = await response.text();

        expect(response.status).toBe(409);
        expect(text).not.toContain("coupons_code_key");
    });
});
