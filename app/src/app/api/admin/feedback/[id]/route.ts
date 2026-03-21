import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { handleApiError, parseBody } from "@/lib/api-route";
import type { TablesUpdate } from "@/lib/database.types";
import { requireSupabaseService } from "@/lib/api-helpers";
import { jsonError, requireAdminUser } from "@/lib/api-auth";
import { assertRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { adminFeedbackUpdateSchema } from "@/lib/validators";

type Params = {
    params: { id: string };
};

async function assertAdminFeedbackWriteLimit(request: NextRequest, userId: string) {
    return await assertRateLimit({
        key: getRateLimitKey(request, "admin-feedback-write", userId),
        limit: 60,
        windowMs: 60_000,
        message: "Too many moderation actions. Please wait and try again.",
    });
}

export async function PATCH(request: NextRequest, { params }: Params) {
    const auth = await requireAdminUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    const rateLimitResult = await assertAdminFeedbackWriteLimit(request, auth.user.id);
    if (!rateLimitResult.ok) {
        return rateLimitResult.response;
    }

    const service = requireSupabaseService();
    if (!service.ok) return service.response;
    const serviceClient = service.client;

    const parsed = await parseBody(
        request,
        adminFeedbackUpdateSchema,
        "Invalid JSON payload.",
        "Feedback update validation failed."
    );
    if (!parsed.ok) {
        return parsed.response;
    }

    try {
        const patch: TablesUpdate<"workshop_feedback"> = {};
        if (typeof parsed.data.rating === "number") {
            patch.rating = parsed.data.rating;
        }
        if (typeof parsed.data.comment === "string") {
            patch.comment = parsed.data.comment;
        }

        let updateResult = await serviceClient
            .from("workshop_feedback")
            .update(patch)
            .eq("id", params.id)
            .select("id,user_id,workshop_id,rating,comment,photos,video_url,created_at,updated_at")
            .maybeSingle();

        if (updateResult.error?.code === "42703") {
            // Older DB migration: retry without rating/media columns.
            if ("rating" in patch) {
                delete patch.rating;
            }
            if (!("comment" in patch)) {
                return jsonError(
                    "Rating edits are not available until feedback migration is applied.",
                    400
                );
            }

            updateResult = await serviceClient
                .from("workshop_feedback")
                .update(patch)
                .eq("id", params.id)
                .select("id,user_id,workshop_id,comment,created_at,updated_at")
                .maybeSingle();
        }

        if (updateResult.error) {
            throw updateResult.error;
        }

        const data = updateResult.data;
        if (!data) {
            return jsonError("Feedback not found.", 404);
        }

        return NextResponse.json({ feedback: data });
    } catch (error) {
        return handleApiError("Failed to update feedback.", error);
    }
}

export async function DELETE(request: NextRequest, { params }: Params) {
    const auth = await requireAdminUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    const rateLimitResult = await assertAdminFeedbackWriteLimit(request, auth.user.id);
    if (!rateLimitResult.ok) {
        return rateLimitResult.response;
    }

    const service = requireSupabaseService();
    if (!service.ok) return service.response;
    const serviceClient = service.client;

    try {
        const { data, error } = await serviceClient
            .from("workshop_feedback")
            .delete()
            .eq("id", params.id)
            .select("id")
            .maybeSingle();

        if (error) {
            throw error;
        }

        if (!data) {
            return jsonError("Feedback not found.", 404);
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        return handleApiError("Failed to delete feedback.", error);
    }
}
