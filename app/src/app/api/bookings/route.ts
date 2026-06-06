import type { NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { requireSupabaseService } from "@/lib/api-helpers";
import { handleApiError } from "@/lib/api-route";

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
            .order("created_at", { ascending: false });

        if (error) {
            Sentry.captureException(error, {
                tags: {
                    layer: "api",
                    route: "/api/bookings",
                },
            });
            return handleApiError("Failed to load bookings.", error);
        }

        return NextResponse.json({
            data: data || [],
            source: "supabase",
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
