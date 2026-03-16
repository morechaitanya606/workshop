import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireHostOrAdmin } from "@/lib/api-auth";
import { handleApiError } from "@/lib/api-route";
import { requireSupabaseService } from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
    const auth = await requireHostOrAdmin(request);
    if (!auth.ok) return auth.response;

    const service = requireSupabaseService();
    if (!service.ok) return service.response;

    try {
        // 1. First, make sure they have a host record attached to their user_id
        const { data: host, error: hostError } = await service.client
            .from("hosts")
            .select("id")
            .eq("user_id", auth.user.id)
            .maybeSingle();

        if (hostError) throw hostError;
        if (!host) {
            return NextResponse.json({
                earnings: [],
                payouts: [],
            });
        }

        // 2. Fetch Earnings
        const { data: earnings, error: earningsError } = await service.client
            .from("host_earnings")
            .select(
                "*, booking:bookings(id, status, guests, total, created_at, workshop:workshops(title))"
            )
            .eq("host_id", host.id)
            .order("created_at", { ascending: false });

        if (earningsError) throw earningsError;

        // 3. Fetch Payouts
        const { data: payouts, error: payoutsError } = await service.client
            .from("payouts")
            .select("*")
            .eq("host_id", host.id)
            .order("created_at", { ascending: false });

        if (payoutsError) throw payoutsError;

        return NextResponse.json({
            earnings: earnings || [],
            payouts: payouts || [],
        });
    } catch (error) {
        return handleApiError("Failed to load host ledger", error);
    }
}
