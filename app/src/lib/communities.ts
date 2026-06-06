import type { Tables, TablesInsert } from "@/lib/database.types";
import type { SupabaseServerClient } from "@/lib/supabase-server";
import type { CommunityCreateInput } from "@/lib/validators";

export type Community = {
    id: string;
    slug: string;
    title: string;
    summary: string;
    description: string;
    category: string;
    city: string;
    hostName: string;
    hostEmail: string;
    hostPhone: string;
    meetingFormat: string;
    meetupFrequency: string;
    coverImage: string | null;
    instagramUrl: string | null;
    websiteUrl: string | null;
    whatsappUrl: string | null;
    createdAt: string;
};

const DEFAULT_COMMUNITY_SOCIAL_PREVIEW_IMAGE = "/images/og-default.jpg";

function normalizeOptionalUrl(value: unknown) {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
}

function isHttpUrl(value: string) {
    try {
        const parsed = new URL(value);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
        return false;
    }
}

export function mapCommunityRowToCommunity(row: Tables<"communities">): Community {
    return {
        id: row.id,
        slug: row.slug,
        title: row.title,
        summary: row.summary,
        description: row.description,
        category: row.category,
        city: row.city,
        hostName: row.host_name,
        hostEmail: row.host_email,
        hostPhone: row.host_phone,
        meetingFormat: row.meeting_format,
        meetupFrequency: row.meetup_frequency,
        coverImage: normalizeOptionalUrl(row.cover_image),
        instagramUrl: normalizeOptionalUrl(row.instagram_url),
        websiteUrl: normalizeOptionalUrl(row.website_url),
        whatsappUrl: normalizeOptionalUrl(row.whatsapp_url),
        createdAt: row.created_at,
    };
}

export function slugifyCommunityTitle(title: string) {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
        .slice(0, 72);
}

export function normalizeCommunitySlug(slug: string) {
    const trimmedSlug = slug.trim();

    try {
        return decodeURIComponent(trimmedSlug).trim().toLowerCase();
    } catch {
        return trimmedSlug.toLowerCase();
    }
}

export function getCommunitySocialPreviewImage(coverImage: string | null) {
    const normalizedCoverImage = normalizeOptionalUrl(coverImage);
    if (normalizedCoverImage && isHttpUrl(normalizedCoverImage)) {
        return normalizedCoverImage;
    }

    return DEFAULT_COMMUNITY_SOCIAL_PREVIEW_IMAGE;
}

export async function generateUniqueCommunitySlug(
    serviceClient: SupabaseServerClient,
    title: string
) {
    const baseSlug = slugifyCommunityTitle(title) || "community";
    let attempt = 1;

    while (attempt <= 25) {
        const suffix = attempt === 1 ? "" : `-${attempt}`;
        const slug = `${baseSlug.slice(0, Math.max(1, 72 - suffix.length))}${suffix}`;
        const { data, error } = await serviceClient
            .from("communities")
            .select("id")
            .eq("slug", slug)
            .maybeSingle();

        if (error) throw error;
        if (!data) return slug;

        attempt += 1;
    }

    return `${baseSlug.slice(0, 60)}-${Date.now().toString().slice(-6)}`;
}

export function buildCommunityInsertPayload(
    input: CommunityCreateInput,
    slug: string
): TablesInsert<"communities"> {
    return {
        slug,
        title: input.title.trim(),
        summary: input.summary.trim(),
        description: input.description.trim(),
        category: input.category.trim(),
        city: input.city.trim(),
        host_name: input.hostName.trim(),
        host_email: input.hostEmail.trim(),
        host_phone: input.hostPhone.trim(),
        meeting_format: input.meetingFormat.trim(),
        meetup_frequency: input.meetupFrequency.trim(),
        cover_image: input.coverImage?.trim() || null,
        instagram_url: input.instagramUrl.trim() || null,
        website_url: input.websiteUrl.trim() || null,
        whatsapp_url: input.whatsappUrl.trim() || null,
    };
}

export async function getCommunityBySlug(
    serviceClient: SupabaseServerClient,
    slug: string
): Promise<Community | null> {
    const { data, error } = await serviceClient
        .from("communities")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();

    if (error) {
        throw error;
    }

    return data ? mapCommunityRowToCommunity(data) : null;
}

export async function listCommunities(
    serviceClient: SupabaseServerClient,
    limit = 24
): Promise<Community[]> {
    const { data, error } = await serviceClient
        .from("communities")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

    if (error) {
        throw error;
    }

    return (data || []).map((row) => mapCommunityRowToCommunity(row));
}

export function mergeCommunities(primary: Community[], fallback: Community[]) {
    const seen = new Set<string>();
    const merged: Community[] = [];

    for (const community of [...primary, ...fallback]) {
        const normalizedSlug = normalizeCommunitySlug(community.slug);

        if (seen.has(normalizedSlug)) continue;
        seen.add(normalizedSlug);
        merged.push(community);
    }

    return merged;
}
