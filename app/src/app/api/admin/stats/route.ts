import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase-server";
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

        // Active Workshops Count
        const { count: activeWorkshopsCount, error: wError } = await serviceClient
            .from("workshops")
            .select("*", { count: "exact", head: true });

        if (wError) throw wError;

        // Total Revenue and Bookings
        const { data: bookingsData, error: bError } = await serviceClient
            .from("bookings")
            .select("amount, guests")
            .eq("payment_status", "paid");

        if (bError) throw bError;

        let totalRevenue = 0;
        let totalGuests = 0;

        for (const b of bookingsData || []) {
            totalRevenue += Number(b.amount || 0);
            totalGuests += Number(b.guests || 0);
        }

        // Average Rating
        const { data: ratingsData, error: rError } = await serviceClient
            .from("workshops")
            .select("rating");

        if (rError) throw rError;

        let totalRating = 0;
        let ratedCount = 0;
        for (const r of ratingsData || []) {
            if (typeof r.rating === "number") {
                totalRating += r.rating;
                ratedCount += 1;
            }
        }
        const avgRating = ratedCount > 0 ? (totalRating / ratedCount).toFixed(1) : "–";

        return NextResponse.json({
            stats: {
                activeWorkshops: activeWorkshopsCount || 0,
                totalBookedSeats: totalGuests,
                revenue: totalRevenue,
                avgRating: avgRating,
            }
        });
    } catch (error) {
        return NextResponse.json(
            { error: "Failed to load admin stats.", details: String(error) },
            { status: 500 }
        );
    }
}
