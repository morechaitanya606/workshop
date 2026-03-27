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
import {
    createLocalCommunity,
    generateUniqueLocalCommunitySlug,
} from "@/lib/community-local-store";
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

    const localSlug = await generateUniqueLocalCommunitySlug(parsed.data.title);

    const revalidateCommunityPages = (slug: string) => {
        revalidatePath("/communities");
        revalidatePath(`/communities/${slug}`);
    };

    if (!isSupabaseServiceConfigured) {
        const community = await createLocalCommunity(parsed.data, localSlug);
        revalidateCommunityPages(community.slug);

        return NextResponse.json(
            {
                community,
                message: "Community page created successfully.",
            },
            { status: 201 }
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

        revalidateCommunityPages(slug);

        return NextResponse.json(
            {
                community: mapCommunityRowToCommunity(data),
                message: "Community page created successfully.",
            },
            { status: 201 }
        );
    } catch (error) {
        if (isMissingCommunitiesSchemaError(error)) {
            const community = await createLocalCommunity(parsed.data, localSlug);
            revalidateCommunityPages(community.slug);

            return NextResponse.json(
                {
                    community,
                    message: getCommunitiesSetupIncompleteMessage(),
                },
                { status: 201 }
            );
        }

        return handleApiError("Failed to create community page.", error);
    }
}
