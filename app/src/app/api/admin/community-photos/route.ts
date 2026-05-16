import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { handleApiError, parseBody } from "@/lib/api-route";
import { jsonError, requireAdminUser } from "@/lib/api-auth";
import { requireSupabaseService } from "@/lib/api-helpers";
import {
    isMissingCommunityPhotosTableError,
    listCommunityPhotos,
    mapCommunityPhotoRow,
} from "@/lib/community-photos";
import { communityPhotoCreateSchema } from "@/lib/validators";

export async function GET(request: NextRequest) {
    const auth = await requireAdminUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    const service = requireSupabaseService();
    if (!service.ok) {
        return service.response;
    }

    try {
        const photos = await listCommunityPhotos(service.client, {
            activeOnly: false,
        });

        return NextResponse.json({ photos });
    } catch (error) {
        if (isMissingCommunityPhotosTableError(error)) {
            return jsonError(
                "Community photos table is unavailable. Run the latest Supabase migration first.",
                500
            );
        }

        return handleApiError("Failed to load community photos.", error);
    }
}

export async function POST(request: NextRequest) {
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
        communityPhotoCreateSchema,
        "Invalid community photo payload.",
        "Community photo request is invalid."
    );
    if (!parsed.ok) {
        return parsed.response;
    }

    try {
        const { data, error } = await service.client
            .from("community_photos")
            .insert({
                image_url: parsed.data.imageUrl,
                alt_text: parsed.data.altText,
                sort_order: parsed.data.sortOrder,
                is_active: parsed.data.isActive,
                created_by: auth.user.id,
            })
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

        return NextResponse.json({ photo: mapCommunityPhotoRow(data) }, { status: 201 });
    } catch (error) {
        return handleApiError("Failed to add community photo.", error);
    }
}
