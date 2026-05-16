import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { handleApiError, parseBody } from "@/lib/api-route";
import { jsonError, requireAdminUser } from "@/lib/api-auth";
import { requireSupabaseService } from "@/lib/api-helpers";
import { isMissingCommunityPhotosTableError, mapCommunityPhotoRow } from "@/lib/community-photos";
import { communityPhotoUpdateSchema } from "@/lib/validators";

type RouteContext = {
    params: {
        id: string;
    };
};

export async function PATCH(request: NextRequest, context: RouteContext) {
    const auth = await requireAdminUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    const service = requireSupabaseService();
    if (!service.ok) {
        return service.response;
    }

    const parsed = await parseBody(
        request,
        communityPhotoUpdateSchema,
        "Invalid community photo payload.",
        "Community photo update is invalid."
    );
    if (!parsed.ok) {
        return parsed.response;
    }

    try {
        const updates = {
            ...(parsed.data.altText !== undefined ? { alt_text: parsed.data.altText } : {}),
            ...(parsed.data.sortOrder !== undefined ? { sort_order: parsed.data.sortOrder } : {}),
            ...(parsed.data.isActive !== undefined ? { is_active: parsed.data.isActive } : {}),
        };

        const { data, error } = await service.client
            .from("community_photos")
            .update(updates)
            .eq("id", context.params.id)
            .select("*")
            .single();

        if (error) {
            if (isMissingCommunityPhotosTableError(error)) {
                return jsonError(
                    "Community photos table is unavailable. Run the latest Supabase migration first.",
                    500
                );
            }

            throw error;
        }

        revalidatePath("/");

        return NextResponse.json({ photo: mapCommunityPhotoRow(data) });
    } catch (error) {
        return handleApiError("Failed to update community photo.", error);
    }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
    const auth = await requireAdminUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    const service = requireSupabaseService();
    if (!service.ok) {
        return service.response;
    }

    try {
        const { error } = await service.client
            .from("community_photos")
            .delete()
            .eq("id", context.params.id);

        if (error) {
            if (isMissingCommunityPhotosTableError(error)) {
                return jsonError(
                    "Community photos table is unavailable. Run the latest Supabase migration first.",
                    500
                );
            }

            throw error;
        }

        revalidatePath("/");

        return NextResponse.json({ success: true });
    } catch (error) {
        return handleApiError("Failed to delete community photo.", error);
    }
}
