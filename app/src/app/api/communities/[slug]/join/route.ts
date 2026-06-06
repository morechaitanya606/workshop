import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { handleApiError, parseBody } from "@/lib/api-route";
import { jsonError } from "@/lib/api-auth";
import {
    getCommunitiesSetupIncompleteMessage,
    isMissingCommunitiesSchemaError,
} from "@/lib/community-api-errors";
import { assertRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase-server";
import { communityJoinSchema } from "@/lib/validators";

type Params = {
    params: Promise<{ slug: string }>;
};

export async function POST(request: NextRequest, { params }: Params) {
    const { slug } = await params;
    const rateLimitResult = await assertRateLimit({
        key: getRateLimitKey(request, `community-join:${slug}`),
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

    if (!isSupabaseServiceConfigured) {
        return jsonError("Backend database connection is not configured.", 503);
    }

    const serviceClient = createSupabaseServiceClient();

    try {
        const { data: community, error: communityError } = await serviceClient
            .from("communities")
            .select("id")
            .eq("slug", slug)
            .maybeSingle();

        if (communityError) {
            throw communityError;
        }
        if (!community) {
            return jsonError("Community not found.", 404);
        }

        const { error } = await serviceClient.from("community_join_requests").insert({
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
        if (isMissingCommunitiesSchemaError(error)) {
            return NextResponse.json(
                {
                    error: getCommunitiesSetupIncompleteMessage(),
                },
                { status: 503 }
            );
        }

        return handleApiError("Failed to submit join request.", error);
    }
}
