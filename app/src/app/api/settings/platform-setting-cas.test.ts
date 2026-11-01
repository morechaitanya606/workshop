import * as Sentry from "@sentry/nextjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseServerClient } from "@/lib/supabase-server";
import { createFakeSettingsClient } from "@/test/fake-platform-settings";
import { readSettingSnapshot, writeSettingIfUnchanged } from "./platform-setting-cas";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

const KEY = "closed_workshop_ids";
const V1 = "2026-10-24T08:00:00.123456+00:00";
const V2 = "2026-10-24T09:30:00.000+00:00";

function asClient(client: unknown) {
    return client as SupabaseServerClient;
}

describe("readSettingSnapshot", () => {
    it("returns the value with its version", async () => {
        const fake = createFakeSettingsClient({
            settings: [{ setting_key: KEY, setting_value: ["a"], updated_at: V1 }],
        });

        expect(await readSettingSnapshot(asClient(fake.client), KEY, "test")).toEqual({
            ok: true,
            value: ["a"],
            version: { exists: true, updatedAt: V1 },
        });
    });

    it("reports a missing row as ok with no value (the only empty read that may be written over)", async () => {
        const fake = createFakeSettingsClient();

        expect(await readSettingSnapshot(asClient(fake.client), KEY, "test")).toEqual({
            ok: true,
            value: null,
            version: { exists: false },
        });
    });

    it("reports a row without updated_at as such", async () => {
        const fake = createFakeSettingsClient({
            settings: [{ setting_key: KEY, setting_value: [], updated_at: null }],
        });

        expect(await readSettingSnapshot(asClient(fake.client), KEY, "test")).toMatchObject({
            ok: true,
            version: { exists: true, updatedAt: null },
        });
    });

    it("never throws: a database error or a dropped connection is { ok: false }, and reported", async () => {
        const failing = (result: () => Promise<unknown>) => ({
            from: () => ({
                select: () => ({ eq: () => ({ maybeSingle: result }) }),
            }),
        });

        expect(
            await readSettingSnapshot(
                asClient(failing(async () => ({ data: null, error: { message: "timeout" } }))),
                KEY,
                "test"
            )
        ).toEqual({ ok: false });
        expect(
            await readSettingSnapshot(
                asClient(
                    failing(async () => {
                        throw new Error("fetch failed");
                    })
                ),
                KEY,
                "test"
            )
        ).toEqual({ ok: false });
        expect(Sentry.captureException).toHaveBeenCalledTimes(2);
    });
});

describe("writeSettingIfUnchanged", () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it("writes when the row is still the one that was read", async () => {
        const fake = createFakeSettingsClient({
            settings: [{ setting_key: KEY, setting_value: ["a"], updated_at: V1 }],
        });

        const result = await writeSettingIfUnchanged(
            asClient(fake.client),
            KEY,
            { exists: true, updatedAt: V1 },
            ["a", "b"],
            "test"
        );

        expect(result).toEqual({ ok: true });
        const stored = fake.row(KEY)!;
        expect(stored.setting_value).toEqual(["a", "b"]);
        expect(stored.updated_at).not.toBe(V1);
        expect(fake.writes[0].filters).toEqual([
            { kind: "eq", column: "setting_key", value: KEY },
            { kind: "eq", column: "updated_at", value: V1 },
        ]);
    });

    it("reports a conflict and changes nothing when someone saved first", async () => {
        const fake = createFakeSettingsClient({
            settings: [{ setting_key: KEY, setting_value: ["a"], updated_at: V1 }],
        });
        // Another request saves between our read and our write.
        fake.set({ setting_key: KEY, setting_value: ["a", "c"], updated_at: V2 });

        const result = await writeSettingIfUnchanged(
            asClient(fake.client),
            KEY,
            { exists: true, updatedAt: V1 },
            ["a", "b"],
            "test"
        );

        expect(result).toEqual({ ok: false, reason: "conflict" });
        expect(fake.row(KEY)).toMatchObject({ setting_value: ["a", "c"], updated_at: V2 });
    });

    it("compares a row without updated_at with IS NULL", async () => {
        const fake = createFakeSettingsClient({
            settings: [{ setting_key: KEY, setting_value: [], updated_at: null }],
        });

        const first = await writeSettingIfUnchanged(
            asClient(fake.client),
            KEY,
            { exists: true, updatedAt: null },
            ["a"],
            "test"
        );
        // The row now has a timestamp, so a second writer holding the old version loses.
        const second = await writeSettingIfUnchanged(
            asClient(fake.client),
            KEY,
            { exists: true, updatedAt: null },
            ["b"],
            "test"
        );

        expect(first).toEqual({ ok: true });
        expect(second).toEqual({ ok: false, reason: "conflict" });
        expect(fake.writes[0].filters[1]).toEqual({
            kind: "is",
            column: "updated_at",
            value: null,
        });
        expect(fake.row(KEY)!.setting_value).toEqual(["a"]);
    });

    it("inserts a missing row only if nobody created it first", async () => {
        const fake = createFakeSettingsClient();

        const first = await writeSettingIfUnchanged(
            asClient(fake.client),
            KEY,
            { exists: false },
            ["a"],
            "test"
        );
        const second = await writeSettingIfUnchanged(
            asClient(fake.client),
            KEY,
            { exists: false },
            ["b"],
            "test"
        );

        expect(first).toEqual({ ok: true });
        expect(second).toEqual({ ok: false, reason: "conflict" });
        expect(fake.row(KEY)!.setting_value).toEqual(["a"]);
        expect(fake.writes[0].options).toEqual({
            onConflict: "setting_key",
            ignoreDuplicates: true,
        });
    });

    it("always stamps a later updated_at than the version it replaces, even with a slow clock", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-10-24T07:00:00.000Z"));
        const fake = createFakeSettingsClient({
            settings: [
                { setting_key: KEY, setting_value: [], updated_at: "2026-10-24T08:00:00.000Z" },
            ],
        });

        await writeSettingIfUnchanged(
            asClient(fake.client),
            KEY,
            { exists: true, updatedAt: "2026-10-24T08:00:00.000Z" },
            ["a"],
            "test"
        );

        expect(fake.row(KEY)!.updated_at).toBe("2026-10-24T08:00:00.001Z");
    });

    it("reports a refused write as an error, and never throws", async () => {
        const fake = createFakeSettingsClient({
            settings: [{ setting_key: KEY, setting_value: [], updated_at: V1 }],
        });
        fake.failNextWrite("permission denied for table platform_settings");

        expect(
            await writeSettingIfUnchanged(
                asClient(fake.client),
                KEY,
                { exists: true, updatedAt: V1 },
                ["a"],
                "test"
            )
        ).toEqual({ ok: false, reason: "error" });
        expect(fake.row(KEY)!.setting_value).toEqual([]);

        const broken = {
            from: () => {
                throw new Error("fetch failed");
            },
        };
        expect(
            await writeSettingIfUnchanged(asClient(broken), KEY, { exists: false }, ["a"], "test")
        ).toEqual({ ok: false, reason: "error" });
        expect(Sentry.captureException).toHaveBeenCalledTimes(2);
    });
});
