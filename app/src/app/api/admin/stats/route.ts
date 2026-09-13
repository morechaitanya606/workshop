import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-route";
import { requireSupabaseService } from "@/lib/api-helpers";
import { requireAdminUser } from "@/lib/api-auth";
import { enforceRateLimit } from "@/lib/rate-limit";

const ADMIN_DASHBOARD_RESET_AT =
    process.env.ADMIN_DASHBOARD_RESET_AT || "2026-06-07T00:00:00+05:30";

export async function GET(request: NextRequest) {
    const limited = await enforceRateLimit(request, "expensive", "api-admin-stats");
    if (!limited.ok) return limited.response;

    const auth = await requireAdminUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    const service = requireSupabaseService();
    if (!service.ok) return service.response;
    const serviceClient = service.client;

    try {
        // Aggregate in Postgres first. The JS path below pulled every workshop id and every
        // confirmed booking into the lambda: PostgREST caps rows (1000 by default), so
        // revenue silently truncated and under-reported, and once the id list grew the
        // `in(...)` filter pushed the request URL past the 414 limit.
        const { data: aggregate, error: aggregateError } = await serviceClient.rpc(
            "admin_dashboard_stats",
            { p_reset_at: ADMIN_DASHBOARD_RESET_AT }
        );

        const aggregateRow = Array.isArray(aggregate) ? aggregate[0] : aggregate;

        if (!aggregateError && aggregateRow) {
            const row = aggregateRow as {
                active_workshops: number | null;
                total_booked_seats: number | null;
                revenue: number | string | null;
                avg_rating: number | string | null;
            };

            return NextResponse.json({
                stats: {
                    activeWorkshops: Number(row.active_workshops || 0),
                    totalBookedSeats: Number(row.total_booked_seats || 0),
                    revenue: Number(row.revenue || 0),
                    avgRating:
                        row.avg_rating === null || row.avg_rating === undefined
                            ? "-"
                            : Number(row.avg_rating).toFixed(1),
                },
            });
        }

        // Fallback for a database that has not had the lockdown migration applied yet.
        // Matches the existing RPC-with-fallback convention used across booking routes.
        const {
            data: workshopRows,
            count: activeWorkshopsCount,
            error: wError,
        } = await serviceClient
            .from("workshops")
            .select("id", { count: "exact" })
            .gte("created_at", ADMIN_DASHBOARD_RESET_AT);

        if (wError) throw wError;

        const workshopIds = (workshopRows || []).map((row) => String(row.id));

        let totalRevenue = 0;
        let totalGuests = 0;

        if (workshopIds.length > 0) {
            const { data: bookingsData, error: bError } = await serviceClient
                .from("bookings")
                .select("total, guests")
                .eq("status", "confirmed")
                .in("workshop_id", workshopIds);

            if (bError) throw bError;

            for (const booking of bookingsData || []) {
                totalRevenue += Number(booking.total || 0);
                totalGuests += Number(booking.guests || 0);
            }
        }

        // Keep stats route resilient even when feedback migration is not applied yet.
        let avgRating = "-";
        if (workshopIds.length > 0) {
            const { data: ratingsData, error: rError } = await serviceClient
                .from("workshop_feedback")
                .select("rating")
                .in("workshop_id", workshopIds)
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
        return handleApiError("Failed to load admin stats.", error);
    }
}
