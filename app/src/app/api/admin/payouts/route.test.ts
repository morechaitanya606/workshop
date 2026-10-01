import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { requireAdminUser } from "@/lib/api-auth";
import { requireSupabaseService } from "@/lib/api-helpers";
import { assertRateLimit } from "@/lib/rate-limit";

vi.mock("@/lib/api-auth", () => ({
    requireAdminUser: vi.fn(),
}));

vi.mock("@/lib/api-helpers", () => ({
    requireSupabaseService: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
    assertRateLimit: vi.fn(),
    getRateLimitKey: vi.fn(() => "admin-payouts-test"),
}));

vi.mock("@sentry/nextjs", () => ({
    captureException: vi.fn(),
    captureMessage: vi.fn(),
    setTag: vi.fn(),
}));

const HOST_ID = "44444444-4444-4444-8444-444444444444";
const PAYOUT_ID = "55555555-5555-4555-8555-555555555555";

function payoutRequest(body: Record<string, unknown> = { hostId: HOST_ID }) {
    return new NextRequest("http://localhost/api/admin/payouts", {
        method: "POST",
        body: JSON.stringify(body),
    });
}

function payoutsTable(result: { data: unknown; error: unknown }) {
    const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        single: vi.fn().mockResolvedValue(result),
    };
    return builder;
}

describe("POST /api/admin/payouts", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(requireAdminUser).mockResolvedValue({
            ok: true,
            user: { id: "admin-1" } as never,
            accessToken: "token",
        } as never);
        vi.mocked(assertRateLimit).mockResolvedValue({ ok: true } as never);
    });

    it("returns the auth response for a non-admin", async () => {
        const forbidden = NextResponse.json({ error: "Forbidden" }, { status: 403 });
        vi.mocked(requireAdminUser).mockResolvedValue({ ok: false, response: forbidden } as never);

        const response = await POST(payoutRequest());

        expect(response).toBe(forbidden);
        expect(requireSupabaseService).not.toHaveBeenCalled();
    });

    /**
     * The select -> insert -> update sequence let two concurrent requests both read the same
     * 'available' rows and each insert a payout. The whole operation is one RPC now, so the
     * route must not read or write host_earnings / payouts rows itself.
     */
    it("creates the payout through the single transactional RPC", async () => {
        const payoutRow = {
            id: PAYOUT_ID,
            host_id: HOST_ID,
            amount: 2700,
            status: "completed",
        };
        const payouts = payoutsTable({ data: payoutRow, error: null });
        const serviceClient = {
            rpc: vi.fn().mockResolvedValue({
                data: [{ payout_id: PAYOUT_ID, amount: 2700, earnings_count: 3 }],
                error: null,
            }),
            from: vi.fn((table: string) => {
                if (table === "payouts") return payouts;
                throw new Error(`Unexpected table ${table}`);
            }),
        };
        vi.mocked(requireSupabaseService).mockReturnValue({
            ok: true,
            client: serviceClient as never,
        });

        const response = await POST(
            payoutRequest({ hostId: HOST_ID, referenceNote: "UPI ref 42" })
        );
        const body = await response.json();

        expect(response.status).toBe(201);
        expect(serviceClient.rpc).toHaveBeenCalledTimes(1);
        expect(serviceClient.rpc).toHaveBeenCalledWith("create_host_payout", {
            p_host_id: HOST_ID,
            p_note: "UPI ref 42",
            p_admin: "admin-1",
        });
        expect(serviceClient.from).not.toHaveBeenCalledWith("host_earnings");
        expect(body.payout).toEqual(payoutRow);
        expect(body.paidEarningsCount).toBe(3);
    });

    it("answers 409 without side effects when nothing is available to pay out", async () => {
        const serviceClient = {
            rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
            from: vi.fn(),
        };
        vi.mocked(requireSupabaseService).mockReturnValue({
            ok: true,
            client: serviceClient as never,
        });

        const response = await POST(payoutRequest());
        const body = await response.json();

        expect(response.status).toBe(409);
        expect(body.error).toMatch(/no available host earnings/i);
        expect(serviceClient.from).not.toHaveBeenCalled();
    });

    it("defaults the reference note when none is given", async () => {
        const serviceClient = {
            rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
            from: vi.fn(),
        };
        vi.mocked(requireSupabaseService).mockReturnValue({
            ok: true,
            client: serviceClient as never,
        });

        await POST(payoutRequest());

        expect(serviceClient.rpc).toHaveBeenCalledWith(
            "create_host_payout",
            expect.objectContaining({ p_note: "Manual payout" })
        );
    });

    it("surfaces an RPC failure as a server error instead of a 201", async () => {
        const serviceClient = {
            rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "deadlock detected" } }),
            from: vi.fn(),
        };
        vi.mocked(requireSupabaseService).mockReturnValue({
            ok: true,
            client: serviceClient as never,
        });

        const response = await POST(payoutRequest());

        expect(response.status).toBeGreaterThanOrEqual(500);
        expect(serviceClient.from).not.toHaveBeenCalled();
    });

    it("rejects a malformed host id before touching the database", async () => {
        const response = await POST(payoutRequest({ hostId: "not-a-uuid" }));

        expect(response.status).toBe(400);
        expect(requireSupabaseService).not.toHaveBeenCalled();
    });
});
