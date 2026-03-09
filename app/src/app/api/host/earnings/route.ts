import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireHostOrAdmin } from "@/lib/api-auth";
import { handleApiError } from "@/lib/api-route";
import { requireSupabaseService } from "@/lib/api-helpers";
import { assertRateLimit, getRateLimitKey } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
    const auth = await requireHostOrAdmin(request);
    if (!auth.ok) {
        return auth.response;
    }

    const rateLimitResult = await assertRateLimit({
        key: getRateLimitKey(request, "host-earnings-read", auth.user.id),
        limit: 120,
        windowMs: 60_000,
        message: "Too many earnings refreshes. Please wait and retry.",
    });
    if (!rateLimitResult.ok) {
        return rateLimitResult.response;
    }

    const service = requireSupabaseService();
    if (!service.ok) {
        return service.response;
    }

    try {
        const { data: host, error: hostError } = await service.client
            .from("hosts")
            .select("id, name, user_id")
            .eq("user_id", auth.user.id)
            .maybeSingle();

        if (hostError) {
            throw hostError;
        }
        if (!host) {
            return NextResponse.json(
                { error: "No host profile found for this account." },
                { status: 404 }
            );
        }

        const { data: earningsRows, error: earningsError } = await service.client
            .from("host_earnings")
            .select("id, booking_id, amount, fee_deducted, status, created_at")
            .eq("host_id", host.id)
            .order("created_at", { ascending: false });

        if (earningsError) {
            throw earningsError;
        }

        const { data: payoutRows, error: payoutsError } = await service.client
            .from("payouts")
            .select("id, amount, status, reference_note, created_at")
            .eq("host_id", host.id)
            .order("created_at", { ascending: false });

        if (payoutsError) {
            throw payoutsError;
        }

        const earnings = earningsRows || [];
        const totals = earnings.reduce(
            (acc, row) => {
                const amount = Number(row.amount || 0);
                if (row.status === "paid") {
                    acc.paid += amount;
                } else if (row.status === "available") {
                    acc.available += amount;
                } else {
                    acc.pending += amount;
                }
                return acc;
            },
            { pending: 0, available: 0, paid: 0 }
        );

        return NextResponse.json({
            host,
            summary: totals,
            earnings,
            payouts: payoutRows || [],
        });
    } catch (error) {
        return handleApiError("Failed to load host earnings.", error);
    }
}
