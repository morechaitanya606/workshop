import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthenticatedUser, jsonError } from "@/lib/api-auth";
import { requireSupabaseService } from "@/lib/api-helpers";
import { parseBody } from "@/lib/api-route";
import { z } from "zod";
import { isMissingFeedbackTableError } from "@/lib/feedback-fallback";

const bulkFeedbackSchema = z.object({
    workshopIds: z.array(z.string()).max(100),
});

export async function POST(request: NextRequest) {
    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    const service = requireSupabaseService();
    if (!service.ok) return service.response;
    const serviceClient = service.client;

    const parsed = await parseBody(
        request,
        bulkFeedbackSchema,
        "Invalid JSON payload.",
        "Invalid bulk feedback payload."
    );
    if (!parsed.ok) {
        return parsed.response;
    }

    const { workshopIds } = parsed.data;

    if (workshopIds.length === 0) {
        return NextResponse.json({ feedback: {} });
    }

    try {
        // Query workshop_feedback table for all provided workshopIds for this user
        const { data, error } = await serviceClient
            .from("workshop_feedback")
            .select("workshop_id, rating, comment, photos, video_url, created_at, updated_at")
            .eq("user_id", auth.user.id)
            .in("workshop_id", workshopIds);

        const feedbackMap: Record<
            string,
            {
                rating: number | null;
                comment: string;
                photos: string[];
                video_url: string | null;
                created_at: string;
                updated_at: string;
            }
        > = {};

        if (isMissingFeedbackTableError(error)) {
            return NextResponse.json({ feedback: {} });
        }

        if (error) {
            return jsonError("Unable to load feedback in bulk.", 500, error);
        }

        if (data) {
            for (const row of data) {
                feedbackMap[row.workshop_id] = {
                    rating: row.rating,
                    comment: row.comment,
                    photos: Array.isArray(row.photos) ? row.photos.map((item) => String(item)) : [],
                    video_url: row.video_url,
                    created_at: row.created_at,
                    updated_at: row.updated_at,
                };
            }
        }

        return NextResponse.json({ feedback: feedbackMap });
    } catch (error) {
        return jsonError("Unable to load feedback in bulk.", 500, String(error));
    }
}
