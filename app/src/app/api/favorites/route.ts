import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, parseBody } from "@/lib/api-route";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { requireSupabaseService } from "@/lib/api-helpers";
import { assertRateLimit, getRateLimitKey } from "@/lib/rate-limit";

const favoritesBodySchema = z.object({
    workshopId: z.string().trim().min(1).max(120),
});

const memoryFavorites = new Map<string, Set<string>>();

function getMemoryFavorites(userId: string) {
    if (!memoryFavorites.has(userId)) {
        memoryFavorites.set(userId, new Set<string>());
    }
    return memoryFavorites.get(userId)!;
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
    if (service.ok) {
        try {
            const serviceClient = service.client;
            const { data, error } = await serviceClient
                .from("user_favorites" as any)
                .select("workshop_id")
                .eq("user_id", auth.user.id);

            if (!error && Array.isArray(data)) {
                return NextResponse.json({
                    favorites: data
                        .map((item: any) => String(item.workshop_id || ""))
                        .filter(Boolean),
                    source: "supabase",
                });
            }
        } catch {
            // fallback to in-memory below
        }
    }

    return NextResponse.json({
        favorites: Array.from(getMemoryFavorites(auth.user.id)),
        source: "memory",
    });
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
    if (service.ok) {
        try {
            const serviceClient = service.client;
            const { error } = await serviceClient.from("user_favorites" as any).upsert(
                {
                    user_id: auth.user.id,
                    workshop_id: parsed.data.workshopId,
                },
                { onConflict: "user_id,workshop_id" }
            );

            if (!error) {
                const { data } = await serviceClient
                    .from("user_favorites" as any)
                    .select("workshop_id")
                    .eq("user_id", auth.user.id);
                return NextResponse.json({
                    favorites: (data || [])
                        .map((item: any) => String(item.workshop_id || ""))
                        .filter(Boolean),
                    source: "supabase",
                });
            }
        } catch {
            // fallback to in-memory below
        }
    }

    const userFavorites = getMemoryFavorites(auth.user.id);
    userFavorites.add(parsed.data.workshopId);
    return NextResponse.json({
        favorites: Array.from(userFavorites),
        source: "memory",
    });
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
    if (service.ok) {
        try {
            const serviceClient = service.client;
            const { error } = await serviceClient
                .from("user_favorites" as any)
                .delete()
                .eq("user_id", auth.user.id)
                .eq("workshop_id", parsed.data.workshopId);

            if (!error) {
                const { data } = await serviceClient
                    .from("user_favorites" as any)
                    .select("workshop_id")
                    .eq("user_id", auth.user.id);

                return NextResponse.json({
                    favorites: (data || [])
                        .map((item: any) => String(item.workshop_id || ""))
                        .filter(Boolean),
                    source: "supabase",
                });
            }
        } catch (error) {
            return handleApiError("Failed to remove favorite.", error);
        }
    }

    const userFavorites = getMemoryFavorites(auth.user.id);
    userFavorites.delete(parsed.data.workshopId);
    return NextResponse.json({
        favorites: Array.from(userFavorites),
        source: "memory",
    });
}
