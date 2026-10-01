import * as Sentry from "@sentry/nextjs";
import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { requireAdminUser, jsonError } from "@/lib/api-auth";
import type { Json } from "@/lib/database.types";
import { PLATFORM_SETTINGS_TAG } from "@/lib/cached-reads";
import { assertRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { pickPublicSettings, validateSettingsPatch } from "@/lib/platform-settings-schema";

export async function GET(request: NextRequest) {
    const limit = await assertRateLimit({
        key: getRateLimitKey(request, "api-settings-get"),
        limit: 120,
        windowMs: 60_000,
    });
    if (!limit.ok) return limit.response;

    try {
        const supabase = createSupabaseServiceClient();
        const { data, error } = await supabase.from("platform_settings").select("*");

        if (error) {
            // The database message names tables and columns: report it, never return it.
            Sentry.captureException(error, { tags: { layer: "api", route: "settings:get" } });
            return jsonError("Unable to load settings right now.", 500);
        }

        const record = data.reduce(
            (acc, row) => {
                acc[row.setting_key] = row.setting_value;
                return acc;
            },
            {} as Record<string, Json>
        );

        // Public endpoint: only allowlisted keys leave the server, so a row added to the
        // table for server-side use never becomes readable by every visitor.
        const settings = pickPublicSettings(record);

        // Non-personal, changes a few times a month: let the CDN absorb it. The app itself
        // now reads settings server-side via getCachedPlatformSettings, so this endpoint only
        // serves the admin client and any straggling caller.
        return NextResponse.json(
            { settings },
            {
                status: 200,
                headers: {
                    "Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400",
                },
            }
        );
    } catch {
        return jsonError("Internal Server Error", 500);
    }
}

export async function PATCH(request: NextRequest) {
    const auth = await requireAdminUser(request);
    if (!auth.ok) return auth.response;

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return jsonError("Invalid payload. Expected JSON.", 400);
    }

    const settings =
        body && typeof body === "object" && !Array.isArray(body)
            ? (body as { settings?: unknown }).settings
            : undefined;
    const parsed = validateSettingsPatch(settings);
    if (!parsed.ok) {
        return jsonError(parsed.error, 400, parsed.key ? { field: parsed.key } : undefined);
    }

    try {
        const supabase = createSupabaseServiceClient();

        const updatedAt = new Date().toISOString();
        const upserts = Object.entries(parsed.values).map(([key, value]) => ({
            setting_key: key,
            setting_value: value as Json,
            updated_at: updatedAt,
        }));

        const { error } = await supabase
            .from("platform_settings")
            .upsert(upserts, { onConflict: "setting_key" });

        if (error) {
            Sentry.captureException(error, { tags: { layer: "api", route: "settings:patch" } });
            return jsonError("Unable to save settings right now.", 500);
        }

        revalidateTag(PLATFORM_SETTINGS_TAG);

        return NextResponse.json({ success: true }, { status: 200 });
    } catch {
        return jsonError("Internal Server Error", 500);
    }
}
