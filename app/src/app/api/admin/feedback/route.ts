import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { handleApiError, parseQuery } from "@/lib/api-route";
import { requireSupabaseService } from "@/lib/api-helpers";
import { jsonError, requireAdminUser } from "@/lib/api-auth";
import { adminFeedbackQuerySchema } from "@/lib/validators";
import {
    getFallbackFeedback,
    getFallbackWorkshopInfo,
    isMissingFeedbackTableError,
    matchesFallbackFeedbackFilters,
    SAMPLE_FEEDBACK_WORKSHOP_ID,
} from "@/lib/feedback-fallback";

type WorkshopInfo = {
    id: string;
    title: string;
    date: string;
    time: string | null;
    city: string;
    location: string;
};

type FeedbackResponseItem = {
    id: string;
    userId: string;
    workshopId: string;
    rating: number | null;
    comment: string;
    photos: string[];
    videoUrl: string | null;
    createdAt: string;
    updatedAt: string;
    workshop: WorkshopInfo | null;
    user: {
        fullName: string | null;
        firstName: string | null;
        lastName: string | null;
        email: string | null;
    };
};

type FeedbackDbRow = {
    id: string;
    user_id: string;
    workshop_id: string;
    comment: string;
    created_at: string;
    updated_at: string;
    rating?: number | string | null;
    photos?: unknown;
    video_url?: string | null;
};

function applyFeedbackFilters(query: any, q: string, workshopId: string) {
    let next = query;

    if (workshopId) {
        next = next.eq("workshop_id", workshopId);
    }

    if (q) {
        const safeQ = q.replace(/[%(),]/g, "");
        if (safeQ) {
            next = next.or(`comment.ilike.%${safeQ}%,workshop_id.ilike.%${safeQ}%`);
        }
    }

    return next;
}

export async function GET(request: NextRequest) {
    const auth = await requireAdminUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    const service = requireSupabaseService();
    if (!service.ok) return service.response;
    const serviceClient = service.client;

    try {
        const parsedQuery = parseQuery(
            request,
            adminFeedbackQuerySchema,
            "Invalid feedback query."
        );
        if (!parsedQuery.ok) {
            return parsedQuery.response;
        }

        const q = parsedQuery.data.q;
        const workshopId = parsedQuery.data.workshopId;
        const page = parsedQuery.data.page;
        const pageSize = parsedQuery.data.pageSize;
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        const queryWithOptionalCols = applyFeedbackFilters(
            serviceClient
                .from("workshop_feedback")
                .select(
                    "id,user_id,workshop_id,rating,comment,photos,video_url,created_at,updated_at",
                    { count: "exact" }
                ),
            q,
            workshopId
        );

        let { data, error, count } = await queryWithOptionalCols
            .order("updated_at", { ascending: false })
            .range(from, to);

        if (isMissingFeedbackTableError(error)) {
            const fallbackRecord = getFallbackFeedback(auth.user.id, SAMPLE_FEEDBACK_WORKSHOP_ID);
            const filteredFallback = fallbackRecord
                ? [fallbackRecord].filter((record) =>
                      matchesFallbackFeedbackFilters(record, q, workshopId)
                  )
                : [];

            const pagedFallback = filteredFallback
                .slice(from, to + 1)
                .map<FeedbackResponseItem>((record) => {
                    const workshopInfo = getFallbackWorkshopInfo(record.workshopId);
                    const fullName =
                        typeof auth.user.user_metadata?.full_name === "string"
                            ? auth.user.user_metadata.full_name
                            : null;

                    return {
                        id:
                            record.userId && record.workshopId
                                ? `${record.userId}-${record.workshopId}`
                                : "",
                        userId: record.userId,
                        workshopId: record.workshopId,
                        rating: record.rating,
                        comment: record.comment,
                        photos: record.photos,
                        videoUrl: record.videoUrl,
                        createdAt: record.createdAt,
                        updatedAt: record.updatedAt,
                        workshop: workshopInfo,
                        user: {
                            fullName,
                            firstName: null,
                            lastName: null,
                            email: auth.user.email || null,
                        },
                    };
                });

            const fallbackTotal = filteredFallback.length;
            return NextResponse.json({
                feedback: pagedFallback,
                total: fallbackTotal,
                page,
                pageSize,
                totalPages: Math.max(1, Math.ceil(fallbackTotal / pageSize)),
                filters: { q, workshopId },
            });
        }

        if (error?.code === "42703") {
            const fallbackQuery = applyFeedbackFilters(
                serviceClient
                    .from("workshop_feedback")
                    .select("id,user_id,workshop_id,comment,created_at,updated_at", {
                        count: "exact",
                    }),
                q,
                workshopId
            );

            const fallback = await fallbackQuery
                .order("updated_at", { ascending: false })
                .range(from, to);

            data = fallback.data;
            error = fallback.error;
            count = fallback.count;
        }

        if (error) {
            return jsonError("Failed to load feedback.", 500, error.message);
        }

        const rows = (Array.isArray(data) ? data : []) as FeedbackDbRow[];

        const userIds = Array.from(new Set(rows.map((row) => row.user_id).filter(Boolean)));
        const workshopIds = Array.from(new Set(rows.map((row) => row.workshop_id).filter(Boolean)));

        const workshopById = new Map<string, WorkshopInfo>();
        if (workshopIds.length > 0) {
            const { data: workshopsData } = await serviceClient
                .from("workshops")
                .select("id,title,date,time,city,location")
                .in("id", workshopIds);

            for (const workshop of workshopsData || []) {
                workshopById.set(String(workshop.id), {
                    id: String(workshop.id || ""),
                    title: String(workshop.title || "Workshop"),
                    date: String(workshop.date || ""),
                    time: workshop.time ? String(workshop.time) : null,
                    city: String(workshop.city || ""),
                    location: String(workshop.location || ""),
                });
            }
        }

        const profileById = new Map<string, string | null>();
        if (userIds.length > 0) {
            const { data: profilesData } = await serviceClient
                .from("profiles")
                .select("id, full_name")
                .in("id", userIds);

            for (const profile of profilesData || []) {
                profileById.set(String(profile.id), profile.full_name || null);
            }
        }

        const bookingByPair = new Map<
            string,
            { firstName: string | null; lastName: string | null; email: string | null }
        >();

        if (userIds.length > 0 && workshopIds.length > 0) {
            const { data: bookingsData } = await serviceClient
                .from("bookings")
                .select("user_id, workshop_id, first_name, last_name, email, created_at")
                .in("user_id", userIds)
                .in("workshop_id", workshopIds)
                .order("created_at", { ascending: false });

            for (const booking of bookingsData || []) {
                const key = `${booking.user_id}:${booking.workshop_id}`;
                if (!bookingByPair.has(key)) {
                    bookingByPair.set(key, {
                        firstName: booking.first_name || null,
                        lastName: booking.last_name || null,
                        email: booking.email || null,
                    });
                }
            }
        }

        const feedback: FeedbackResponseItem[] = rows.map((row) => {
            const userId = String(row.user_id || "");
            const wId = String(row.workshop_id || "");
            const booking = bookingByPair.get(`${userId}:${wId}`);
            const rawRating = row.rating;

            let rating: number | null = null;
            if (typeof rawRating === "number" && Number.isFinite(rawRating)) {
                rating = rawRating;
            } else if (
                typeof rawRating === "string" &&
                rawRating.trim() !== "" &&
                !Number.isNaN(Number(rawRating))
            ) {
                rating = Number(rawRating);
            }

            return {
                id: String(row.id || ""),
                userId,
                workshopId: wId,
                rating,
                comment: String(row.comment || ""),
                photos: Array.isArray(row.photos) ? row.photos.map((value) => String(value)) : [],
                videoUrl: typeof row.video_url === "string" && row.video_url ? row.video_url : null,
                createdAt: String(row.created_at || ""),
                updatedAt: String(row.updated_at || ""),
                workshop: workshopById.get(wId) || null,
                user: {
                    fullName: profileById.get(userId) || null,
                    firstName: booking?.firstName || null,
                    lastName: booking?.lastName || null,
                    email: booking?.email || null,
                },
            };
        });

        return NextResponse.json({
            feedback,
            total: count || 0,
            page,
            pageSize,
            totalPages: Math.max(1, Math.ceil((count || 0) / pageSize)),
            filters: {
                q,
                workshopId,
            },
        });
    } catch (error) {
        return handleApiError("Failed to load feedback.", error);
    }
}
