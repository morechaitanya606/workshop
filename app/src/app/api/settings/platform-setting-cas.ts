import "server-only";

import * as Sentry from "@sentry/nextjs";

import type { Json } from "@/lib/database.types";
import type { SupabaseServerClient } from "@/lib/supabase-server";

/**
 * Compare-and-set writes of one platform_settings row, for the settings that are changed one
 * entry at a time (the closed workshops list, the coupon offers map).
 *
 * PostgREST has no transactions, so a plain read, change, upsert loses a change whenever two
 * saves overlap: both read the same value and the second upsert erases the first (closing two
 * workshops in quick succession on a slow connection would leave one of them open while its
 * switch says closed). Here a write only lands when the row is still the one that was read (same
 * updated_at, or still absent). A miss is reported as a conflict and the caller reads again and
 * redoes its change on the newer value. No migration: it is one conditional UPDATE, or an INSERT
 * that does nothing when the row already exists.
 */

/** What a read saw: the row's updated_at, or that there was no row yet. */
export type SettingVersion = { exists: false } | { exists: true; updatedAt: string | null };

export type SettingSnapshot =
    | { ok: true; value: Json | null; version: SettingVersion }
    | { ok: false };

export type SettingWrite = { ok: true } | { ok: false; reason: "conflict" | "error" };

function report(error: unknown, route: string) {
    // The database message names tables and columns: report it, never return it.
    Sentry.captureException(error, { tags: { layer: "api", route } });
}

/** A fresh, uncached read of the value and its version. Never throws; { ok: false } on failure. */
export async function readSettingSnapshot(
    client: SupabaseServerClient,
    key: string,
    route: string
): Promise<SettingSnapshot> {
    try {
        const { data, error } = await client
            .from("platform_settings")
            .select("setting_value, updated_at")
            .eq("setting_key", key)
            .maybeSingle();
        if (error) {
            report(error, route);
            return { ok: false };
        }
        if (!data) return { ok: true, value: null, version: { exists: false } };
        return {
            ok: true,
            value: data.setting_value,
            version: { exists: true, updatedAt: data.updated_at ?? null },
        };
    } catch (error) {
        report(error, route);
        return { ok: false };
    }
}

/**
 * Stores `value` only if the row still matches `expected` (the version of the read the value was
 * built from). Never throws. `conflict` means someone else changed the row first and nothing was
 * written; `error` means the database refused the write.
 */
export async function writeSettingIfUnchanged(
    client: SupabaseServerClient,
    key: string,
    expected: SettingVersion,
    value: Json,
    route: string
): Promise<SettingWrite> {
    try {
        // Always later than the version it replaces, so a second writer that read the old
        // version can never match it again (two saves inside one millisecond).
        const replaced =
            expected.exists && expected.updatedAt ? Date.parse(expected.updatedAt) : Number.NaN;
        const stamp = new Date(
            Math.max(Date.now(), Number.isNaN(replaced) ? 0 : replaced + 1)
        ).toISOString();

        let result;
        if (!expected.exists) {
            // ON CONFLICT DO NOTHING: an existing row means another save created it first.
            result = await client
                .from("platform_settings")
                .upsert(
                    { setting_key: key, setting_value: value, updated_at: stamp },
                    { onConflict: "setting_key", ignoreDuplicates: true }
                )
                .select("setting_key");
        } else {
            const update = client
                .from("platform_settings")
                .update({ setting_value: value, updated_at: stamp })
                .eq("setting_key", key);
            result = await (
                expected.updatedAt === null
                    ? update.is("updated_at", null)
                    : update.eq("updated_at", expected.updatedAt)
            ).select("setting_key");
        }

        if (result.error) {
            report(result.error, route);
            return { ok: false, reason: "error" };
        }
        // The rows that matched come back: none means the condition no longer held.
        if (Array.isArray(result.data) && result.data.length === 0) {
            return { ok: false, reason: "conflict" };
        }
        return { ok: true };
    } catch (error) {
        report(error, route);
        return { ok: false, reason: "error" };
    }
}
