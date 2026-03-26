import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { handleApiError, parseBody } from "@/lib/api-route";
import { requireSupabaseService } from "@/lib/api-helpers";
import { jsonError } from "@/lib/api-auth";
import { getMockCommunityBySlug } from "@/lib/communities";
import { assertRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { communityJoinSchema } from "@/lib/validators";

type Params = {
    params: { slug: string };
};

export async function POST(request: NextRequest, { params }: Params) {
    const rateLimitResult = await assertRateLimit({
        key: getRateLimitKey(request, `community-join:${params.slug}`),
        limit: 12,
        windowMs: 60_000,
        message: "Too many join attempts. Please wait and try again.",
    });
    if (!rateLimitResult.ok) {
        return rateLimitResult.response;
    }

    const parsed = await parseBody(
        request,
        communityJoinSchema,
        "Invalid JSON payload.",
        "Join form validation failed."
    );
    if (!parsed.ok) {
        return parsed.response;
    }

    const mockCommunity = getMockCommunityBySlug(params.slug);
    if (mockCommunity) {
        return NextResponse.json({
            success: true,
            message: `Thanks for your interest in ${mockCommunity.title}. This sample community page is available for preview right now, and live host follow-up will be enabled once the community is published.`,
        });
    }

    const service = requireSupabaseService();
    if (!service.ok) return service.response;

    try {
        const { data: community, error: communityError } = await service.client
            .from("communities")
            .select("id")
            .eq("slug", params.slug)
            .maybeSingle();

        if (communityError) {
            throw communityError;
        }
        if (!community) {
            return jsonError("Community not found.", 404);
        }

        const { error } = await service.client.from("community_join_requests").insert({
            community_id: community.id,
            full_name: parsed.data.fullName,
            email: parsed.data.email,
            phone: parsed.data.phone,
            note: parsed.data.note || null,
            status: "pending",
        });

        if (error) {
            throw error;
        }

        return NextResponse.json({
            success: true,
            message: "Your join request has been submitted.",
        });
    } catch (error) {
        return handleApiError("Failed to submit join request.", error);
    }
}
