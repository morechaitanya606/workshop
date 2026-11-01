import "server-only";

import * as Sentry from "@sentry/nextjs";

import { getCachedPlatformSettings } from "@/lib/cached-reads";
import type { SupabaseServerClient } from "@/lib/supabase-server";
import {
    CLOSED_WORKSHOPS_SETTING_KEY,
    closedWorkshopIdsFromSettings,
    parseClosedWorkshopIds,
    type ClosedWorkshopsRead,
} from "@/lib/workshop-availability";

/**
 * Server reads of the "Bookings closed" switch (see src/lib/workshop-availability.ts). Both
 * tolerate a database without the setting (previews share the live database): nothing closed.
 */

/**
 * Closed workshop ids for rendering pages and cards. Rides on the cached platform settings
 * (the key is public), so it costs no extra query and refreshes whenever the settings tag is
 * revalidated. Never throws: an empty set on any failure. Never use it for the admin write
 * (it can be stale, and a failure looks like an empty list): use readClosedWorkshopIds.
 */
export async function loadClosedWorkshopIds(): Promise<Set<string>> {
    try {
        return closedWorkshopIdsFromSettings(await getCachedPlatformSettings());
    } catch (error) {
        Sentry.captureException(error, { tags: { layer: "web", route: "closed_workshops" } });
        return new Set();
    }
}

/**
 * A fresh (uncached) read, for two kinds of caller. Pass a service client with a request
 * timeout. Never throws; a failed read is { ok: false, ids: empty }.
 * - Hold creation and checkout order creation, which must refuse a new booking at once: there
 *   a failed read counts as nothing closed (today's behaviour), so check only `ids`.
 * - The admin switch's read-modify-write: hand the whole result to withBookingsClosed, which
 *   refuses (READ_FAILED) when `ok` is false, so a failed read is never written back as an
 *   empty list that would reopen every closed workshop.
 */
export async function readClosedWorkshopIds(
    client: SupabaseServerClient
): Promise<ClosedWorkshopsRead & { ids: Set<string> }> {
    try {
        const { data, error } = await client
            .from("platform_settings")
            .select("setting_value")
            .eq("setting_key", CLOSED_WORKSHOPS_SETTING_KEY)
            .maybeSingle();
        if (error) {
            // The database message names tables and columns: report it, never return it.
            Sentry.captureException(error, { tags: { layer: "api", route: "closed_workshops" } });
            return { ok: false, ids: new Set() };
        }
        return { ok: true, ids: parseClosedWorkshopIds(data?.setting_value ?? null) };
    } catch (error) {
        Sentry.captureException(error, { tags: { layer: "api", route: "closed_workshops" } });
        return { ok: false, ids: new Set() };
    }
}
