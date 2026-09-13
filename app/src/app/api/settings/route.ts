import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { requireAdminUser, jsonError } from "@/lib/api-auth";
import type { Json } from "@/lib/database.types";
import { PLATFORM_SETTINGS_TAG } from "@/lib/cached-reads";
import { assertRateLimit, getRateLimitKey } from "@/lib/rate-limit";

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
            return jsonError(error.message, 500);
        }

        const settings = data.reduce(
            (acc, row) => {
                acc[row.setting_key] = row.setting_value;
                return acc;
            },
            {} as Record<string, Json>
        );

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

    try {
        const body = await request.json();
        const { settings } = body;

        if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
            return jsonError("Invalid payload. Expected { settings: object }", 400);
        }
        const settingsRecord = settings as Record<string, Json>;

        const supabase = createSupabaseServiceClient();

        const upserts = Object.entries(settingsRecord).map(([key, value]) => ({
            setting_key: key,
            setting_value: value,
            updated_at: new Date().toISOString(),
        }));

        const { error } = await supabase
            .from("platform_settings")
            .upsert(upserts, { onConflict: "setting_key" });

        if (error) {
            return jsonError(error.message, 500);
        }

        revalidateTag(PLATFORM_SETTINGS_TAG);

        return NextResponse.json({ success: true }, { status: 200 });
    } catch {
        return jsonError("Internal Server Error", 500);
    }
}
