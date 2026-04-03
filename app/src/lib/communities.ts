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
    isMock?: boolean;
};

export const mockCommunities: Community[] = [
    {
        id: "mock-community-1",
        slug: "mumbai-storytellers-circle",
        title: "Mumbai Storytellers Circle",
        summary:
            "A warm offline circle for writers, speakers, poets, and anyone who loves live storytelling.",
        description:
            "Mumbai Storytellers Circle brings together people who love to write, listen, speak, and share stories in an intimate community setting. We host guided prompt nights, live story rounds, feedback circles, and themed meetups for creatives who want to practice their voice and meet like-minded people.\n\nMembers join for the inspiration, the accountability, and the friendships that grow from regular gatherings.",
        category: "Storytelling",
        city: "Mumbai",
        hostName: "Asha Mehta",
        hostEmail: "asha@onlyworkshops.in",
        hostPhone: "9876543210",
        meetingFormat: "Offline",
        meetupFrequency: "Every Saturday evening",
        coverImage: "/images/workshops/IMG_20260306_125816.webp",
        instagramUrl: "https://instagram.com/mumbaistorycircle",
        websiteUrl: "https://onlyworkshops.in/communities/mumbai-storytellers-circle",
        whatsappUrl:
            "https://wa.me/917028478109?text=Hi%2C%20I%20want%20to%20join%20Mumbai%20Storytellers%20Circle",
        createdAt: "2026-03-20T10:00:00.000Z",
        isMock: true,
    },
    {
        id: "mock-community-2",
        slug: "pune-film-walk-collective",
        title: "Pune Film Walk Collective",
        summary:
            "Weekend film lovers, photographers, and observers meeting for city walks and cinematic frames.",
        description:
            "Pune Film Walk Collective is built for people who notice the mood of a street, love films, and want to explore visual storytelling together. We organise themed photo walks, movie debrief circles, and casual meetups where members swap references, locations, and visual ideas.\n\nWhether you are into photography, direction, or just looking for a creative circle, this community is a simple way to find your people.",
        category: "Film & Photography",
        city: "Pune",
        hostName: "Rohan Kulkarni",
        hostEmail: "rohan@onlyworkshops.in",
        hostPhone: "9921604163",
        meetingFormat: "Hybrid",
        meetupFrequency: "Two Sundays every month",
        coverImage: "/images/workshops/IMG_20260306_130025.webp",
        instagramUrl: "https://instagram.com/punefilmwalks",
        websiteUrl: "https://onlyworkshops.in/communities/pune-film-walk-collective",
        whatsappUrl:
            "https://wa.me/919921604163?text=Hi%2C%20I%20want%20to%20join%20Pune%20Film%20Walk%20Collective",
        createdAt: "2026-03-19T12:00:00.000Z",
        isMock: true,
    },
    {
        id: "mock-community-3",
        slug: "bangalore-slow-potters-club",
        title: "Bangalore Slow Potters Club",
        summary:
            "A beginner-friendly pottery community for people who want regular practice, shared studio time, and calm evenings.",
        description:
            "Bangalore Slow Potters Club is for hobby potters, total beginners, and anyone curious about clay as a long-term creative practice. Members meet for low-pressure studio hangs, clay play sessions, and peer-learning circles where people build consistency together.\n\nIt is less about one-off workshops and more about belonging to a creative rhythm you can return to every month.",
        category: "Pottery",
        city: "Bangalore",
        hostName: "Mira Nair",
        hostEmail: "mira@onlyworkshops.in",
        hostPhone: "9811142233",
        meetingFormat: "Offline",
        meetupFrequency: "Every alternate Friday",
        coverImage: "/images/workshops/IMG_20260306_125503.webp",
        instagramUrl: "https://instagram.com/slowpottersclub",
        websiteUrl: "https://onlyworkshops.in/communities/bangalore-slow-potters-club",
        whatsappUrl:
            "https://wa.me/919811142233?text=Hi%2C%20I%20want%20to%20join%20Bangalore%20Slow%20Potters%20Club",
        createdAt: "2026-03-18T16:00:00.000Z",
        isMock: true,
    },
    {
        id: "mock-community-4",
        slug: "delhi-street-photo-sundays",
        title: "Delhi Street Photo Sundays",
        summary:
            "A social photo community for early-morning walks, critique sessions, and monthly public photo drops.",
        description:
            "Delhi Street Photo Sundays gathers curious photographers and visual storytellers for weekend shoots across markets, heritage lanes, and changing city corners. The group balances exploration with feedback, making it welcoming for both first-time shooters and experienced image-makers.\n\nMembers join to stay consistent, build a body of work, and be part of a community that looks closely at the city.",
        category: "Photography",
        city: "Delhi",
        hostName: "Nidhi Arora",
        hostEmail: "nidhi@onlyworkshops.in",
        hostPhone: "9810081008",
        meetingFormat: "Offline",
        meetupFrequency: "Every Sunday morning",
        coverImage: "/images/workshops/IMG_20260306_130143.webp",
        instagramUrl: "https://instagram.com/delhistreetphotosundays",
        websiteUrl: "https://onlyworkshops.in/communities/delhi-street-photo-sundays",
        whatsappUrl:
            "https://wa.me/919810081008?text=Hi%2C%20I%20want%20to%20join%20Delhi%20Street%20Photo%20Sundays",
        createdAt: "2026-03-17T09:30:00.000Z",
        isMock: true,
    },
];

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
        isMock: false,
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

export function getMockCommunityBySlug(slug: string) {
    const normalizedSlug = normalizeCommunitySlug(slug);

    return (
        mockCommunities.find(
            (community) => normalizeCommunitySlug(community.slug) === normalizedSlug
        ) || null
    );
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
