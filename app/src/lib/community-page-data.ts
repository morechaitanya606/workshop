import "server-only";

import * as Sentry from "@sentry/core";
import {
    getCommunityBySlug,
    listCommunities,
    mockCommunities,
    normalizeCommunitySlug,
    type Community,
} from "@/lib/communities";
import { warnDevFallback } from "@/lib/dev-warnings";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase-server";

export type CommunityPageSource = "supabase" | "mock" | "error";

export type PublicCommunitiesResult = {
    data: Community[];
    source: CommunityPageSource;
};

export type PublicCommunityResult = {
    community: Community | null;
    source: CommunityPageSource;
};

function allowMockFallback() {
    return process.env.NODE_ENV !== "production";
}

function rankRelatedCommunities(current: Community, communities: Community[], limit: number) {
    const others = communities.filter((community) => community.slug !== current.slug);

    const sameCategory = others.filter(
        (community) => community.category.toLowerCase() === current.category.toLowerCase()
    );
    const sameCity = others.filter(
        (community) =>
            community.city.toLowerCase() === current.city.toLowerCase() &&
            !sameCategory.some((candidate) => candidate.slug === community.slug)
    );
    const rest = others.filter(
        (community) =>
            !sameCategory.some((candidate) => candidate.slug === community.slug) &&
            !sameCity.some((candidate) => candidate.slug === community.slug)
    );

    return [...sameCategory, ...sameCity, ...rest].slice(0, limit);
}

export async function loadPublicCommunities(limit = 24): Promise<PublicCommunitiesResult> {
    let fallbackReason = "Supabase service is unavailable.";

    if (isSupabaseServiceConfigured) {
        try {
            const data = await listCommunities(createSupabaseServiceClient(), limit);
            return {
                data,
                source: "supabase",
            };
        } catch (error) {
            fallbackReason =
                error instanceof Error
                    ? error.message
                    : "Unexpected error while loading communities.";
            Sentry.captureException(error, {
                tags: {
                    layer: "web",
                    route: "communities_page",
                },
            });
        }
    }

    if (!allowMockFallback()) {
        return {
            data: [],
            source: "error",
        };
    }

    warnDevFallback("communities_page", `Using mock communities because ${fallbackReason}`);
    return {
        data: mockCommunities.slice(0, limit),
        source: "mock",
    };
}

export async function loadPublicCommunityBySlug(slug: string): Promise<PublicCommunityResult> {
    const normalizedSlug = normalizeCommunitySlug(slug);
    let fallbackReason = "Supabase service is unavailable.";

    if (isSupabaseServiceConfigured) {
        try {
            const community = await getCommunityBySlug(
                createSupabaseServiceClient(),
                normalizedSlug
            );
            return {
                community,
                source: "supabase",
            };
        } catch (error) {
            fallbackReason =
                error instanceof Error
                    ? error.message
                    : "Unexpected error while loading community.";
            Sentry.captureException(error, {
                tags: {
                    layer: "web",
                    route: "community_detail_page",
                },
            });
        }
    }

    if (!allowMockFallback()) {
        return {
            community: null,
            source: "error",
        };
    }

    warnDevFallback("community_detail_page", `Using mock community because ${fallbackReason}`);
    return {
        community:
            mockCommunities.find(
                (community) => normalizeCommunitySlug(community.slug) === normalizedSlug
            ) || null,
        source: "mock",
    };
}

export async function loadRelatedPublicCommunities(current: Community, limit = 4) {
    const { data } = await loadPublicCommunities(24);
    return rankRelatedCommunities(current, data, limit);
}
