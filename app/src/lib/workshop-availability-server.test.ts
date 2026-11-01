import * as Sentry from "@sentry/nextjs";
import { describe, expect, it, vi } from "vitest";

import { getCachedPlatformSettings } from "@/lib/cached-reads";
import { withBookingsClosed } from "@/lib/workshop-availability";
import { createChainableSupabase } from "@/test/chainable-supabase";

import { loadClosedWorkshopIds, readClosedWorkshopIds } from "./workshop-availability-server";

vi.mock("@/lib/cached-reads", () => ({
    getCachedPlatformSettings: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
    captureException: vi.fn(),
}));

const POTTERY = "pottery-wheel-1760000000000";
const BAKING = "sourdough-baking-1760000000001";

describe("loadClosedWorkshopIds", () => {
    it("reads the ids from the cached platform settings (no extra query)", async () => {
        vi.mocked(getCachedPlatformSettings).mockResolvedValue({
            service_fee: 99,
            closed_workshop_ids: [POTTERY, "bad id", BAKING],
        } as never);

        expect(await loadClosedWorkshopIds()).toEqual(new Set([POTTERY, BAKING]));
        expect(getCachedPlatformSettings).toHaveBeenCalledTimes(1);
    });

    it("is empty when the setting is missing or malformed (today's behaviour)", async () => {
        vi.mocked(getCachedPlatformSettings).mockResolvedValue({ service_fee: 99 });
        expect(await loadClosedWorkshopIds()).toEqual(new Set());

        vi.mocked(getCachedPlatformSettings).mockResolvedValue({
            closed_workshop_ids: "garbage",
        } as never);
        expect(await loadClosedWorkshopIds()).toEqual(new Set());

        vi.mocked(getCachedPlatformSettings).mockResolvedValue(null as never);
        expect(await loadClosedWorkshopIds()).toEqual(new Set());
    });

    it("never throws: a failed settings read means nothing closed", async () => {
        vi.mocked(getCachedPlatformSettings).mockRejectedValue(new Error("database down"));

        expect(await loadClosedWorkshopIds()).toEqual(new Set());
        expect(Sentry.captureException).toHaveBeenCalled();
    });
});

describe("readClosedWorkshopIds", () => {
    it("reads only the closed_workshop_ids row, fresh", async () => {
        const db = createChainableSupabase({
            platform_settings: [{ data: { setting_value: [POTTERY] }, error: null }],
        });

        expect(await readClosedWorkshopIds(db.client as never)).toEqual({
            ok: true,
            ids: new Set([POTTERY]),
        });
        const calls = db.callsFor("platform_settings");
        expect(calls).toContainEqual({ op: "select", args: ["setting_value"] });
        expect(calls).toContainEqual({ op: "eq", args: ["setting_key", "closed_workshop_ids"] });
        expect(calls).toContainEqual({ op: "maybeSingle", args: [] });
    });

    it("reads a missing row or malformed value as nothing closed", async () => {
        const missing = createChainableSupabase({
            platform_settings: [{ data: null, error: null }],
        });
        expect(await readClosedWorkshopIds(missing.client as never)).toEqual({
            ok: true,
            ids: new Set(),
        });

        const malformed = createChainableSupabase({
            platform_settings: [{ data: { setting_value: { [POTTERY]: true } }, error: null }],
        });
        expect(await readClosedWorkshopIds(malformed.client as never)).toEqual({
            ok: true,
            ids: new Set(),
        });
    });

    it("reports a failed read as not ok, with nothing closed, without throwing", async () => {
        const failing = createChainableSupabase({
            platform_settings: [{ data: null, error: { message: "relation does not exist" } }],
        });
        const result = await readClosedWorkshopIds(failing.client as never);
        expect(result).toEqual({ ok: false, ids: new Set() });
        expect(JSON.stringify(result)).not.toContain("relation");
        expect(Sentry.captureException).toHaveBeenCalled();

        const throwing = {
            from() {
                throw new Error("network");
            },
        };
        expect(await readClosedWorkshopIds(throwing as never)).toEqual({
            ok: false,
            ids: new Set(),
        });
    });

    it("feeds the admin switch: a failed read is refused, a missing row may be written over", async () => {
        const failing = createChainableSupabase({
            platform_settings: [{ data: null, error: { message: "timeout" } }],
        });
        expect(
            withBookingsClosed(await readClosedWorkshopIds(failing.client as never), POTTERY, true)
        ).toMatchObject({ ok: false, code: "READ_FAILED" });

        const missing = createChainableSupabase({
            platform_settings: [{ data: null, error: null }],
        });
        expect(
            withBookingsClosed(await readClosedWorkshopIds(missing.client as never), POTTERY, true)
        ).toEqual({ ok: true, value: [POTTERY] });

        const stored = createChainableSupabase({
            platform_settings: [{ data: { setting_value: [BAKING] }, error: null }],
        });
        expect(
            withBookingsClosed(await readClosedWorkshopIds(stored.client as never), POTTERY, true)
        ).toEqual({ ok: true, value: [BAKING, POTTERY] });
    });
});
