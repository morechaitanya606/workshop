import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { requireSupabaseService } from "@/lib/api-helpers";
import { handleApiError } from "@/lib/api-route";
import { mockWorkshops } from "@/lib/data";

export async function GET(request: NextRequest) {
    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) {
        return auth.response;
    }
    const allowMockFallback = process.env.NODE_ENV !== "production";

    const service = requireSupabaseService();
    if (service.ok) {
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

            if (!error) {
                return NextResponse.json({
                    data: data || [],
                    source: "supabase",
                });
            }
        } catch (error) {
            if (!allowMockFallback) {
                return handleApiError("Failed to load bookings.", error);
            }
            // Falls back below in non-production.
        }
    } else if (!allowMockFallback) {
        return service.response;
    }

    if (!allowMockFallback) {
        return NextResponse.json({ data: [], source: "supabase" });
    }

    // Fallback for local development before DB setup.
    const fallback = mockWorkshops.slice(0, 2).map((workshop, index) => ({
        id: `mock-booking-${index + 1}`,
        guests: 2,
        total: workshop.price * 2 + 99,
        status: "confirmed",
        created_at: new Date().toISOString(),
        first_name: auth.user.user_metadata?.full_name?.split(" ")[0] || "Guest",
        last_name: auth.user.user_metadata?.full_name?.split(" ").slice(1).join(" ") || "",
        workshop: {
            id: workshop.id,
            title: workshop.title,
            date: workshop.date,
            time: workshop.time,
            duration: workshop.duration,
            location: workshop.location,
            city: workshop.city,
            cover_image: workshop.coverImage,
            host_name: workshop.hostName,
        },
    }));

    return NextResponse.json({
        data: fallback,
        source: "mock",
    });
}
