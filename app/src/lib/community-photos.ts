import type { Tables } from "@/lib/database.types";
import { galleryImages } from "@/lib/data";
import {
    createSupabaseServiceClient,
    isSupabaseServiceConfigured,
    type SupabaseServerClient,
} from "@/lib/supabase-server";

export type CommunityPhoto = {
    id: string;
    imageUrl: string;
    altText: string;
    sortOrder: number;
    isActive: boolean;
    createdAt: string;
};

type CommunityPhotoRow = Tables<"community_photos">;

export function mapCommunityPhotoRow(row: CommunityPhotoRow): CommunityPhoto {
    return {
        id: row.id,
        imageUrl: row.image_url,
        altText: row.alt_text || "",
        sortOrder: row.sort_order,
        isActive: row.is_active,
        createdAt: row.created_at,
    };
}

export function getFallbackCommunityPhotos(limit = 12): CommunityPhoto[] {
    return galleryImages.slice(0, limit).map((imageUrl, index) => ({
        id: `fallback-community-photo-${index + 1}`,
        imageUrl,
        altText: `Community workshop ${index + 1}`,
        sortOrder: index,
        isActive: true,
        createdAt: new Date(0).toISOString(),
    }));
}

export function isMissingCommunityPhotosTableError(error: unknown) {
    if (!error || typeof error !== "object") return false;
    const maybeError = error as { code?: unknown; message?: unknown };
    const code = typeof maybeError.code === "string" ? maybeError.code : "";
    const message = typeof maybeError.message === "string" ? maybeError.message.toLowerCase() : "";

    return code === "42P01" || message.includes("community_photos");
}

export async function listCommunityPhotos(
    serviceClient: SupabaseServerClient,
    options?: {
        limit?: number;
        activeOnly?: boolean;
    }
) {
    let query = serviceClient
        .from("community_photos")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });

    if (options?.activeOnly ?? true) {
        query = query.eq("is_active", true);
    }

    if (options?.limit) {
        query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) throw error;

    return (data || []).map(mapCommunityPhotoRow);
}

export async function loadHomepageCommunityPhotos(limit = 12): Promise<CommunityPhoto[]> {
    if (!isSupabaseServiceConfigured) {
        return getFallbackCommunityPhotos(limit);
    }

    try {
        const photos = await listCommunityPhotos(createSupabaseServiceClient(), {
            limit,
            activeOnly: true,
        });

        return photos.length > 0 ? photos : getFallbackCommunityPhotos(limit);
    } catch {
        return getFallbackCommunityPhotos(limit);
    }
}
