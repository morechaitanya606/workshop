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

function escapeLikePattern(value: string) {
    return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function alreadyRequestedResponse() {
    return NextResponse.json({
        success: true,
        alreadyRequested: true,
        message: "You have already requested to join this community.",
    });
}

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

        // Stored lower-cased so the (community_id, lower(email)) unique index and this
        // pre-check agree on what "the same person" means.
        const email = parsed.data.email.trim().toLowerCase();

        const { data: existing, error: existingError } = await serviceClient
            .from("community_join_requests")
            .select("id")
            .eq("community_id", community.id)
            // ilike with the LIKE metacharacters escaped == case-insensitive equality.
            .ilike("email", escapeLikePattern(email))
            .limit(1);

        if (existingError) {
            throw existingError;
        }
        if (Array.isArray(existing) && existing.length > 0) {
            return alreadyRequestedResponse();
        }

        const { error } = await serviceClient.from("community_join_requests").insert({
            community_id: community.id,
            full_name: parsed.data.fullName,
            email,
            phone: parsed.data.phone,
            note: parsed.data.note || null,
            status: "pending",
        });

        if (error) {
            // Two simultaneous submissions both pass the pre-check; the unique index lets one
            // win and rejects the other with 23505. That is "already requested", not a failure.
            if (error.code === "23505") {
                return alreadyRequestedResponse();
            }
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
