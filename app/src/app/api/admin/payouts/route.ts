import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminUser } from "@/lib/api-auth";
import { requireSupabaseService } from "@/lib/api-helpers";
import { handleApiError, parseBody } from "@/lib/api-route";
import type { Tables } from "@/lib/database.types";
import { assertRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { callUntypedRpc } from "@/lib/payments-rpc";

type PayoutRpcRow = {
    payout_id: string | null;
    amount: number | string | null;
    earnings_count: number | null;
};

const createPayoutSchema = z.object({
    hostId: z.string().uuid(),
    referenceNote: z.string().trim().max(500).optional(),
});

type PayoutRow = Pick<
    Tables<"payouts">,
    "id" | "host_id" | "amount" | "status" | "reference_note" | "created_at"
>;
type HostRow = Pick<Tables<"hosts">, "id" | "name" | "user_id">;

export async function GET(request: NextRequest) {
    const auth = await requireAdminUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    const rateLimitResult = await assertRateLimit({
        key: getRateLimitKey(request, "admin-payouts-read", auth.user.id),
        limit: 120,
        windowMs: 60_000,
        message: "Too many payout history refreshes. Please wait and retry.",
    });
    if (!rateLimitResult.ok) {
        return rateLimitResult.response;
    }

    const service = requireSupabaseService();
    if (!service.ok) {
        return service.response;
    }

    try {
        const { data, error } = await service.client
            .from("payouts")
            .select("id, host_id, amount, status, reference_note, created_at")
            .order("created_at", { ascending: false })
            .limit(200);

        if (error) {
            throw error;
        }

        const payoutRows = (data || []) as unknown as PayoutRow[];
        const hostIds = Array.from(
            new Set(
                payoutRows
                    .map((row) => row.host_id)
                    .filter((hostId): hostId is string => Boolean(hostId))
            )
        );

        const hostMap = new Map<string, HostRow>();
        if (hostIds.length > 0) {
            const { data: hosts, error: hostsError } = await service.client
                .from("hosts")
                .select("id, name, user_id")
                .in("id", hostIds);

            if (hostsError) {
                throw hostsError;
            }

            for (const host of (hosts || []) as unknown as HostRow[]) {
                hostMap.set(host.id, host);
            }
        }

        const payouts = payoutRows.map((row) => ({
            id: row.id,
            host_id: row.host_id,
            amount: Number(row.amount || 0),
            status: row.status,
            reference_note: row.reference_note,
            created_at: row.created_at,
            host: hostMap.get(row.host_id) || null,
        }));

        return NextResponse.json({ payouts });
    } catch (error) {
        return handleApiError("Failed to load payouts.", error);
    }
}

export async function POST(request: NextRequest) {
    const auth = await requireAdminUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    const rateLimitResult = await assertRateLimit({
        key: getRateLimitKey(request, "admin-payouts-write", auth.user.id),
        limit: 30,
        windowMs: 60_000,
        message: "Too many payout actions. Please wait and retry.",
    });
    if (!rateLimitResult.ok) {
        return rateLimitResult.response;
    }

    const parsed = await parseBody(
        request,
        createPayoutSchema,
        "Invalid JSON payload.",
        "Invalid payout request."
    );
    if (!parsed.ok) {
        return parsed.response;
    }

    const service = requireSupabaseService();
    if (!service.ok) {
        return service.response;
    }

    try {
        // One transaction in the database (20261001110100_atomic_host_payouts): lock the
        // host's available earnings, insert the payout from that locked sum and mark exactly
        // those rows paid. The old select -> insert -> update sequence let two concurrent
        // requests both read the same 'available' rows and pay the host twice.
        const { data: rows, error: payoutError } = await callUntypedRpc<PayoutRpcRow[]>(
            service.client,
            "create_host_payout",
            {
                p_host_id: parsed.data.hostId,
                p_note: parsed.data.referenceNote || "Manual payout",
                p_admin: auth.user.id,
            }
        );

        if (payoutError) {
            throw payoutError;
        }

        const created = Array.isArray(rows) ? rows[0] : null;
        if (!created?.payout_id) {
            // Nothing was available -- or a concurrent request just paid it all out. Either
            // way no payout row was written and no earning was touched.
            return NextResponse.json(
                { error: "No available host earnings to pay out." },
                { status: 409 }
            );
        }

        const { data: payout, error: payoutReadError } = await service.client
            .from("payouts")
            .select("*")
            .eq("id", created.payout_id)
            .single();

        if (payoutReadError) {
            throw payoutReadError;
        }

        return NextResponse.json(
            {
                payout,
                paidEarningsCount: Number(created.earnings_count || 0),
                message: "Payout recorded and earnings marked as paid.",
            },
            { status: 201 }
        );
    } catch (error) {
        return handleApiError("Failed to create payout.", error);
    }
}
