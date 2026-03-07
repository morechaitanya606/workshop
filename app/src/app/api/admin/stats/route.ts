import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
    createSupabaseServiceClient,
    isSupabaseServiceConfigured,
} from "@/lib/supabase-server";
import { requireAdminUser } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
    const auth = await requireAdminUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    if (!isSupabaseServiceConfigured) {
        return NextResponse.json(
            { error: "Supabase service role is not configured." },
            { status: 500 }
        );
    }

    try {
        const serviceClient = createSupabaseServiceClient();

        const { count: activeWorkshopsCount, error: wError } = await serviceClient
            .from("workshops")
            .select("*", { count: "exact", head: true });

        if (wError) throw wError;

        const { data: bookingsData, error: bError } = await serviceClient
            .from("bookings")
            .select("total, guests")
            .eq("status", "confirmed");

        if (bError) throw bError;

        let totalRevenue = 0;
        let totalGuests = 0;

        for (const booking of bookingsData || []) {
            totalRevenue += Number(booking.total || 0);
            totalGuests += Number(booking.guests || 0);
        }

        // Keep stats route resilient even when feedback migration is not applied yet.
        let avgRating = "-";
        const { data: ratingsData, error: rError } = await serviceClient
            .from("workshop_feedback")
            .select("rating")
            .not("rating", "is", null);

        if (!rError) {
            let totalRating = 0;
            let ratedCount = 0;

            for (const ratingRow of ratingsData || []) {
                if (typeof ratingRow.rating === "number") {
                    totalRating += ratingRow.rating;
                    ratedCount += 1;
                }
            }

            avgRating = ratedCount > 0 ? (totalRating / ratedCount).toFixed(1) : "-";
        }

        return NextResponse.json({
            stats: {
                activeWorkshops: activeWorkshopsCount || 0,
                totalBookedSeats: totalGuests,
                revenue: totalRevenue,
                avgRating,
            },
        });
    } catch (error) {
        return NextResponse.json(
            { error: "Failed to load admin stats.", details: String(error) },
            { status: 500 }
        );
    }
}
