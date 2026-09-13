import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-route";
import { requireSupabaseService } from "@/lib/api-helpers";
import { isMissingFeedbackTableError } from "@/lib/feedback-fallback";

/** True when the moderation migration has not been applied to this database yet. */
function isMissingPublishedColumnError(error: { message?: string } | null) {
    return Boolean(error?.message && /is_published/i.test(error.message));
}

import { assertRateLimit, getRateLimitKey } from "@/lib/rate-limit";

// Public, non-personal review list; safe to cache at the edge.
const PUBLIC_FEEDBACK_CACHE_HEADERS = {
    "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600",
} as const;

type PublicFeedbackRow = {
    id: string;
    user_id: string;
    rating: number | null;
    comment: string;
    photos: string[] | null;
    created_at: string;
};

const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 24;

function formatDisplayName(fullName: string | null) {
    const trimmed = String(fullName || "").trim();
    if (!trimmed) {
        return "Workshop attendee";
    }
    const parts = trimmed.split(/\s+/);
    if (parts.length === 1) {
        return parts[0];
    }
    const lastInitial = parts[1]?.[0] ? ` ${parts[1][0]}.` : "";
    return `${parts[0]}${lastInitial}`;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const limitCheck = await assertRateLimit({
        key: getRateLimitKey(request, "api-public-feedback"),
        limit: 120,
        windowMs: 60_000,
    });
    if (!limitCheck.ok) return limitCheck.response;

    const { id: workshopId } = await params;
    const requestedLimit = Number(request.nextUrl.searchParams.get("limit") || DEFAULT_LIMIT);
    const limit = Number.isFinite(requestedLimit)
        ? Math.min(Math.max(requestedLimit, 1), MAX_LIMIT)
        : DEFAULT_LIMIT;

    const service = requireSupabaseService();
    if (!service.ok) {
        return service.response;
    }

    try {
        const serviceClient = service.client;

        // `is_published` is the moderation gate (20260906120000_feedback_moderation_gate).
        // `rating` is filtered because rows written before the rating column existed have
        // rating = null: they are excluded from review_count by the rollup, yet were still
        // rendered publicly as "- / 5" beside five empty stars.
        let query = serviceClient
            .from("workshop_feedback")
            .select("id,user_id,rating,comment,photos,created_at")
            .eq("workshop_id", workshopId)
            .not("rating", "is", null)
            .order("created_at", { ascending: false })
            .limit(limit);

        // Tolerate a database that has not run the moderation migration yet.
        query = query.eq("is_published", true);

        let { data, error } = await query;

        if (error && isMissingPublishedColumnError(error)) {
            ({ data, error } = await serviceClient
                .from("workshop_feedback")
                .select("id,user_id,rating,comment,photos,created_at")
                .eq("workshop_id", workshopId)
                .not("rating", "is", null)
                .order("created_at", { ascending: false })
                .limit(limit));
        }

        if (isMissingFeedbackTableError(error)) {
            return NextResponse.json({ feedback: [] });
        }

        if (error) {
            return handleApiError("Failed to load feedback.", error);
        }

        const rows = (Array.isArray(data) ? data : []) as PublicFeedbackRow[];
        const userIds = Array.from(new Set(rows.map((row) => row.user_id).filter(Boolean)));
        const profileById = new Map<
            string,
            { fullName: string | null; avatarUrl: string | null }
        >();

        if (userIds.length > 0) {
            const { data: profilesData } = await serviceClient
                .from("profiles")
                .select("id, full_name, avatar_url")
                .in("id", userIds);

            for (const profile of profilesData || []) {
                profileById.set(String(profile.id), {
                    fullName: profile.full_name || null,
                    avatarUrl: profile.avatar_url || null,
                });
            }
        }

        return NextResponse.json(
            {
                feedback: rows.map((row) => ({
                    id: row.id,
                    rating: row.rating,
                    comment: row.comment,
                    photos: Array.isArray(row.photos) ? row.photos.map((item) => String(item)) : [],
                    createdAt: row.created_at,
                    userDisplayName: formatDisplayName(
                        profileById.get(row.user_id)?.fullName || null
                    ),
                    avatarUrl: profileById.get(row.user_id)?.avatarUrl || null,
                })),
            },
            { headers: PUBLIC_FEEDBACK_CACHE_HEADERS }
        );
    } catch (error) {
        return handleApiError("Failed to load feedback.", error);
    }
}
