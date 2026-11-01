import { NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createChainableSupabase } from "@/test/chainable-supabase";

const mocks = vi.hoisted(() => ({
    requireAdminUser: vi.fn(),
    requireSupabaseService: vi.fn(),
    enforceRateLimit: vi.fn(),
    findLabelsRevealingCodes: vi.fn(),
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
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("@/lib/cached-reads", () => ({
    OFFERS_TAG: "public-offers",
    PLATFORM_SETTINGS_TAG: "platform-settings",
}));
vi.mock("@/lib/offers-server", () => ({
    findLabelsRevealingCodes: mocks.findLabelsRevealingCodes,
}));

import { GET, POST } from "./route";

const NEW_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const OTHER_ID = "11111111-2222-4333-8444-555555555555";
const THIRD_ID = "99999999-8888-4777-8666-555555555555";

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

    it("merges each coupon's display settings in (no entry = hidden code)", async () => {
        const db = createChainableSupabase({
            coupons: [
                {
                    data: [
                        { id: NEW_ID, code: "DIWALI10", created_at: "2026-10-02T00:00:00Z" },
                        { id: OTHER_ID, code: "SECRET", created_at: "2026-10-01T00:00:00Z" },
                    ],
                    error: null,
                },
            ],
            platform_settings: [
                {
                    data: {
                        setting_value: {
                            [NEW_ID]: {
                                visibility: "auto",
                                label: "Limited-time offer",
                                min_guests: 2,
                                show_end_date: true,
                            },
                        },
                    },
                    error: null,
                },
            ],
        });
        mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });

        const body = await (await GET(listRequest())).json();

        expect(body.offerSettingsOk).toBe(true);
        expect(body.coupons[0]).toMatchObject({
            id: NEW_ID,
            visibility: "auto",
            label: "Limited-time offer",
            min_guests: 2,
            show_end_date: true,
        });
        expect(body.coupons[1]).toMatchObject({
            id: OTHER_ID,
            visibility: "hidden",
            label: null,
            min_guests: null,
            show_end_date: false,
        });
    });

    it("still lists coupons when the display settings cannot be read, and says so", async () => {
        const db = createChainableSupabase({
            coupons: [{ data: [{ id: NEW_ID, created_at: "2026-10-02T00:00:00Z" }], error: null }],
            platform_settings: [{ data: null, error: { message: "timeout" } }],
        });
        mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });

        const response = await GET(listRequest());
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.coupons).toHaveLength(1);
        expect(body.offerSettingsOk).toBe(false);
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

    it("is admin-only", async () => {
        mocks.requireAdminUser.mockResolvedValue({
            ok: false,
            response: new Response(null, { status: 403 }),
        });

        expect((await GET(listRequest())).status).toBe(403);
        expect(mocks.requireSupabaseService).not.toHaveBeenCalled();
    });
});

describe("POST /api/coupons", () => {
    beforeEach(() => {
        mocks.enforceRateLimit.mockResolvedValue({ ok: true });
        mocks.requireAdminUser.mockResolvedValue({ ok: true, user: { id: "admin-1" } });
        mocks.findLabelsRevealingCodes.mockResolvedValue({ ok: true, couponIds: [] });
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
        // A plain coupon never reads or writes the display settings.
        expect(db.tables()).not.toContain("platform_settings");
        expect(revalidateTag).toHaveBeenCalledWith("public-offers");
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
        // Display fields are never coupon columns.
        expect(payload).not.toHaveProperty("visibility");
        expect(payload).not.toHaveProperty("label");
    });

    it("stores the display settings in coupon_offers, keeping the other entries", async () => {
        const db = createChainableSupabase({
            coupons: [{ data: { id: NEW_ID, code: "DIWALI10" }, error: null }],
            platform_settings: [
                {
                    data: { setting_value: { [OTHER_ID]: { visibility: "listed" } } },
                    error: null,
                },
                { error: null },
            ],
        });
        mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });

        const response = await POST(
            createRequest({
                code: "diwali10",
                discount_type: "percentage",
                discount_value: 10,
                valid_until: "2026-11-10T18:30:00.000Z",
                visibility: "auto",
                label: "  Limited-time offer ",
                min_guests: 2,
                show_end_date: true,
            })
        );
        const body = await response.json();

        expect(response.status).toBe(201);
        expect(body.warning).toBeUndefined();
        expect(body.coupon).toMatchObject({
            id: NEW_ID,
            visibility: "auto",
            label: "Limited-time offer",
            min_guests: 2,
            show_end_date: true,
        });
        // The setting exists, so this is an UPDATE guarded by the version that was read.
        const update = db.callsFor("platform_settings").find((call) => call.op === "update");
        expect(update!.args[0]).toMatchObject({
            setting_value: {
                [OTHER_ID]: { visibility: "listed" },
                [NEW_ID]: {
                    visibility: "auto",
                    label: "Limited-time offer",
                    min_guests: 2,
                    show_end_date: true,
                },
            },
        });
        expect(mocks.findLabelsRevealingCodes).toHaveBeenCalledTimes(1);
        expect(revalidateTag).toHaveBeenCalledWith("public-offers");
        expect(revalidateTag).toHaveBeenCalledWith("platform-settings");
    });

    it("creates the setting with an insert that cannot overwrite a row saved meanwhile", async () => {
        const db = createChainableSupabase({
            coupons: [{ data: { id: NEW_ID, code: "DIWALI10" }, error: null }],
            platform_settings: [
                { data: null, error: null },
                { data: [{ setting_key: "coupon_offers" }], error: null },
            ],
        });
        mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });

        const response = await POST(
            createRequest({
                code: "DIWALI10",
                discount_type: "percentage",
                discount_value: 10,
                visibility: "listed",
            })
        );

        expect(response.status).toBe(201);
        const upsert = db.callsFor("platform_settings").find((call) => call.op === "upsert");
        expect(upsert!.args[0]).toMatchObject({
            setting_key: "coupon_offers",
            setting_value: { [NEW_ID]: { visibility: "listed" } },
        });
        expect(upsert!.args[1]).toEqual({ onConflict: "setting_key", ignoreDuplicates: true });
    });

    it("keeps an entry another save added while this coupon was being created", async () => {
        const db = createChainableSupabase({
            coupons: [{ data: { id: NEW_ID, code: "DIWALI10" }, error: null }],
            platform_settings: [
                {
                    data: {
                        setting_value: { [OTHER_ID]: { visibility: "listed" } },
                        updated_at: "2026-10-24T08:00:00.000Z",
                    },
                    error: null,
                },
                // The guarded write finds the setting changed since the read.
                { data: [], error: null },
                {
                    data: {
                        setting_value: {
                            [OTHER_ID]: { visibility: "listed" },
                            [THIRD_ID]: { visibility: "community" },
                        },
                        updated_at: "2026-10-24T08:00:02.000Z",
                    },
                    error: null,
                },
                { data: [{ setting_key: "coupon_offers" }], error: null },
            ],
        });
        mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });

        const response = await POST(
            createRequest({
                code: "DIWALI10",
                discount_type: "percentage",
                discount_value: 10,
                visibility: "auto",
                label: "Festive offer",
            })
        );
        const body = await response.json();

        expect(response.status).toBe(201);
        expect(body.warning).toBeUndefined();
        expect(body.coupon).toMatchObject({
            id: NEW_ID,
            visibility: "auto",
            label: "Festive offer",
        });
        const writes = db.callsFor("platform_settings").filter((call) => call.op === "update");
        expect(writes).toHaveLength(2);
        expect(writes[1].args[0]).toMatchObject({
            setting_value: {
                [OTHER_ID]: { visibility: "listed" },
                [THIRD_ID]: { visibility: "community" },
                [NEW_ID]: { visibility: "auto", label: "Festive offer" },
            },
        });
        expect(mocks.findLabelsRevealingCodes).toHaveBeenCalledTimes(2);
    });

    it("keeps the coupon as a hidden code and says so when other saves keep winning", async () => {
        const read = (updatedAt: string) => ({
            data: { setting_value: {}, updated_at: updatedAt },
            error: null,
        });
        const lost = { data: [], error: null };
        const db = createChainableSupabase({
            coupons: [{ data: { id: NEW_ID, code: "DIWALI10" }, error: null }],
            platform_settings: [
                read("2026-10-24T08:00:00.000Z"),
                lost,
                read("2026-10-24T08:00:01.000Z"),
                lost,
                read("2026-10-24T08:00:02.000Z"),
                lost,
                read("2026-10-24T08:00:03.000Z"),
                lost,
            ],
        });
        mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });

        const response = await POST(
            createRequest({
                code: "DIWALI10",
                discount_type: "percentage",
                discount_value: 10,
                visibility: "auto",
            })
        );
        const body = await response.json();

        expect(response.status).toBe(201);
        expect(body.warning).toMatch(/hidden code/);
        expect(body.warning).toMatch(/Try again/);
        expect(body.coupon.visibility).toBe("hidden");
    });

    it.each([
        ["hidden", "Use DIWALI10"],
        ["community", "diwali 10 for members"],
        ["auto", "get-diwali10"],
    ])("refuses a %s label that spells out the code, saving nothing", async (visibility, label) => {
        const db = createChainableSupabase();
        mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });

        const response = await POST(
            createRequest({
                code: "DIWALI10",
                discount_type: "percentage",
                discount_value: 10,
                visibility,
                label,
            })
        );

        expect(response.status).toBe(400);
        expect(db.tables()).toEqual([]);
    });

    it("allows the code in a Listed offer's label (its code is shown anyway)", async () => {
        const db = createChainableSupabase({
            coupons: [{ data: { id: NEW_ID, code: "DIWALI10" }, error: null }],
            platform_settings: [{ data: null, error: null }, { error: null }],
        });
        mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });

        const response = await POST(
            createRequest({
                code: "DIWALI10",
                discount_type: "percentage",
                discount_value: 10,
                visibility: "listed",
                label: "Use DIWALI10",
            })
        );

        expect(response.status).toBe(201);
    });

    it("saves nothing when the display settings cannot be read", async () => {
        const db = createChainableSupabase({
            platform_settings: [{ data: null, error: { message: "relation timeout" } }],
        });
        mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });

        const response = await POST(
            createRequest({
                code: "COMMUNITY15",
                discount_type: "percentage",
                discount_value: 15,
                visibility: "community",
            })
        );
        const text = await response.text();

        expect(response.status).toBe(503);
        expect(JSON.parse(text).code).toBe("OFFER_SETTINGS_READ_FAILED");
        expect(text).not.toContain("relation");
        expect(db.tables()).not.toContain("coupons");
    });

    it("keeps the coupon as a hidden code and warns when the label check fails", async () => {
        mocks.findLabelsRevealingCodes.mockResolvedValue({ ok: false });
        const db = createChainableSupabase({
            coupons: [{ data: { id: NEW_ID, code: "GROUP2" }, error: null }],
            platform_settings: [{ data: null, error: null }],
        });
        mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });

        const response = await POST(
            createRequest({
                code: "GROUP2",
                discount_type: "percentage",
                discount_value: 10,
                visibility: "auto",
                min_guests: 2,
            })
        );
        const body = await response.json();

        expect(response.status).toBe(201);
        expect(body.warning).toMatch(/hidden code/);
        expect(body.coupon.visibility).toBe("hidden");
        expect(
            db
                .callsFor("platform_settings")
                .some((call) => call.op === "update" || call.op === "upsert")
        ).toBe(false);
    });

    it("rejects showing an end date without one", async () => {
        const db = createChainableSupabase();
        mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });

        const response = await POST(
            createRequest({
                code: "LIMITED10",
                discount_type: "percentage",
                discount_value: 10,
                visibility: "auto",
                show_end_date: true,
            })
        );

        expect(response.status).toBe(400);
        expect(db.tables()).toEqual([]);
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
        ["an unknown visibility", { discount_type: "fixed", discount_value: 5, visibility: "x" }],
        [
            "a label over 40 characters",
            { discount_type: "fixed", discount_value: 5, label: "x".repeat(41) },
        ],
        ["a two-line label", { discount_type: "fixed", discount_value: 5, label: "Big\nsale" }],
        ["a seat minimum above 20", { discount_type: "fixed", discount_value: 5, min_guests: 21 }],
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

    it("is admin-only", async () => {
        mocks.requireAdminUser.mockResolvedValue({
            ok: false,
            response: new Response(null, { status: 403 }),
        });

        const response = await POST(
            createRequest({ code: "SAVE10", discount_type: "fixed", discount_value: 10 })
        );

        expect(response.status).toBe(403);
        expect(mocks.requireSupabaseService).not.toHaveBeenCalled();
    });
});
