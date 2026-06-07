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
    workshop_id: Tables<"workshop_feedback">["workshop_id"] | null;
    rating: Tables<"workshop_feedback">["rating"] | null;
};

const ADMIN_DASHBOARD_RESET_AT =
    process.env.ADMIN_DASHBOARD_RESET_AT || "2026-06-07T00:00:00+05:30";

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
            .gte("created_at", ADMIN_DASHBOARD_RESET_AT)
            .order("created_at", { ascending: false })
            .limit(100),
        serviceClient
            .from("workshops")
            .select("id", { count: "exact", head: true })
            .gte("created_at", ADMIN_DASHBOARD_RESET_AT),
        serviceClient
            .from("host_applications")
            .select("*")
            .gte("created_at", ADMIN_DASHBOARD_RESET_AT)
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

    const workshopIds = (workshopRows || []).map((row) => String(row.id));
    const feedbackRollups = new Map<string, { total: number; count: number }>();

    if (workshopIds.length > 0) {
        const { data: workshopRatingsData, error: workshopRatingsError } = await serviceClient
            .from("workshop_feedback")
            .select("workshop_id, rating")
            .in("workshop_id", workshopIds)
            .not("rating", "is", null);

        if (!workshopRatingsError) {
            for (const item of (workshopRatingsData || []) as RatingRow[]) {
                if (!item.workshop_id || typeof item.rating !== "number") {
                    continue;
                }

                const existing = feedbackRollups.get(item.workshop_id) || {
                    total: 0,
                    count: 0,
                };
                existing.total += item.rating;
                existing.count += 1;
                feedbackRollups.set(item.workshop_id, existing);
            }
        }
    }

    const workshops = (workshopRows || []).map((row) => {
        const workshop = mapWorkshopRowToWorkshop(row as Tables<"workshops">);
        const rollup = feedbackRollups.get(workshop.id);

        if (!rollup) {
            return workshop;
        }

        return {
            ...workshop,
            rating: Number((rollup.total / rollup.count).toFixed(1)),
            reviewCount: rollup.count,
        };
    });
    stats.activeWorkshops = count || workshops.length;

    if (workshopIds.length > 0) {
        const { data: bookingsData, error: bookingsError } = await serviceClient
            .from("bookings")
            .select("total, guests")
            .eq("status", "confirmed")
            .in("workshop_id", workshopIds);
        if (bookingsError) {
            throw bookingsError;
        }

        const bookingRows = (bookingsData || []) as BookingStatsRow[];
        for (const booking of bookingRows) {
            stats.revenue += Number(booking.total || 0);
            stats.totalBookedSeats += Number(booking.guests || 0);
        }
    }

    let totalRating = 0;
    let ratedCount = 0;
    for (const rollup of feedbackRollups.values()) {
        totalRating += rollup.total;
        ratedCount += rollup.count;
    }
    stats.avgRating = ratedCount > 0 ? (totalRating / ratedCount).toFixed(1) : "-";

    return { stats, workshops, applications: applicationRows || [] };
}
