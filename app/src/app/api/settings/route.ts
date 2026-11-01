import * as Sentry from "@sentry/nextjs";
import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { requireAdminUser, jsonError } from "@/lib/api-auth";
import type { Json } from "@/lib/database.types";
import { PLATFORM_SETTINGS_TAG } from "@/lib/cached-reads";
import { assertRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { pickPublicSettings, validateSettingsPatch } from "@/lib/platform-settings-schema";
import { mirrorImageFields } from "@/lib/image-mirror";

// Pasted image links are copied into storage on save (see lib/image-mirror).
export const maxDuration = 60;

/** Writable keys this route refuses: only their dedicated routes may write them. */
const DEDICATED_SETTING_KEYS: Record<string, string> = {
    // POST /api/admin/workshops/[id]/booking-status (compare-and-set on the stored list).
    closed_workshop_ids: "Bookings are opened and closed per workshop on the Workshops page.",
    // /api/coupons and /api/coupons/[id] (compare-and-set plus the label-code check).
    coupon_offers: "Offer settings are saved with each coupon on the Offers page.",
};

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

    // These keys have their own routes, which read the stored value fresh and change one entry.
    // Saved here, the whole value would be replaced from the page's snapshot: closing workshop B
    // from a stale page could reopen workshop A, and an old coupon list could drop offers.
    if (settings && typeof settings === "object" && !Array.isArray(settings)) {
        for (const [key, message] of Object.entries(DEDICATED_SETTING_KEYS)) {
            if (Object.prototype.hasOwnProperty.call(settings, key)) {
                return jsonError(message, 400, { field: key });
            }
        }
    }

    const parsed = validateSettingsPatch(settings);
    if (!parsed.ok) {
        return jsonError(parsed.error, 400, parsed.key ? { field: parsed.key } : undefined);
    }

    try {
        // Pasted Drive/Photos/Unsplash links are copied into our storage at full resolution. The
        // hero image and ALL the partner logos go side by side (the logos in one batch, a few at
        // a time) so several freshly pasted images still fit in maxDuration.
        const partners: unknown[] = Array.isArray(parsed.values.cafe_partners)
            ? parsed.values.cafe_partners
            : [];
        const partnerRecords = partners.filter(
            (partner): partner is Record<string, unknown> =>
                typeof partner === "object" && partner !== null && !Array.isArray(partner)
        );
        const logos = { logo_url: partnerRecords.map((partner) => partner.logo_url) };
        await Promise.all([
            mirrorImageFields(parsed.values, ["hero_image_url"]),
            mirrorImageFields(logos, ["logo_url"]),
        ]);
        partnerRecords.forEach((partner, index) => {
            partner.logo_url = logos.logo_url[index];
        });

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
