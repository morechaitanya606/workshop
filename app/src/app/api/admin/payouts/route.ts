import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminUser } from "@/lib/api-auth";
import { requireSupabaseService } from "@/lib/api-helpers";
import { handleApiError, parseBody } from "@/lib/api-route";
import type { Tables } from "@/lib/database.types";
import { assertRateLimit, getRateLimitKey } from "@/lib/rate-limit";

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
        const { data: availableEarnings, error: earningsError } = await service.client
            .from("host_earnings")
            .select("id, amount")
            .eq("host_id", parsed.data.hostId)
            .eq("status", "available");

        if (earningsError) {
            throw earningsError;
        }

        const earnings = availableEarnings || [];
        if (!earnings.length) {
            return NextResponse.json(
                { error: "No available host earnings to pay out." },
                { status: 409 }
            );
        }

        const amount = earnings.reduce((sum, row) => sum + Number(row.amount || 0), 0);
        if (amount <= 0) {
            return NextResponse.json(
                { error: "Available earnings amount must be greater than zero." },
                { status: 409 }
            );
        }

        const { data: payout, error: payoutError } = await service.client
            .from("payouts")
            .insert({
                host_id: parsed.data.hostId,
                amount,
                status: "completed",
                reference_note: parsed.data.referenceNote || "Manual payout",
            })
            .select("*")
            .single();

        if (payoutError) {
            throw payoutError;
        }

        const earningIds = earnings.map((row) => row.id);
        const { error: markPaidError } = await service.client
            .from("host_earnings")
            .update({ status: "paid" })
            .in("id", earningIds);

        if (markPaidError) {
            throw markPaidError;
        }

        return NextResponse.json(
            {
                payout,
                paidEarningsCount: earningIds.length,
                message: "Payout recorded and earnings marked as paid.",
            },
            { status: 201 }
        );
    } catch (error) {
        return handleApiError("Failed to create payout.", error);
    }
}
