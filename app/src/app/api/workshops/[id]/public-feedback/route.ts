import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isKnownMockWorkshopId } from "@/lib/data";
import { handleApiError } from "@/lib/api-route";
import { requireSupabaseService } from "@/lib/api-helpers";
import {
    getFallbackPublicFeedback,
    isMissingFeedbackTableError,
    toFallbackWorkshopFeedbackResponse,
} from "@/lib/feedback-fallback";

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

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
    const workshopId = params.id;
    const allowMockFallback = process.env.NODE_ENV !== "production";
    const requestedLimit = Number(request.nextUrl.searchParams.get("limit") || DEFAULT_LIMIT);
    const limit = Number.isFinite(requestedLimit)
        ? Math.min(Math.max(requestedLimit, 1), MAX_LIMIT)
        : DEFAULT_LIMIT;
    const formatFallbackFeedback = () => {
        const fallback = getFallbackPublicFeedback(workshopId);
        return NextResponse.json({
            feedback: fallback.map((record) => {
                const normalized = toFallbackWorkshopFeedbackResponse(record);
                return {
                    id: `${record.userId}-${record.workshopId}`,
                    rating: normalized.rating,
                    comment: normalized.comment,
                    photos: normalized.photos || [],
                    createdAt: normalized.created_at,
                    userDisplayName: "Workshop attendee",
                    avatarUrl: null,
                };
            }),
        });
    };

    const service = requireSupabaseService();
    if (!service.ok) {
        if (!allowMockFallback) {
            return service.response;
        }
        return formatFallbackFeedback();
    }

    try {
        const serviceClient = service.client;

        if (allowMockFallback && isKnownMockWorkshopId(workshopId)) {
            return formatFallbackFeedback();
        }

        const { data, error } = await serviceClient
            .from("workshop_feedback")
            .select("id,user_id,rating,comment,photos,created_at")
            .eq("workshop_id", workshopId)
            .order("created_at", { ascending: false })
            .limit(limit);

        if (isMissingFeedbackTableError(error)) {
            return formatFallbackFeedback();
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

        return NextResponse.json({
            feedback: rows.map((row) => ({
                id: row.id,
                rating: row.rating,
                comment: row.comment,
                photos: Array.isArray(row.photos) ? row.photos.map((item) => String(item)) : [],
                createdAt: row.created_at,
                userDisplayName: formatDisplayName(profileById.get(row.user_id)?.fullName || null),
                avatarUrl: profileById.get(row.user_id)?.avatarUrl || null,
            })),
        });
    } catch (error) {
        return handleApiError("Failed to load feedback.", error);
    }
}
