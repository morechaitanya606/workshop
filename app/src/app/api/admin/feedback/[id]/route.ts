import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { handleApiError, parseBody } from "@/lib/api-route";
import type { DbUpdate } from "@/lib/database.types";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase-server";
import { requireAdminUser } from "@/lib/api-auth";
import { adminFeedbackUpdateSchema } from "@/lib/validators";

type Params = {
    params: { id: string };
};

export async function PATCH(request: NextRequest, { params }: Params) {
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
        const patch: DbUpdate<"workshop_feedback"> = {};
        if (typeof parsed.data.rating === "number") {
            patch.rating = parsed.data.rating;
        }
        if (typeof parsed.data.comment === "string") {
            patch.comment = parsed.data.comment;
        }

        const serviceClient = createSupabaseServiceClient();
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
                return NextResponse.json(
                    {
                        error: "Rating edits are not available until feedback migration is applied.",
                    },
                    { status: 400 }
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
            return NextResponse.json(
                {
                    error: "Failed to update feedback.",
                    details: updateResult.error.message,
                },
                { status: 500 }
            );
        }

        const data = updateResult.data;
        if (!data) {
            return NextResponse.json({ error: "Feedback not found." }, { status: 404 });
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

    if (!isSupabaseServiceConfigured) {
        return NextResponse.json(
            { error: "Supabase service role is not configured." },
            { status: 500 }
        );
    }

    try {
        const serviceClient = createSupabaseServiceClient();
        const { data, error } = await serviceClient
            .from("workshop_feedback")
            .delete()
            .eq("id", params.id)
            .select("id")
            .maybeSingle();

        if (error) {
            return NextResponse.json(
                { error: "Failed to delete feedback.", details: error.message },
                { status: 500 }
            );
        }

        if (!data) {
            return NextResponse.json({ error: "Feedback not found." }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        return handleApiError("Failed to delete feedback.", error);
    }
}
