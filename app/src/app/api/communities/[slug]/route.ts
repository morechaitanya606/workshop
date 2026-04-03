import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-route";
import { getCommunityBySlug, getMockCommunityBySlug } from "@/lib/communities";
import { getLocalCommunityBySlug } from "@/lib/community-local-store";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase-server";

type Params = {
    params: { slug: string };
};

export async function GET(request: NextRequest, { params }: Params) {
    const slug = params.slug;

    const mockCommunity = getMockCommunityBySlug(slug);
    if (mockCommunity) {
        return NextResponse.json({ community: mockCommunity });
    }

    const localCommunity = await getLocalCommunityBySlug(slug);
    if (localCommunity) {
        return NextResponse.json({ community: localCommunity });
    }

    if (!isSupabaseServiceConfigured) {
        return NextResponse.json(
            { error: "Community not found." },
            { status: 404 }
        );
    }

    const serviceClient = createSupabaseServiceClient();

    try {
        const community = await getCommunityBySlug(serviceClient, slug);
        if (!community) {
            return NextResponse.json(
                { error: "Community not found." },
                { status: 404 }
            );
        }

        return NextResponse.json({ community });
    } catch (error) {
        return handleApiError("Failed to fetch community.", error);
    }
}
