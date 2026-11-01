import * as Sentry from "@sentry/nextjs";
import { NextRequest } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createChainableSupabase, type QueuedResult } from "@/test/chainable-supabase";
import { createFakeSettingsClient } from "@/test/fake-platform-settings";

const mocks = vi.hoisted(() => ({
    requireAdminUser: vi.fn(),
    requireSupabaseService: vi.fn(),
    assertRateLimit: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/api-auth", () => ({
    requireAdminUser: mocks.requireAdminUser,
    jsonError: (message: string, status = 400) =>
        new Response(JSON.stringify({ error: message }), {
            status,
            headers: { "content-type": "application/json" },
        }),
}));
vi.mock("@/lib/api-helpers", () => ({ requireSupabaseService: mocks.requireSupabaseService }));
vi.mock("@/lib/rate-limit", () => ({
    assertRateLimit: mocks.assertRateLimit,
    getRateLimitKey: () => "key",
}));
vi.mock("@/lib/cached-reads", () => ({
    PLATFORM_SETTINGS_TAG: "platform-settings",
    WORKSHOPS_LIST_TAG: "workshops-list",
    OFFERS_TAG: "public-offers",
    workshopTag: (id: string) => `workshop:${id}`,
    getCachedPlatformSettings: vi.fn(),
}));

import { GET, PATCH, POST } from "./route";

const POTTERY = "pottery-wheel-1760000000000";
const BAKING = "sourdough-baking-1760000000001";
const PAINTING = "watercolour-1760000000002";
const KEY = "closed_workshop_ids";
const V1 = "2026-10-24T08:00:00.000Z";
const V2 = "2026-10-24T08:00:05.000Z";

function post(body: unknown, id = POTTERY) {
    return POST(
        new NextRequest(`http://localhost/api/admin/workshops/${id}/booking-status`, {
            method: "POST",
            body: JSON.stringify(body),
            headers: { "content-type": "application/json" },
        }),
        { params: Promise.resolve({ id }) }
    );
}

function get(id = POTTERY) {
    return GET(new NextRequest(`http://localhost/api/admin/workshops/${id}/booking-status`), {
        params: Promise.resolve({ id }),
    });
}

/** A stored row as the fresh read sees it. */
function row(ids: unknown, updatedAt: string | null = V1): QueuedResult {
    return { data: { setting_value: ids, updated_at: updatedAt }, error: null };
}
const WRITTEN: QueuedResult = { data: [{ setting_key: KEY }], error: null };
/** The conditional write matched no row: someone else saved first. */
const CONFLICT: QueuedResult = { data: [], error: null };

function setup({
    workshop = { data: { id: POTTERY }, error: null },
    settings = [],
}: {
    workshop?: QueuedResult;
    settings?: QueuedResult[];
} = {}) {
    const db = createChainableSupabase({ workshops: [workshop], platform_settings: settings });
    mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });
    return db;
}

/** One entry per platform_settings write, with its chained calls (filters included). */
function writesOf(db: ReturnType<typeof setup>) {
    return db.log
        .filter((entry) => entry.table === "platform_settings")
        .filter((entry) => entry.calls.some((call) => call.op === "update" || call.op === "upsert"))
        .map((entry) => ({
            calls: entry.calls,
            op: entry.calls.find((call) => call.op === "update" || call.op === "upsert")!,
            filters: entry.calls.filter((call) => call.op === "eq" || call.op === "is"),
        }));
}

describe("/api/admin/workshops/[id]/booking-status", () => {
    beforeEach(() => {
        mocks.requireAdminUser.mockResolvedValue({ ok: true, user: { id: "admin-1" } });
        mocks.assertRateLimit.mockResolvedValue({ ok: true });
    });

    it("is admin-only and touches nothing for anyone else", async () => {
        mocks.requireAdminUser.mockResolvedValue({
            ok: false,
            response: new Response(null, { status: 403 }),
        });
        const db = setup();

        expect((await post({ closed: true })).status).toBe(403);
        expect((await get()).status).toBe(403);
        expect(db.tables()).toEqual([]);
        expect(revalidateTag).not.toHaveBeenCalled();
    });

    it("closes bookings: adds the id to a fresh read and keeps every other closed workshop", async () => {
        const db = setup({ settings: [row([BAKING]), WRITTEN] });

        const response = await post({ closed: true });
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toEqual({
            workshopId: POTTERY,
            closed: true,
            closedWorkshopIds: [BAKING, POTTERY],
        });
        const [write] = writesOf(db);
        expect(write.op.op).toBe("update");
        expect(write.op.args[0]).toMatchObject({ setting_value: [BAKING, POTTERY] });
        // Only lands if nobody changed the list since it was read.
        expect(write.filters.map((call) => [call.op, ...call.args])).toEqual([
            ["eq", "setting_key", KEY],
            ["eq", "updated_at", V1],
        ]);

        expect(revalidateTag).toHaveBeenCalledWith("platform-settings");
        expect(revalidateTag).toHaveBeenCalledWith("workshops-list");
        expect(revalidateTag).toHaveBeenCalledWith("public-offers");
        expect(revalidateTag).toHaveBeenCalledWith(`workshop:${POTTERY}`);
        expect(revalidatePath).toHaveBeenCalledWith(`/workshop/${POTTERY}`);
        expect(revalidatePath).toHaveBeenCalledWith("/");
        expect(revalidatePath).toHaveBeenCalledWith("/explore");
        expect(revalidatePath).toHaveBeenCalledWith("/workshops/[city]", "page");
        expect(revalidatePath).toHaveBeenCalledWith("/workshops/[city]/[topic]", "page");
        expect(revalidatePath).toHaveBeenCalledWith("/llms.txt");
        expect(revalidatePath).toHaveBeenCalledWith("/admin/workshops");
    });

    it("is idempotent: closing a closed workshop writes nothing but still refreshes the pages", async () => {
        const db = setup({ settings: [row([POTTERY, BAKING])] });

        const response = await post({ closed: true });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            workshopId: POTTERY,
            closed: true,
            closedWorkshopIds: [POTTERY, BAKING],
        });
        expect(writesOf(db)).toHaveLength(0);
        expect(revalidateTag).toHaveBeenCalledWith(`workshop:${POTTERY}`);
    });

    it("reopens bookings: removes only this id", async () => {
        const db = setup({ settings: [row([POTTERY, BAKING]), WRITTEN] });

        const response = await post({ closed: false });
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toEqual({ workshopId: POTTERY, closed: false, closedWorkshopIds: [BAKING] });
        expect(writesOf(db)[0].op.args[0]).toMatchObject({ setting_value: [BAKING] });
    });

    it("opening an open workshop writes nothing", async () => {
        const db = setup({ settings: [row([BAKING])] });

        const response = await post({ closed: false });

        expect(response.status).toBe(200);
        expect((await response.json()).closedWorkshopIds).toEqual([BAKING]);
        expect(writesOf(db)).toHaveLength(0);
    });

    it("keeps the id of a deleted workshop in the list: harmless, and it blocks nothing", async () => {
        const GONE = "deleted-workshop-1700000000000";
        const db = setup({ settings: [row([GONE]), WRITTEN] });

        const response = await post({ closed: true });

        expect(response.status).toBe(200);
        expect((await response.json()).closedWorkshopIds).toEqual([GONE, POTTERY]);
        expect(writesOf(db)[0].op.args[0]).toMatchObject({ setting_value: [GONE, POTTERY] });
    });

    it("creates the setting when it does not exist yet (missing row = nothing closed)", async () => {
        const db = setup({ settings: [{ data: null, error: null }, WRITTEN] });

        const response = await post({ closed: true });

        expect(response.status).toBe(200);
        const [write] = writesOf(db);
        // Inserts only if no row exists by then (ON CONFLICT DO NOTHING).
        expect(write.op.op).toBe("upsert");
        expect(write.op.args[0]).toMatchObject({ setting_key: KEY, setting_value: [POTTERY] });
        expect(write.op.args[1]).toEqual({ onConflict: "setting_key", ignoreDuplicates: true });
    });

    it("compares against a missing updated_at too", async () => {
        const db = setup({ settings: [row([BAKING], null), WRITTEN] });

        await post({ closed: true });

        const [write] = writesOf(db);
        expect(write.filters.map((call) => [call.op, ...call.args])).toEqual([
            ["eq", "setting_key", KEY],
            ["is", "updated_at", null],
        ]);
    });

    it("answers 503 READ_FAILED and writes NOTHING when the fresh read fails", async () => {
        const db = setup({
            settings: [{ data: null, error: { message: "relation platform_settings timeout" } }],
        });

        const response = await post({ closed: true });
        const text = await response.text();

        expect(response.status).toBe(503);
        expect(JSON.parse(text).code).toBe("READ_FAILED");
        expect(text).not.toContain("platform_settings");
        expect(writesOf(db)).toHaveLength(0);
        expect(revalidateTag).not.toHaveBeenCalled();
    });

    it("answers 400 LIST_FULL rather than dropping another closed workshop", async () => {
        const full = Array.from({ length: 500 }, (_, index) => `workshop-${index}`);
        const db = setup({ settings: [row(full)] });

        const response = await post({ closed: true });

        expect(response.status).toBe(400);
        expect((await response.json()).code).toBe("LIST_FULL");
        expect(writesOf(db)).toHaveLength(0);
    });

    it("returns 404 for a workshop that does not exist, before reading the list", async () => {
        const db = setup({ workshop: { data: null, error: null } });

        expect((await post({ closed: true })).status).toBe(404);
        expect(db.tables()).toEqual(["workshops"]);
    });

    it("rejects an id that is not a workshop id, and a bad body, without writing", async () => {
        const db = setup();

        const badId = await post({ closed: true }, "bad id,eq.1");
        expect(badId.status).toBe(400);
        expect((await badId.json()).code).toBe("UNKNOWN_WORKSHOP");
        expect((await post({ closed: "yes" })).status).toBe(400);
        expect((await post({})).status).toBe(400);
        expect(writesOf(db)).toHaveLength(0);
    });

    it("never echoes the database error when the save fails", async () => {
        setup({
            settings: [
                row([]),
                {
                    data: null,
                    error: { message: 'duplicate key violates "platform_settings_pkey"' },
                },
            ],
        });

        const response = await post({ closed: true });
        const text = await response.text();

        expect(response.status).toBe(500);
        expect(text).not.toContain("platform_settings_pkey");
        expect(revalidateTag).not.toHaveBeenCalled();
    });

    it("honours the rate limit", async () => {
        mocks.assertRateLimit.mockResolvedValue({
            ok: false,
            response: new Response(null, { status: 429 }),
        });
        const db = setup();

        expect((await post({ closed: true })).status).toBe(429);
        expect(db.tables()).toEqual([]);
    });

    it("accepts PATCH as well as POST", () => {
        expect(PATCH).toBe(POST);
    });

    it("still answers 200 when refreshing the page caches throws: the switch is saved", async () => {
        vi.mocked(revalidateTag).mockImplementation(() => {
            throw new Error("Invariant: static generation store missing");
        });
        setup({ settings: [row([]), WRITTEN] });

        const response = await post({ closed: true });

        expect(response.status).toBe(200);
        expect((await response.json()).closedWorkshopIds).toEqual([POTTERY]);
        expect(Sentry.captureException).toHaveBeenCalled();
    });

    describe("two saves at the same moment (compare-and-set)", () => {
        it("re-reads and redoes the change when another save got in first", async () => {
            const db = setup({
                settings: [
                    row([], V1),
                    CONFLICT, // BAKING was closed by someone else after our read
                    row([BAKING], V2),
                    WRITTEN,
                ],
            });

            const response = await post({ closed: true });

            expect(response.status).toBe(200);
            expect((await response.json()).closedWorkshopIds).toEqual([BAKING, POTTERY]);
            const writes = writesOf(db);
            expect(writes).toHaveLength(2);
            expect(writes[0].op.args[0]).toMatchObject({ setting_value: [POTTERY] });
            // The retry is based on the newer list and the newer version: BAKING survives.
            expect(writes[1].op.args[0]).toMatchObject({ setting_value: [BAKING, POTTERY] });
            expect(writes[1].filters.map((call) => call.args[1])).toEqual([KEY, V2]);
            expect(revalidateTag).toHaveBeenCalledWith("platform-settings");
        });

        it("stops being needed when the other save already did the same thing", async () => {
            const db = setup({ settings: [row([], V1), CONFLICT, row([POTTERY], V2)] });

            const response = await post({ closed: true });

            expect(response.status).toBe(200);
            expect(writesOf(db)).toHaveLength(1);
        });

        it("gives up with 409 CONFLICT, changing nothing, when it keeps losing", async () => {
            const settings: QueuedResult[] = [];
            for (let attempt = 0; attempt < 5; attempt += 1) settings.push(row([], V1), CONFLICT);
            setup({ settings });

            const response = await post({ closed: true });
            const body = await response.json();

            expect(response.status).toBe(409);
            expect(body.code).toBe("CONFLICT");
            expect(body.error).toMatch(/Try again/);
            expect(revalidateTag).not.toHaveBeenCalled();
        });

        it("keeps BOTH closes when two workshops are closed together (no lost update)", async () => {
            // A stateful database: both requests read the empty list before either writes.
            let reads = 0;
            let release: () => void = () => {};
            const bothHaveRead = new Promise<void>((resolve) => (release = resolve));
            const fake = createFakeSettingsClient({
                workshops: [POTTERY, BAKING],
                beforeSettingsRead: async () => {
                    if (reads >= 2) return;
                    reads += 1;
                    if (reads === 2) release();
                    await bothHaveRead;
                },
            });
            mocks.requireSupabaseService.mockReturnValue({ ok: true, client: fake.client });

            const [first, second] = await Promise.all([
                post({ closed: true }, POTTERY),
                post({ closed: true }, BAKING),
            ]);

            expect(first.status).toBe(200);
            expect(second.status).toBe(200);
            const stored = fake.row(KEY)!.setting_value as string[];
            expect([...stored].sort()).toEqual([BAKING, POTTERY].sort());
            // One of them lost the race and redid its change on the newer list.
            expect(fake.writes.filter((write) => write.affected === 0)).toHaveLength(1);
            expect(fake.writes.filter((write) => write.affected === 1)).toHaveLength(2);
        });

        it("keeps the other close when one workshop is reopened while another is closed", async () => {
            let reads = 0;
            let release: () => void = () => {};
            const bothHaveRead = new Promise<void>((resolve) => (release = resolve));
            const fake = createFakeSettingsClient({
                settings: [
                    { setting_key: KEY, setting_value: [POTTERY, PAINTING], updated_at: V1 },
                ],
                workshops: [POTTERY, BAKING],
                beforeSettingsRead: async () => {
                    if (reads >= 2) return;
                    reads += 1;
                    if (reads === 2) release();
                    await bothHaveRead;
                },
            });
            mocks.requireSupabaseService.mockReturnValue({ ok: true, client: fake.client });

            await Promise.all([post({ closed: false }, POTTERY), post({ closed: true }, BAKING)]);

            const stored = fake.row(KEY)!.setting_value as string[];
            expect([...stored].sort()).toEqual([BAKING, PAINTING].sort());
        });

        it("a save that loses to a first-time insert retries against the new row", async () => {
            const fake = createFakeSettingsClient({
                workshops: [POTTERY],
                beforeSettingsWrite: (() => {
                    let first = true;
                    return () => {
                        // Another request creates the row between our read and our insert.
                        if (!first) return;
                        first = false;
                        fake.set({ setting_key: KEY, setting_value: [BAKING], updated_at: V2 });
                    };
                })(),
            });
            mocks.requireSupabaseService.mockReturnValue({ ok: true, client: fake.client });

            const response = await post({ closed: true });

            expect(response.status).toBe(200);
            expect((fake.row(KEY)!.setting_value as string[]).sort()).toEqual(
                [BAKING, POTTERY].sort()
            );
        });
    });

    it("GET reports the fresh state", async () => {
        setup({ settings: [{ data: { setting_value: [POTTERY] }, error: null }] });

        const response = await get();

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            workshopId: POTTERY,
            closed: true,
            closedWorkshopIds: [POTTERY],
        });
    });

    it("GET answers 503 READ_FAILED when the list cannot be read", async () => {
        setup({ settings: [{ data: null, error: { message: "timeout" } }] });

        const response = await get();

        expect(response.status).toBe(503);
        expect((await response.json()).code).toBe("READ_FAILED");
    });
});
