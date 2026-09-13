import "server-only";

import { unstable_cache } from "next/cache";

import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase-server";
import type { PlatformSettings } from "@/lib/api-client";
import type { Json } from "@/lib/database.types";

/**
 * Cache tags. Mutations revalidate by tag rather than by path, because the same data
 * backs several routes and the old `revalidatePath("/workshops")` calls pointed at
 * paths that are not routes in this app.
 */
export const PLATFORM_SETTINGS_TAG = "platform-settings";
export const WORKSHOPS_LIST_TAG = "workshops-list";

export function workshopTag(workshopId: string) {
    return `workshop:${workshopId}`;
}

async function readPlatformSettings(): Promise<PlatformSettings> {
    if (!isSupabaseServiceConfigured) {
        return {};
    }

    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase.from("platform_settings").select("*");

    if (error || !data) {
        return {};
    }

    return data.reduce(
        (acc, row) => {
            acc[row.setting_key] = row.setting_value;
            return acc;
        },
        {} as Record<string, Json>
    ) as PlatformSettings;
}

/**
 * Platform settings change a few times a month but were previously fetched from the
 * browser on every single page view (one uncacheable function invocation plus one
 * `select *` per view). Reading them here lets the value ride along in the already
 * cached RSC payload instead.
 */
export const getCachedPlatformSettings = unstable_cache(
    readPlatformSettings,
    ["platform-settings"],
    { tags: [PLATFORM_SETTINGS_TAG], revalidate: 3600 }
);
