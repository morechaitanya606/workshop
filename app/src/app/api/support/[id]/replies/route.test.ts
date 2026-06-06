import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
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

describe("POST /api/support/[id]/replies", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("stores replies and moves open tickets to in progress", async () => {
        const ticketLookup = {
            eq: vi.fn(),
            maybeSingle: vi.fn().mockResolvedValue({
                data: { id: "ticket-1", workshop_id: "workshop-1", status: "open" },
                error: null,
            }),
        };
        ticketLookup.eq.mockImplementation(() => ticketLookup);

        const replyInsert = {
            select: vi.fn(),
            single: vi.fn().mockResolvedValue({
                data: {
                    id: "reply-1",
                    message: "We are checking this now.",
                    author_role: "admin",
                    created_at: "2026-06-06T10:00:00.000Z",
                },
                error: null,
            }),
        };
        replyInsert.select.mockImplementation(() => replyInsert);

        const ticketUpdate = {
            eq: vi.fn(),
            select: vi.fn(),
            single: vi.fn().mockResolvedValue({
                data: { status: "in_progress" },
                error: null,
            }),
        };
        ticketUpdate.eq.mockImplementation(() => ticketUpdate);
        ticketUpdate.select.mockImplementation(() => ticketUpdate);

        const supportTicketsTable = {
            select: vi.fn(() => ticketLookup),
            update: vi.fn(() => ticketUpdate),
        };
        const repliesTable = {
            insert: vi.fn(() => replyInsert),
        };
        const serviceClient = {
            from: vi.fn((table: string) => {
                if (table === "support_tickets") return supportTicketsTable;
                if (table === "support_ticket_replies") return repliesTable;
                throw new Error(`Unexpected table ${table}`);
            }),
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

        const response = await POST(
            new NextRequest("http://localhost/api/support/ticket-1/replies", {
                method: "POST",
                body: JSON.stringify({ message: "We are checking this now." }),
            }),
            { params: Promise.resolve({ id: "ticket-1" }) }
        );
        const body = await response.json();

        expect(response.status).toBe(201);
        expect(repliesTable.insert).toHaveBeenCalledWith({
            ticket_id: "ticket-1",
            author_user_id: "admin-1",
            author_role: "admin",
            message: "We are checking this now.",
        });
        expect(supportTicketsTable.update).toHaveBeenCalledWith({ status: "in_progress" });
        expect(body).toEqual({
            reply: {
                id: "reply-1",
                message: "We are checking this now.",
                author: "admin",
                created_at: "2026-06-06T10:00:00.000Z",
            },
            ticket: {
                id: "ticket-1",
                status: "in_progress",
            },
        });
    });

    it("allows owning hosts to store replies", async () => {
        const ticketLookup = {
            eq: vi.fn(),
            maybeSingle: vi.fn().mockResolvedValue({
                data: { id: "ticket-1", workshop_id: "workshop-1", status: "in_progress" },
                error: null,
            }),
        };
        ticketLookup.eq.mockImplementation(() => ticketLookup);

        const directWorkshopLookup = {
            eq: vi.fn(),
            maybeSingle: vi.fn().mockResolvedValue({
                data: { id: "workshop-1" },
                error: null,
            }),
        };
        directWorkshopLookup.eq.mockImplementation(() => directWorkshopLookup);

        const replyInsert = {
            select: vi.fn(),
            single: vi.fn().mockResolvedValue({
                data: {
                    id: "reply-1",
                    message: "Host reply.",
                    author_role: "host",
                    created_at: "2026-06-06T10:00:00.000Z",
                },
                error: null,
            }),
        };
        replyInsert.select.mockImplementation(() => replyInsert);

        const supportTicketsTable = {
            select: vi.fn(() => ticketLookup),
            update: vi.fn(),
        };
        const workshopsTable = {
            select: vi.fn(() => directWorkshopLookup),
        };
        const repliesTable = {
            insert: vi.fn(() => replyInsert),
        };
        const serviceClient = {
            from: vi.fn((table: string) => {
                if (table === "support_tickets") return supportTicketsTable;
                if (table === "workshops") return workshopsTable;
                if (table === "support_ticket_replies") return repliesTable;
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

        const response = await POST(
            new NextRequest("http://localhost/api/support/ticket-1/replies", {
                method: "POST",
                body: JSON.stringify({ message: "Host reply." }),
            }),
            { params: Promise.resolve({ id: "ticket-1" }) }
        );
        const body = await response.json();

        expect(response.status).toBe(201);
        expect(repliesTable.insert).toHaveBeenCalledWith({
            ticket_id: "ticket-1",
            author_user_id: "host-user-1",
            author_role: "host",
            message: "Host reply.",
        });
        expect(supportTicketsTable.update).not.toHaveBeenCalled();
        expect(body.ticket).toEqual({
            id: "ticket-1",
            status: "in_progress",
        });
    });
});
