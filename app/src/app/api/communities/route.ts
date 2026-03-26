import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { handleApiError, parseBody } from "@/lib/api-route";
import { requireSupabaseService } from "@/lib/api-helpers";
import { assertRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import {
    buildCommunityInsertPayload,
    generateUniqueCommunitySlug,
    mapCommunityRowToCommunity,
} from "@/lib/communities";
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

    const service = requireSupabaseService();
    if (!service.ok) return service.response;

    try {
        const slug = await generateUniqueCommunitySlug(service.client, parsed.data.title);
        const payload = buildCommunityInsertPayload(parsed.data, slug);
        const { data, error } = await service.client
            .from("communities")
            .insert(payload)
            .select("*")
            .single();

        if (error) {
            throw error;
        }

        return NextResponse.json(
            {
                community: mapCommunityRowToCommunity(data),
                message: "Community page created successfully.",
            },
            { status: 201 }
        );
    } catch (error) {
        return handleApiError("Failed to create community page.", error);
    }
}
