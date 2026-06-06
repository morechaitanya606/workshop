import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "./route";
import { requireHostOrAdmin } from "@/lib/api-auth";
import { requireSupabaseService } from "@/lib/api-helpers";

vi.mock("@/lib/api-auth", () => ({
    requireHostOrAdmin: vi.fn(),
    jsonError: vi.fn((message: string, status = 400, details?: unknown) =>
        NextResponse.json({ error: message, details: details ?? null }, { status })
    ),
}));

vi.mock("@/lib/api-helpers", () => ({
    requireSupabaseService: vi.fn(),
}));

describe("PATCH /api/support/[id]", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("persists status updates for authorized support users", async () => {
        const ticketLookup = {
            eq: vi.fn(),
            maybeSingle: vi.fn().mockResolvedValue({
                data: { id: "ticket-1", workshop_id: "workshop-1" },
                error: null,
            }),
        };
        ticketLookup.eq.mockImplementation(() => ticketLookup);

        const ticketUpdate = {
            eq: vi.fn(),
            select: vi.fn(),
            single: vi.fn().mockResolvedValue({
                data: {
                    id: "ticket-1",
                    status: "resolved",
                    updated_at: "2026-06-06T10:00:00.000Z",
                },
                error: null,
            }),
        };
        ticketUpdate.eq.mockImplementation(() => ticketUpdate);
        ticketUpdate.select.mockImplementation(() => ticketUpdate);

        const supportTicketsTable = {
            select: vi.fn(() => ticketLookup),
            update: vi.fn(() => ticketUpdate),
        };
        const serviceClient = {
            from: vi.fn(() => supportTicketsTable),
        };

        vi.mocked(requireHostOrAdmin).mockResolvedValue({
            ok: true,
            role: "admin",
            user: { id: "admin-1" } as any,
            accessToken: "token",
        });
        vi.mocked(requireSupabaseService).mockReturnValue({
            ok: true,
            client: serviceClient as any,
        });

        const response = await PATCH(
            new NextRequest("http://localhost/api/support/ticket-1", {
                method: "PATCH",
                body: JSON.stringify({ status: "resolved" }),
            }),
            { params: Promise.resolve({ id: "ticket-1" }) }
        );
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(supportTicketsTable.update).toHaveBeenCalledWith({ status: "resolved" });
        expect(body.ticket).toEqual({
            id: "ticket-1",
            status: "resolved",
            updated_at: "2026-06-06T10:00:00.000Z",
        });
    });

    it("rejects host status updates for tickets outside their workshops", async () => {
        const ticketLookup = {
            eq: vi.fn(),
            maybeSingle: vi.fn().mockResolvedValue({
                data: { id: "ticket-1", workshop_id: "workshop-1" },
                error: null,
            }),
        };
        ticketLookup.eq.mockImplementation(() => ticketLookup);

        const directWorkshopLookup = {
            eq: vi.fn(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
        directWorkshopLookup.eq.mockImplementation(() => directWorkshopLookup);

        const hostLookup = {
            eq: vi.fn(),
            then: undefined,
        } as {
            eq: ReturnType<typeof vi.fn>;
            then?: undefined;
        };
        hostLookup.eq.mockImplementation(() =>
            Promise.resolve({
                data: [{ id: "host-1" }],
                error: null,
            })
        );

        const linkedWorkshopLookup = {
            eq: vi.fn(),
            in: vi.fn(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
        linkedWorkshopLookup.eq.mockImplementation(() => linkedWorkshopLookup);
        linkedWorkshopLookup.in.mockImplementation(() => linkedWorkshopLookup);

        const supportTicketsTable = {
            select: vi.fn(() => ticketLookup),
            update: vi.fn(),
        };
        const workshopsTable = {
            select: vi
                .fn()
                .mockImplementationOnce(() => directWorkshopLookup)
                .mockImplementationOnce(() => linkedWorkshopLookup),
        };
        const hostsTable = {
            select: vi.fn(() => hostLookup),
        };
        const serviceClient = {
            from: vi.fn((table: string) => {
                if (table === "support_tickets") return supportTicketsTable;
                if (table === "workshops") return workshopsTable;
                if (table === "hosts") return hostsTable;
                throw new Error(`Unexpected table ${table}`);
            }),
        };

        vi.mocked(requireHostOrAdmin).mockResolvedValue({
            ok: true,
            role: "host",
            user: { id: "host-user-1" } as any,
            accessToken: "token",
        });
        vi.mocked(requireSupabaseService).mockReturnValue({
            ok: true,
            client: serviceClient as any,
        });

        const response = await PATCH(
            new NextRequest("http://localhost/api/support/ticket-1", {
                method: "PATCH",
                body: JSON.stringify({ status: "resolved" }),
            }),
            { params: Promise.resolve({ id: "ticket-1" }) }
        );

        expect(response.status).toBe(403);
        expect(supportTicketsTable.update).not.toHaveBeenCalled();
        expect(directWorkshopLookup.eq).toHaveBeenCalledWith("host_user_id", "host-user-1");
        expect(linkedWorkshopLookup.in).toHaveBeenCalledWith("host_id", ["host-1"]);
    });
});
