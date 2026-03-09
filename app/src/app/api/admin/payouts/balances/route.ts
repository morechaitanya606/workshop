import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/api-auth";
import { handleApiError } from "@/lib/api-route";
import { requireSupabaseService } from "@/lib/api-helpers";
import { assertRateLimit, getRateLimitKey } from "@/lib/rate-limit";

type HostBalance = {
    hostId: string;
    name: string;
    userId: string | null;
    availableBalance: number;
    availableEarningsCount: number;
};

export async function GET(request: NextRequest) {
    const auth = await requireAdminUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    const rateLimitResult = await assertRateLimit({
        key: getRateLimitKey(request, "admin-payout-balances-read", auth.user.id),
        limit: 120,
        windowMs: 60_000,
        message: "Too many payout dashboard refreshes. Please wait and retry.",
    });
    if (!rateLimitResult.ok) {
        return rateLimitResult.response;
    }

    const service = requireSupabaseService();
    if (!service.ok) {
        return service.response;
    }

    try {
        const { data: hosts, error: hostsError } = await service.client
            .from("hosts")
            .select("id, name, user_id")
            .order("name", { ascending: true });

        if (hostsError) {
            throw hostsError;
        }

        const { data: earnings, error: earningsError } = await service.client
            .from("host_earnings")
            .select("host_id, amount, status")
            .eq("status", "available");

        if (earningsError) {
            throw earningsError;
        }

        const balances: HostBalance[] = (hosts || [])
            .map((host) => {
                const hostEarnings = (earnings || []).filter((row) => row.host_id === host.id);
                const availableBalance = hostEarnings.reduce(
                    (sum, row) => sum + Number(row.amount || 0),
                    0
                );

                return {
                    hostId: host.id,
                    name: host.name,
                    userId: host.user_id,
                    availableBalance,
                    availableEarningsCount: hostEarnings.length,
                };
            })
            .filter((row) => row.availableBalance > 0);

        return NextResponse.json({ balances });
    } catch (error) {
        return handleApiError("Failed to load payout balances.", error);
    }
}
