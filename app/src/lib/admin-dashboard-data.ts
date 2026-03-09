import "server-only";

import type { Workshop } from "@/lib/data";
import type { DbTable } from "@/lib/database.types";
import { createSupabaseRscClient } from "@/lib/supabase-rsc";
import { mapWorkshopRowToWorkshop } from "@/lib/workshop-utils";

export type AdminDashboardStats = {
    activeWorkshops: number;
    totalBookedSeats: number;
    revenue: number;
    avgRating: string;
};

type AdminDashboardSupabaseClient = NonNullable<ReturnType<typeof createSupabaseRscClient>>;

type BookingStatsRow = {
    total: DbTable<"bookings">["total"] | null;
    guests: DbTable<"bookings">["guests"] | null;
};

type RatingRow = {
    rating: DbTable<"workshop_feedback">["rating"] | null;
};

export async function loadAdminDashboardData(
    supabase: AdminDashboardSupabaseClient
): Promise<{ stats: AdminDashboardStats; workshops: Workshop[] }> {
    const stats: AdminDashboardStats = {
        activeWorkshops: 0,
        totalBookedSeats: 0,
        revenue: 0,
        avgRating: "-",
    };

    const [{ data: workshopRows, error: workshopError }, { count, error: countError }] =
        await Promise.all([
            supabase
                .from("workshops")
                .select("*")
                .order("created_at", { ascending: false })
                .limit(100),
            supabase.from("workshops").select("id", { count: "exact", head: true }),
        ]);

    if (workshopError) {
        throw workshopError;
    }
    if (countError) {
        throw countError;
    }

    const workshops = (workshopRows || []).map((row) =>
        mapWorkshopRowToWorkshop(row as DbTable<"workshops">)
    );
    stats.activeWorkshops = count || workshops.length;

    const { data: bookingsData, error: bookingsError } = await supabase
        .from("bookings")
        .select("total, guests")
        .eq("status", "confirmed");
    if (bookingsError) {
        throw bookingsError;
    }

    const bookingRows = (bookingsData || []) as BookingStatsRow[];
    for (const booking of bookingRows) {
        stats.revenue += Number(booking.total || 0);
        stats.totalBookedSeats += Number(booking.guests || 0);
    }

    const { data: ratingsData, error: ratingsError } = await supabase
        .from("workshop_feedback")
        .select("rating")
        .not("rating", "is", null);

    if (!ratingsError) {
        const ratingRows = (ratingsData || []) as RatingRow[];
        let totalRating = 0;
        let ratedCount = 0;
        for (const item of ratingRows) {
            if (typeof item.rating === "number") {
                totalRating += item.rating;
                ratedCount += 1;
            }
        }
        stats.avgRating = ratedCount > 0 ? (totalRating / ratedCount).toFixed(1) : "-";
    }

    return { stats, workshops };
}
