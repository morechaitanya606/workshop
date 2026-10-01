import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthenticatedUser, jsonError } from "@/lib/api-auth";
import { parseBody } from "@/lib/api-route";
import type { Tables } from "@/lib/database.types";
import { requireSupabaseService } from "@/lib/api-helpers";
import { workshopFeedbackSchema } from "@/lib/validators";
import { assertRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { isMissingFeedbackTableError } from "@/lib/feedback-fallback";
import { getWorkshopDateTime } from "@/lib/booking-time";

type FeedbackRow = Pick<
    Tables<"workshop_feedback">,
    "rating" | "comment" | "photos" | "video_url" | "created_at" | "updated_at"
>;

/**
 * Whether the workshop has already started, with date and time read as IST.
 *
 * This used to build `new Date("<date>T<time>:00")` with no offset, which parses in the
 * SERVER's zone -- UTC on Vercel -- so feedback opened 5.5 hours before the workshop began.
 * getWorkshopDateTime pins the zone to IST (+05:30) like the booking cutoff does.
 */
function isWorkshopPast(date: string, time: string | null | undefined) {
    const workshopDateTime = getWorkshopDateTime(date, time);

    if (!workshopDateTime) {
        // Unparseable date: fall back to comparing calendar days in IST, never UTC.
        const todayIst = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
        return String(date) < todayIst;
    }

    return workshopDateTime.getTime() < Date.now();
}

/** Whether a submission changes anything a reviewer already approved. */
function feedbackContentChanged(
    existing: Pick<FeedbackRow, "rating" | "comment" | "photos" | "video_url"> | null,
    next: {
        rating: number;
        comment: string | null | undefined;
        photos: string[];
        video_url: string | null;
    }
) {
    if (!existing) return true;

    return (
        Number(existing.rating) !== Number(next.rating) ||
        (existing.comment ?? "") !== (next.comment ?? "") ||
        (existing.video_url ?? null) !== next.video_url ||
        JSON.stringify(existing.photos ?? []) !== JSON.stringify(next.photos)
    );
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    const service = requireSupabaseService();
    if (!service.ok) return service.response;
    const serviceClient = service.client;

    const { id: workshopId } = await params;

    try {
        const { data: workshop, error: workshopError } = await serviceClient
            .from("workshops")
            .select("date, time")
            .eq("id", workshopId)
            .maybeSingle();

        if (workshopError || !workshop) {
            return jsonError("Workshop not found.", 404);
        }

        const canLeaveFeedback = isWorkshopPast(
            String(workshop.date),
            workshop.time ? String(workshop.time) : null
        );

        const { data: bookingData, error: bookingError } = await serviceClient
            .from("bookings")
            .select("id")
            .eq("user_id", auth.user.id)
            .eq("workshop_id", workshopId)
            .eq("status", "confirmed")
            .limit(1);

        if (bookingError) {
            return jsonError("Unable to load feedback.", 500, bookingError);
        }

        if (!bookingData || bookingData.length === 0 || !canLeaveFeedback) {
            return NextResponse.json({
                feedback: null,
                canLeaveFeedback: false,
            });
        }

        const { data, error } = await serviceClient
            .from("workshop_feedback")
            .select("rating, comment, photos, video_url, created_at, updated_at")
            .eq("user_id", auth.user.id)
            .eq("workshop_id", workshopId)
            .maybeSingle();

        if (isMissingFeedbackTableError(error)) {
            return NextResponse.json({
                feedback: null,
                canLeaveFeedback: false,
                message: "Feedback is unavailable until the workshop_feedback table is configured.",
            });
        }

        if (error) {
            return jsonError("Unable to load feedback.", 500, error);
        }

        return NextResponse.json({
            feedback: (data as FeedbackRow | null) || null,
            canLeaveFeedback: true,
        });
    } catch (error) {
        return jsonError("Unable to load feedback.", 500, String(error));
    }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const { id: workshopId } = await params;

    try {
        const { data: workshop, error: workshopError } = await serviceClient
            .from("workshops")
            .select("date, time")
            .eq("id", workshopId)
            .maybeSingle();

        if (workshopError || !workshop) {
            return jsonError("Workshop not found.", 404);
        }

        if (!isWorkshopPast(String(workshop.date), workshop.time ? String(workshop.time) : null)) {
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

        const nextContent = {
            rating: parsed.data.rating,
            comment: parsed.data.comment,
            photos: parsed.data.photos || [],
            video_url: parsed.data.videoUrl || null,
        };

        // An edit to an approved review must go back through moderation. The upsert used to
        // leave `is_published` untouched, so an attendee could get a harmless review approved
        // and then rewrite it to anything -- links, abuse, a different rating -- while it
        // stayed live. Only a real content change re-queues it, so re-saving the same text
        // does not knock an approved review offline. (A database trigger enforces the same
        // rule; this keeps the route correct without it.)
        const { data: existingFeedback, error: existingFeedbackError } = await serviceClient
            .from("workshop_feedback")
            .select("rating, comment, photos, video_url")
            .eq("user_id", auth.user.id)
            .eq("workshop_id", workshopId)
            .maybeSingle();

        if (isMissingFeedbackTableError(existingFeedbackError)) {
            return jsonError(
                "Feedback is unavailable until the workshop_feedback table is configured.",
                503
            );
        }

        if (existingFeedbackError) {
            return jsonError("Unable to save feedback.", 500, existingFeedbackError);
        }

        const contentChanged = feedbackContentChanged(
            (existingFeedback as Pick<
                FeedbackRow,
                "rating" | "comment" | "photos" | "video_url"
            > | null) || null,
            nextContent
        );

        const { data: saved, error: saveError } = await serviceClient
            .from("workshop_feedback")
            .upsert(
                {
                    user_id: auth.user.id,
                    workshop_id: workshopId,
                    ...nextContent,
                    ...(contentChanged ? { is_published: false } : {}),
                },
                { onConflict: "user_id,workshop_id" }
            )
            .select("rating, comment, photos, video_url, created_at, updated_at")
            .single();

        if (isMissingFeedbackTableError(saveError)) {
            return jsonError(
                "Feedback is unavailable until the workshop_feedback table is configured.",
                503
            );
        }

        if (saveError) {
            return jsonError("Unable to save feedback.", 500, saveError);
        }

        // Reviews now land unpublished and pass through the admin gate in
        // /api/admin/feedback/[id], so say so rather than implying this is already live.
        return NextResponse.json({
            feedback: saved as FeedbackRow,
            message: "Thanks for sharing your feedback. It will appear once reviewed.",
        });
    } catch (error) {
        return jsonError("Unable to save feedback.", 500, String(error));
    }
}
