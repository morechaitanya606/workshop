import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { handleApiError, parseBody } from "@/lib/api-route";
import { assertRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import {
    buildCommunityInsertPayload,
    generateUniqueCommunitySlug,
    mapCommunityRowToCommunity,
} from "@/lib/communities";
import {
    getCommunitiesSetupIncompleteMessage,
    isMissingCommunitiesSchemaError,
} from "@/lib/community-api-errors";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase-server";
import { communityCreateSchema } from "@/lib/validators";

export async function POST(request: NextRequest) {
    const rateLimitResult = await assertRateLimit({
        key: getRateLimitKey(request, "community-create"),
        limit: 8,
        windowMs: 60_000,
        message: "Too many community submissions. Please wait and try again.",
    });
    if (!rateLimitResult.ok) {
        return rateLimitResult.response;
    }

    const parsed = await parseBody(
        request,
        communityCreateSchema,
        "Invalid JSON payload.",
        "Community form validation failed."
    );
    if (!parsed.ok) {
        return parsed.response;
    }

    if (!isSupabaseServiceConfigured) {
        return NextResponse.json(
            { error: getCommunitiesSetupIncompleteMessage() },
            { status: 400 }
        );
    }

    const serviceClient = createSupabaseServiceClient();

    try {
        const slug = await generateUniqueCommunitySlug(serviceClient, parsed.data.title);
        const payload = buildCommunityInsertPayload(parsed.data, slug);
        const { data, error } = await serviceClient
            .from("communities")
            .insert(payload)
            .select("*")
            .single();

        if (error) {
            throw error;
        }

        revalidatePath("/communities");
        revalidatePath(`/communities/${slug}`);

        return NextResponse.json(
            {
                community: mapCommunityRowToCommunity(data),
                message: "Community page created successfully.",
            },
            { status: 201 }
        );
    } catch (error) {
        if (isMissingCommunitiesSchemaError(error)) {
            return NextResponse.json(
                {
                    error: getCommunitiesSetupIncompleteMessage(),
                    ok: false,
                },
                { status: 400 }
            );
        }

        return handleApiError("Failed to create community page.", error);
    }
}
