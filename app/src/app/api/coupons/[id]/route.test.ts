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

import { DELETE, PATCH } from "./route";

const COUPON_ID = "11111111-2222-4333-8444-555555555555";
const OTHER_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function patch(body: unknown, id = COUPON_ID) {
    return PATCH(
        new NextRequest(`http://localhost/api/coupons/${id}`, {
            method: "PATCH",
            body: JSON.stringify(body),
        }),
        { params: Promise.resolve({ id }) }
    );
}

/**
 * The writes to platform_settings: an UPDATE guarded by the version that was read (the setting
 * exists), or an INSERT that does nothing if the row appeared meanwhile (it did not exist yet).
 */
function writesOf(db: ReturnType<typeof createChainableSupabase>) {
    return db
        .callsFor("platform_settings")
        .filter((call) => call.op === "update" || call.op === "upsert");
}

/** The version each guarded write is conditioned on (the updated_at that was read). */
function versionsWrittenOver(db: ReturnType<typeof createChainableSupabase>) {
    return db.log
        .filter((entry) => entry.table === "platform_settings")
        .filter((entry) => entry.calls.some((call) => call.op === "update"))
        .map(
            (entry) =>
                entry.calls.find((call) => call.op === "eq" && call.args[0] === "updated_at")
                    ?.args[1]
        );
}

const WRITTEN = { data: [{ setting_key: "coupon_offers" }], error: null };
/** The guarded write matched no row: another save changed the setting after it was read. */
const CONFLICT = { data: [], error: null };
const THIRD_ID = "99999999-8888-4777-8666-555555555555";

describe("PATCH /api/coupons/[id]", () => {
    beforeEach(() => {
        mocks.enforceRateLimit.mockResolvedValue({ ok: true });
        mocks.requireAdminUser.mockResolvedValue({ ok: true, user: { id: "admin-1" } });
        mocks.findLabelsRevealingCodes.mockResolvedValue({ ok: true, couponIds: [] });
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
        // Rules only: the display settings are read for the answer, never written.
        expect(writesOf(db)).toHaveLength(0);
        expect(revalidateTag).toHaveBeenCalledWith("public-offers");
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

    it("writes a display-only change into coupon_offers, keeping other coupons' entries", async () => {
        const db = createChainableSupabase({
            coupons: [{ data: { id: COUPON_ID, code: "LIMITED10" }, error: null }],
            platform_settings: [
                {
                    data: { setting_value: { [OTHER_ID]: { visibility: "community" } } },
                    error: null,
                },
                { error: null },
            ],
        });
        mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });

        const response = await patch({
            visibility: "auto",
            label: "Limited-time offer",
            show_end_date: true,
        });
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.coupon).toMatchObject({
            id: COUPON_ID,
            visibility: "auto",
            label: "Limited-time offer",
            show_end_date: true,
            min_guests: null,
        });
        // No row update for display fields.
        expect(db.callsFor("coupons").some((call) => call.op === "update")).toBe(false);
        expect(writesOf(db)[0].args[0]).toMatchObject({
            setting_value: {
                [OTHER_ID]: { visibility: "community" },
                [COUPON_ID]: {
                    visibility: "auto",
                    label: "Limited-time offer",
                    show_end_date: true,
                },
            },
        });
        expect(mocks.findLabelsRevealingCodes).toHaveBeenCalledWith(
            expect.objectContaining({ [COUPON_ID]: expect.any(Object) }),
            db.client
        );
        expect(revalidateTag).toHaveBeenCalledWith("platform-settings");
        expect(revalidateTag).toHaveBeenCalledWith("public-offers");
    });

    it("changes only the display fields sent (a partial patch keeps the rest)", async () => {
        const db = createChainableSupabase({
            coupons: [{ data: { id: COUPON_ID }, error: null }],
            platform_settings: [
                {
                    data: {
                        setting_value: {
                            [COUPON_ID]: { visibility: "auto", label: "Old", min_guests: 2 },
                        },
                    },
                    error: null,
                },
                { error: null },
            ],
        });
        mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });

        const response = await patch({ label: "Group offer" });

        expect(response.status).toBe(200);
        expect(writesOf(db)[0].args[0]).toMatchObject({
            setting_value: {
                [COUPON_ID]: { visibility: "auto", label: "Group offer", min_guests: 2 },
            },
        });
    });

    it("removes the entry when the coupon goes back to a plain hidden code", async () => {
        const db = createChainableSupabase({
            coupons: [{ data: { id: COUPON_ID }, error: null }],
            platform_settings: [
                {
                    data: {
                        setting_value: {
                            [COUPON_ID]: { visibility: "auto", label: "Old" },
                            [OTHER_ID]: { visibility: "listed" },
                        },
                    },
                    error: null,
                },
                { error: null },
            ],
        });
        mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });

        const response = await patch({
            visibility: "hidden",
            label: null,
            min_guests: null,
            show_end_date: false,
        });

        expect(response.status).toBe(200);
        const stored = writesOf(db)[0].args[0] as { setting_value: Record<string, unknown> };
        expect(stored.setting_value).toEqual({ [OTHER_ID]: { visibility: "listed" } });
        expect((await response.json()).coupon.visibility).toBe("hidden");
    });

    it("keeps an entry another save added between the read and the write", async () => {
        const db = createChainableSupabase({
            coupons: [{ data: { id: COUPON_ID, code: "LIMITED10" }, error: null }],
            platform_settings: [
                {
                    data: {
                        setting_value: { [OTHER_ID]: { visibility: "community" } },
                        updated_at: "2026-10-24T08:00:00.000Z",
                    },
                    error: null,
                },
                CONFLICT,
                {
                    data: {
                        setting_value: {
                            [OTHER_ID]: { visibility: "community" },
                            [THIRD_ID]: { visibility: "listed" },
                        },
                        updated_at: "2026-10-24T08:00:03.000Z",
                    },
                    error: null,
                },
                WRITTEN,
            ],
        });
        mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });

        const response = await patch({ visibility: "auto", label: "Limited-time offer" });
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.warning).toBeUndefined();
        expect(body.coupon).toMatchObject({ visibility: "auto", label: "Limited-time offer" });
        const writes = writesOf(db);
        expect(writes).toHaveLength(2);
        // The retry is built on the newer setting: the entry saved in between survives.
        expect(writes[1].args[0]).toMatchObject({
            setting_value: {
                [OTHER_ID]: { visibility: "community" },
                [THIRD_ID]: { visibility: "listed" },
                [COUPON_ID]: { visibility: "auto", label: "Limited-time offer" },
            },
        });
        // Each write only lands if the setting is still the version it was built from.
        expect(versionsWrittenOver(db)).toEqual([
            "2026-10-24T08:00:00.000Z",
            "2026-10-24T08:00:03.000Z",
        ]);
        // The labels are checked again against what is about to be stored.
        expect(mocks.findLabelsRevealingCodes).toHaveBeenCalledTimes(2);
    });

    it("answers 200 with a warning when other saves keep getting in first", async () => {
        const read = (updatedAt: string) => ({
            data: { setting_value: {}, updated_at: updatedAt },
            error: null,
        });
        const db = createChainableSupabase({
            coupons: [{ data: { id: COUPON_ID, code: "LIMITED10" }, error: null }],
            platform_settings: [
                read("2026-10-24T08:00:00.000Z"),
                CONFLICT,
                read("2026-10-24T08:00:01.000Z"),
                CONFLICT,
                read("2026-10-24T08:00:02.000Z"),
                CONFLICT,
                read("2026-10-24T08:00:03.000Z"),
                CONFLICT,
                // What the answer reports as stored.
                { data: null, error: null },
            ],
        });
        mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });

        const response = await patch({ visibility: "auto" });
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.warning).toMatch(/offer settings were not/);
        expect(body.warning).toMatch(/Try again/);
        expect(body.coupon.visibility).toBe("hidden");
        expect(writesOf(db)).toHaveLength(4);
    });

    it("refuses a label that contains the coupon's code and writes nothing", async () => {
        mocks.findLabelsRevealingCodes.mockResolvedValue({ ok: true, couponIds: [COUPON_ID] });
        const db = createChainableSupabase({
            platform_settings: [{ data: null, error: null }],
        });
        mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });

        const response = await patch({
            visibility: "community",
            label: "Use WHATSAPP15",
            is_active: true,
        });
        const body = await response.json();

        expect(response.status).toBe(400);
        expect(body.code).toBe("LABEL_REVEALS_CODE");
        expect(body.couponIds).toEqual([COUPON_ID]);
        expect(db.callsFor("coupons").some((call) => call.op === "update")).toBe(false);
        expect(writesOf(db)).toHaveLength(0);
    });

    it("answers 503 and writes nothing when the codes cannot be checked", async () => {
        mocks.findLabelsRevealingCodes.mockResolvedValue({ ok: false });
        const db = createChainableSupabase({
            platform_settings: [{ data: null, error: null }],
        });
        mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });

        const response = await patch({ label: "Festive offer", is_active: true });

        expect(response.status).toBe(503);
        expect((await response.json()).code).toBe("LABEL_CHECK_FAILED");
        expect(db.callsFor("coupons")).toHaveLength(0);
        expect(writesOf(db)).toHaveLength(0);
    });

    it("answers 503 and writes nothing when the display settings cannot be read", async () => {
        const db = createChainableSupabase({
            platform_settings: [{ data: null, error: { message: "timeout" } }],
        });
        mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });

        const response = await patch({ visibility: "listed", max_uses: 5 });

        expect(response.status).toBe(503);
        expect((await response.json()).code).toBe("OFFER_SETTINGS_READ_FAILED");
        expect(db.callsFor("coupons")).toHaveLength(0);
        expect(writesOf(db)).toHaveLength(0);
    });

    it("does not write an entry for a coupon that does not exist", async () => {
        const db = createChainableSupabase({
            coupons: [{ data: null, error: null }],
            platform_settings: [{ data: null, error: null }],
        });
        mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });

        const response = await patch({ visibility: "listed" });

        expect(response.status).toBe(404);
        expect(writesOf(db)).toHaveLength(0);
    });

    it("answers 200 with a warning when only the display save fails", async () => {
        const db = createChainableSupabase({
            coupons: [{ data: { id: COUPON_ID, is_active: true }, error: null }],
            platform_settings: [
                { data: null, error: null },
                { error: { message: "upsert failed on platform_settings" } },
                { data: null, error: null },
            ],
        });
        mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });

        const response = await patch({ is_active: true, visibility: "listed" });
        const text = await response.text();
        const body = JSON.parse(text);

        expect(response.status).toBe(200);
        expect(body.warning).toMatch(/offer settings were not/);
        expect(body.coupon.visibility).toBe("hidden");
        expect(text).not.toContain("upsert failed");
    });

    it("is admin-only", async () => {
        mocks.requireAdminUser.mockResolvedValue({
            ok: false,
            response: new Response(null, { status: 403 }),
        });

        expect((await patch({ visibility: "auto" })).status).toBe(403);
        expect(mocks.requireSupabaseService).not.toHaveBeenCalled();
    });
});

function remove(id = COUPON_ID) {
    return DELETE(new NextRequest(`http://localhost/api/coupons/${id}`, { method: "DELETE" }), {
        params: Promise.resolve({ id }),
    });
}

describe("DELETE /api/coupons/[id]", () => {
    beforeEach(() => {
        mocks.enforceRateLimit.mockResolvedValue({ ok: true });
        mocks.requireAdminUser.mockResolvedValue({ ok: true, user: { id: "admin-1" } });
        mocks.findLabelsRevealingCodes.mockResolvedValue({ ok: true, couponIds: [] });
    });

    it("deletes the coupon by id", async () => {
        const db = createChainableSupabase({ coupons: [{ data: { id: COUPON_ID }, error: null }] });
        mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });

        const response = await remove();

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ ok: true, id: COUPON_ID });
        const calls = db.callsFor("coupons");
        expect(calls.some((call) => call.op === "delete")).toBe(true);
        expect(calls.find((call) => call.op === "eq")!.args).toEqual(["id", COUPON_ID]);
        // No entry for it: nothing to tidy up.
        expect(writesOf(db)).toHaveLength(0);
    });

    it("removes the coupon's coupon_offers entry", async () => {
        const db = createChainableSupabase({
            coupons: [{ data: { id: COUPON_ID }, error: null }],
            platform_settings: [
                {
                    data: {
                        setting_value: {
                            [COUPON_ID]: { visibility: "auto" },
                            [OTHER_ID]: { visibility: "listed" },
                        },
                    },
                    error: null,
                },
                { error: null },
            ],
        });
        mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });

        const response = await remove();

        expect(response.status).toBe(200);
        const stored = writesOf(db)[0].args[0] as { setting_value: Record<string, unknown> };
        expect(stored.setting_value).toEqual({ [OTHER_ID]: { visibility: "listed" } });
        expect(mocks.findLabelsRevealingCodes).toHaveBeenCalledTimes(1);
    });

    it("removes only its own entry when another save got in first", async () => {
        const db = createChainableSupabase({
            coupons: [{ data: { id: COUPON_ID }, error: null }],
            platform_settings: [
                {
                    data: {
                        setting_value: { [COUPON_ID]: { visibility: "auto" } },
                        updated_at: "2026-10-24T08:00:00.000Z",
                    },
                    error: null,
                },
                CONFLICT,
                {
                    data: {
                        setting_value: {
                            [COUPON_ID]: { visibility: "auto" },
                            [THIRD_ID]: { visibility: "listed" },
                        },
                        updated_at: "2026-10-24T08:00:03.000Z",
                    },
                    error: null,
                },
                WRITTEN,
            ],
        });
        mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });

        const response = await remove();

        expect(response.status).toBe(200);
        expect((await response.json()).warning).toBeUndefined();
        const writes = writesOf(db);
        expect(writes).toHaveLength(2);
        const stored = writes[1].args[0] as { setting_value: Record<string, unknown> };
        expect(stored.setting_value).toEqual({ [THIRD_ID]: { visibility: "listed" } });
    });

    it("still deletes, with a warning, when the entry cannot be tidied up", async () => {
        const db = createChainableSupabase({
            coupons: [{ data: { id: COUPON_ID }, error: null }],
            platform_settings: [{ data: null, error: { message: "timeout" } }],
        });
        mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });

        const response = await remove();
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toMatchObject({ ok: true, id: COUPON_ID });
        expect(body.warning).toBeTruthy();
    });

    it("returns 404 when the coupon does not exist", async () => {
        const db = createChainableSupabase({ coupons: [{ data: null, error: null }] });
        mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });

        expect((await remove()).status).toBe(404);
    });

    it("rejects a non-uuid id without touching the database", async () => {
        const db = createChainableSupabase();
        mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });

        expect((await remove("not-a-uuid")).status).toBe(400);
        expect(db.callsFor("coupons")).toHaveLength(0);
    });

    it("is admin-only", async () => {
        mocks.requireAdminUser.mockResolvedValue({
            ok: false,
            response: new Response(null, { status: 403 }),
        });

        expect((await remove()).status).toBe(403);
    });
});
