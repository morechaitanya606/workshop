import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
    createSupabaseServiceClient,
    isSupabaseServiceConfigured,
} from "@/lib/supabase-server";
import { requireAdminUser } from "@/lib/api-auth";

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

    if (!isSupabaseServiceConfigured) {
        return NextResponse.json(
            { error: "Supabase service role is not configured." },
            { status: 500 }
        );
    }

    try {
        const params = request.nextUrl.searchParams;
        const q = (params.get("q") || "").trim();
        const workshopId = (params.get("workshopId") || "").trim();
        const page = Math.max(1, Number.parseInt(params.get("page") || "1", 10));
        const pageSize = Math.min(
            50,
            Math.max(1, Number.parseInt(params.get("pageSize") || "12", 10))
        );
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        const serviceClient = createSupabaseServiceClient();

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

        if (error?.code === "42P01") {
            // Feedback table not available yet in this environment.
            return NextResponse.json({
                feedback: [],
                total: 0,
                page,
                pageSize,
                totalPages: 1,
                filters: { q, workshopId },
            });
        }

        if (error?.code === "42703") {
            const fallbackQuery = applyFeedbackFilters(
                serviceClient
                    .from("workshop_feedback")
                    .select(
                        "id,user_id,workshop_id,comment,created_at,updated_at",
                        { count: "exact" }
                    ),
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
            return NextResponse.json(
                { error: "Failed to load feedback.", details: error.message },
                { status: 500 }
            );
        }

        const rows = (Array.isArray(data) ? data : []) as FeedbackDbRow[];

        const userIds = Array.from(
            new Set(rows.map((row) => row.user_id).filter(Boolean))
        );
        const workshopIds = Array.from(
            new Set(rows.map((row) => row.workshop_id).filter(Boolean))
        );

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
                photos: Array.isArray(row.photos)
                    ? row.photos.map((value) => String(value))
                    : [],
                videoUrl:
                    typeof row.video_url === "string" && row.video_url
                        ? row.video_url
                        : null,
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
        return NextResponse.json(
            { error: "Failed to load feedback.", details: String(error) },
            { status: 500 }
        );
    }
}
