import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, parseBody } from "@/lib/api-route";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { requireSupabaseService } from "@/lib/api-helpers";
import { assertRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import type { SupabaseServerClient } from "@/lib/supabase-server";

const favoritesBodySchema = z.object({
    workshopId: z.string().trim().min(1).max(120),
});

/**
 * There is no in-memory fallback here any more.
 *
 * `public.user_favorites` has existed since 20260308_platform_hardening, so the Map this
 * route used to fall back to was never a compatibility shim — it was a per-lambda store on a
 * serverless platform. A write landed on one instance and the next read hit another, so
 * wishlists appeared and disappeared at random, and because every failure fell through to it
 * silently, a genuinely broken database read back as a simply-empty wishlist. Surfacing the
 * error is the only honest answer.
 */
async function loadFavorites(serviceClient: SupabaseServerClient, userId: string) {
    const { data, error } = await serviceClient
        .from("user_favorites" as any)
        .select("workshop_id")
        .eq("user_id", userId);

    if (error) throw error;

    return (Array.isArray(data) ? data : [])
        .map((item: any) => String(item.workshop_id || ""))
        .filter(Boolean);
}

async function assertFavoritesWriteLimit(request: NextRequest, userId: string) {
    return await assertRateLimit({
        key: getRateLimitKey(request, "favorites-write", userId),
        limit: 40,
        windowMs: 60_000,
        message: "Too many wishlist updates. Please wait and try again.",
    });
}

export async function GET(request: NextRequest) {
    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    const service = requireSupabaseService();
    if (!service.ok) {
        return service.response;
    }

    try {
        return NextResponse.json({
            favorites: await loadFavorites(service.client, auth.user.id),
            source: "supabase",
        });
    } catch (error) {
        return handleApiError("Failed to load your wishlist.", error);
    }
}

export async function POST(request: NextRequest) {
    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    const rateLimitResult = await assertFavoritesWriteLimit(request, auth.user.id);
    if (!rateLimitResult.ok) {
        return rateLimitResult.response;
    }

    const parsed = await parseBody(
        request,
        favoritesBodySchema,
        "Invalid JSON payload.",
        "Invalid favorite payload."
    );
    if (!parsed.ok) {
        return parsed.response;
    }

    const service = requireSupabaseService();
    if (!service.ok) {
        return service.response;
    }

    try {
        const { error } = await service.client.from("user_favorites" as any).upsert(
            {
                user_id: auth.user.id,
                workshop_id: parsed.data.workshopId,
            },
            { onConflict: "user_id,workshop_id" }
        );

        if (error) throw error;

        return NextResponse.json({
            favorites: await loadFavorites(service.client, auth.user.id),
            source: "supabase",
        });
    } catch (error) {
        return handleApiError("Failed to save favorite.", error);
    }
}

export async function DELETE(request: NextRequest) {
    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    const rateLimitResult = await assertFavoritesWriteLimit(request, auth.user.id);
    if (!rateLimitResult.ok) {
        return rateLimitResult.response;
    }

    const parsed = await parseBody(
        request,
        favoritesBodySchema,
        "Invalid JSON payload.",
        "Invalid favorite payload."
    );
    if (!parsed.ok) {
        return parsed.response;
    }

    const service = requireSupabaseService();
    if (!service.ok) {
        return service.response;
    }

    try {
        const { error } = await service.client
            .from("user_favorites" as any)
            .delete()
            .eq("user_id", auth.user.id)
            .eq("workshop_id", parsed.data.workshopId);

        if (error) throw error;

        return NextResponse.json({
            favorites: await loadFavorites(service.client, auth.user.id),
            source: "supabase",
        });
    } catch (error) {
        return handleApiError("Failed to remove favorite.", error);
    }
}
