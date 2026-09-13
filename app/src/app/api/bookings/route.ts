import type { NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { requireSupabaseService } from "@/lib/api-helpers";
import { handleApiError } from "@/lib/api-route";
import { enforceRateLimit } from "@/lib/rate-limit";

/**
 * Booking history is append-only and never pruned, so an unbounded select grows with the
 * account forever -- a regular who has attended two hundred workshops pays for all of them,
 * with their join rows, on every dashboard load. Page it.
 */
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

function parsePagination(request: NextRequest) {
    const params = request.nextUrl.searchParams;

    const rawLimit = Number.parseInt(params.get("limit") || "", 10);
    const limit =
        Number.isFinite(rawLimit) && rawLimit > 0
            ? Math.min(rawLimit, MAX_PAGE_SIZE)
            : DEFAULT_PAGE_SIZE;

    const rawOffset = Number.parseInt(params.get("offset") || "", 10);
    const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? rawOffset : 0;

    return { limit, offset };
}

export async function GET(request: NextRequest) {
    const limited = await enforceRateLimit(request, "publicRead", "api-bookings-list");
    if (!limited.ok) return limited.response;

    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    const service = requireSupabaseService();
    if (!service.ok) {
        return service.response;
    }

    const { limit, offset } = parsePagination(request);

    try {
        const serviceClient = service.client;
        const { data, error } = await serviceClient
            .from("bookings")
            .select(
                `
                id,
                guests,
                total,
                status,
                created_at,
                first_name,
                last_name,
                workshop:workshops (
                    id,
                    title,
                    date,
                    time,
                    duration,
                    location,
                    city,
                    cover_image,
                    host_name
                )
            `
            )
            .eq("user_id", auth.user.id)
            .order("created_at", { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) {
            Sentry.captureException(error, {
                tags: {
                    layer: "api",
                    route: "/api/bookings",
                },
            });
            return handleApiError("Failed to load bookings.", error);
        }

        const rows = data || [];

        return NextResponse.json({
            data: rows,
            source: "supabase",
            pagination: {
                limit,
                offset,
                // The client asked for `limit` rows and got all of them, so there may be more.
                hasMore: rows.length === limit,
            },
        });
    } catch (error) {
        Sentry.captureException(error, {
            tags: {
                layer: "api",
                route: "/api/bookings",
            },
        });
        return handleApiError("Failed to load bookings.", error);
    }
}
