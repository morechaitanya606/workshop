import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthenticatedUser, jsonError } from "@/lib/api-auth";
import { parseBody } from "@/lib/api-route";
import type { DbTable } from "@/lib/database.types";
import { requireSupabaseService } from "@/lib/api-helpers";
import { workshopFeedbackSchema } from "@/lib/validators";
import { ensureWorkshopSeededFromMock } from "@/lib/workshop-utils";
import { assertRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import {
    getFallbackFeedback,
    isMissingFeedbackTableError,
    saveFallbackFeedback,
    toFallbackWorkshopFeedbackResponse,
} from "@/lib/feedback-fallback";

type FeedbackRow = Pick<
    DbTable<"workshop_feedback">,
    "rating" | "comment" | "photos" | "video_url" | "created_at" | "updated_at"
>;

function isWorkshopPast(date: string, time: string | null) {
    const today = new Date().toISOString().slice(0, 10);
    const hhmm = String(time || "00:00").slice(0, 5);
    const workshopDateTime = new Date(`${date}T${hhmm}:00`);
    if (Number.isNaN(workshopDateTime.getTime())) {
        return date < today;
    }
    return workshopDateTime.getTime() < Date.now();
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    const service = requireSupabaseService();
    if (!service.ok) return service.response;
    const serviceClient = service.client;

    const workshopId = params.id;

    try {
        const seeded = await ensureWorkshopSeededFromMock(serviceClient, workshopId);
        if (!seeded) {
            return jsonError("Workshop not found.", 404);
        }

        const { data: bookingData, error: bookingError } = await serviceClient
            .from("bookings")
            .select("id")
            .eq("user_id", auth.user.id)
            .eq("workshop_id", workshopId)
            .eq("status", "confirmed")
            .limit(1);

        if (bookingError || !bookingData || bookingData.length === 0) {
            return jsonError(
                "You must have a confirmed booking to leave or view feedback for this workshop.",
                403
            );
        }

        const { data, error } = await serviceClient
            .from("workshop_feedback")
            .select("rating, comment, photos, video_url, created_at, updated_at")
            .eq("user_id", auth.user.id)
            .eq("workshop_id", workshopId)
            .maybeSingle();

        if (isMissingFeedbackTableError(error)) {
            const fallback = getFallbackFeedback(auth.user.id, workshopId);
            return NextResponse.json({
                feedback: fallback ? toFallbackWorkshopFeedbackResponse(fallback) : null,
            });
        }

        if (error) {
            return jsonError("Unable to load feedback.", 500, error);
        }

        return NextResponse.json({ feedback: (data as FeedbackRow | null) || null });
    } catch (error) {
        return jsonError("Unable to load feedback.", 500, String(error));
    }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    const rateLimitResult = await assertRateLimit({
        key: getRateLimitKey(request, "workshop-feedback-write", auth.user.id),
        limit: 12,
        windowMs: 60_000,
        message: "Too many feedback updates. Please wait before trying again.",
    });
    if (!rateLimitResult.ok) {
        return rateLimitResult.response;
    }

    const service = requireSupabaseService();
    if (!service.ok) return service.response;
    const serviceClient = service.client;

    const parsed = await parseBody(
        request,
        workshopFeedbackSchema,
        "Invalid JSON payload.",
        "Invalid feedback payload."
    );
    if (!parsed.ok) {
        return parsed.response;
    }

    const workshopId = params.id;

    try {
        const seeded = await ensureWorkshopSeededFromMock(serviceClient, workshopId);
        if (!seeded) {
            return jsonError("Workshop not found.", 404);
        }

        const { data: workshop, error: workshopError } = await serviceClient
            .from("workshops")
            .select("date, time")
            .eq("id", workshopId)
            .maybeSingle();

        if (workshopError || !workshop) {
            return jsonError("Workshop not found.", 404);
        }

        if (!isWorkshopPast(String(workshop.date), String(workshop.time))) {
            return jsonError("Feedback can only be submitted after the event.", 409);
        }

        const { data: bookingData, error: bookingError } = await serviceClient
            .from("bookings")
            .select("id")
            .eq("user_id", auth.user.id)
            .eq("workshop_id", workshopId)
            .eq("status", "confirmed")
            .limit(1);

        if (bookingError || !bookingData || bookingData.length === 0) {
            return jsonError(
                "You must have a confirmed booking to submit feedback for this workshop.",
                403
            );
        }

        const { data: saved, error: saveError } = await serviceClient
            .from("workshop_feedback")
            .upsert(
                {
                    user_id: auth.user.id,
                    workshop_id: workshopId,
                    rating: parsed.data.rating,
                    comment: parsed.data.comment,
                    photos: parsed.data.photos || [],
                    video_url: parsed.data.videoUrl || null,
                },
                { onConflict: "user_id,workshop_id" }
            )
            .select("rating, comment, photos, video_url, created_at, updated_at")
            .single();

        if (isMissingFeedbackTableError(saveError)) {
            const savedFallback = saveFallbackFeedback(auth.user.id, workshopId, {
                rating: parsed.data.rating ?? null,
                comment: parsed.data.comment,
                photos: parsed.data.photos || [],
                videoUrl: parsed.data.videoUrl || null,
            });

            return NextResponse.json({
                feedback: toFallbackWorkshopFeedbackResponse(savedFallback),
                message: "Thanks for sharing your feedback.",
            });
        }

        if (saveError) {
            return jsonError("Unable to save feedback.", 500, saveError);
        }

        return NextResponse.json({
            feedback: saved as FeedbackRow,
            message: "Thanks for sharing your feedback.",
        });
    } catch (error) {
        return jsonError("Unable to save feedback.", 500, String(error));
    }
}
