import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthenticatedUser, jsonError } from "@/lib/api-auth";
import {
    createSupabaseServiceClient,
    isSupabaseServiceConfigured,
} from "@/lib/supabase-server";
import { workshopFeedbackSchema } from "@/lib/validators";
import { ensureWorkshopSeededFromMock } from "@/lib/workshop-utils";

type FeedbackRow = {
    rating: number;
    comment: string;
    photos: string[];
    video_url: string;
    created_at: string;
    updated_at: string;
};

function isWorkshopPast(date: string, time: string | null) {
    const today = new Date().toISOString().slice(0, 10);
    const hhmm = String(time || "00:00").slice(0, 5);
    const workshopDateTime = new Date(`${date}T${hhmm}:00`);
    if (Number.isNaN(workshopDateTime.getTime())) {
        return date < today;
    }
    return workshopDateTime.getTime() < Date.now();
}

export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    if (!isSupabaseServiceConfigured) {
        return jsonError(
            "Supabase service role is not configured. Add SUPABASE_SERVICE_ROLE_KEY.",
            500
        );
    }

    const workshopId = params.id;

    try {
        const serviceClient = createSupabaseServiceClient();
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
            return jsonError("You must have a confirmed booking to leave or view feedback for this workshop.", 403);
        }

        const { data, error } = await serviceClient
            .from("workshop_feedback")
            .select("rating, comment, photos, video_url, created_at, updated_at")
            .eq("user_id", auth.user.id)
            .eq("workshop_id", workshopId)
            .maybeSingle();

        if (error) {
            return jsonError("Unable to load feedback.", 500, error);
        }

        return NextResponse.json({
            feedback: (data as FeedbackRow | null) || null,
        });
    } catch (error) {
        return jsonError("Unable to load feedback.", 500, String(error));
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    if (!isSupabaseServiceConfigured) {
        return jsonError(
            "Supabase service role is not configured. Add SUPABASE_SERVICE_ROLE_KEY.",
            500
        );
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return jsonError("Invalid JSON payload.", 400);
    }

    const parsed = workshopFeedbackSchema.safeParse(body);
    if (!parsed.success) {
        return jsonError("Invalid feedback payload.", 400, parsed.error.flatten());
    }

    const workshopId = params.id;

    try {
        const serviceClient = createSupabaseServiceClient();
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
            return jsonError("You must have a confirmed booking to submit feedback for this workshop.", 403);
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
