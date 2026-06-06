import "server-only";

import type { Workshop } from "@/lib/data";
import type { Tables } from "@/lib/database.types";
import { createSupabaseRscClient } from "@/lib/supabase-rsc";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { mapWorkshopRowToWorkshop } from "@/lib/workshop-utils";

export type AdminDashboardStats = {
    activeWorkshops: number;
    totalBookedSeats: number;
    revenue: number;
    avgRating: string;
};

export type AdminHostApplication = Tables<"host_applications">;

type AdminDashboardSupabaseClient = NonNullable<
    Awaited<ReturnType<typeof createSupabaseRscClient>>
>;

type BookingStatsRow = {
    total: Tables<"bookings">["total"] | null;
    guests: Tables<"bookings">["guests"] | null;
};

type RatingRow = {
    rating: Tables<"workshop_feedback">["rating"] | null;
};

export async function loadAdminDashboardData(_supabase: AdminDashboardSupabaseClient): Promise<{
    stats: AdminDashboardStats;
    workshops: Workshop[];
    applications: AdminHostApplication[];
}> {
    const stats: AdminDashboardStats = {
        activeWorkshops: 0,
        totalBookedSeats: 0,
        revenue: 0,
        avgRating: "-",
    };

    const serviceClient = createSupabaseServiceClient();

    const [
        { data: workshopRows, error: workshopError },
        { count, error: countError },
        { data: applicationRows, error: applicationError },
    ] = await Promise.all([
        serviceClient
            .from("workshops")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(100),
        serviceClient.from("workshops").select("id", { count: "exact", head: true }),
        serviceClient
            .from("host_applications")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(200),
    ]);

    if (workshopError) {
        throw workshopError;
    }
    if (countError) {
        throw countError;
    }
    if (applicationError) {
        throw applicationError;
    }

    const workshops = (workshopRows || []).map((row) =>
        mapWorkshopRowToWorkshop(row as Tables<"workshops">)
    );
    stats.activeWorkshops = count || workshops.length;

    const { data: bookingsData, error: bookingsError } = await serviceClient
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

    const { data: ratingsData, error: ratingsError } = await serviceClient
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

    return { stats, workshops, applications: applicationRows || [] };
}
