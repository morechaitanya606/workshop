import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createChainableSupabase } from "@/test/chainable-supabase";

const mocks = vi.hoisted(() => ({
    requireHostOrAdmin: vi.fn(),
    requireSupabaseService: vi.fn(),
    assertRateLimit: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({ requireHostOrAdmin: mocks.requireHostOrAdmin }));
vi.mock("@/lib/api-helpers", () => ({ requireSupabaseService: mocks.requireSupabaseService }));
vi.mock("@/lib/rate-limit", () => ({
    assertRateLimit: mocks.assertRateLimit,
    getRateLimitKey: () => "key",
}));
vi.mock("@/lib/supabase-server", () => ({ createSupabaseAnonServerClient: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException: () => undefined }));

import { GET, POST } from "./route";

const WORKSHOP_ID = "11111111-2222-4333-8444-555555555555";

function getRequest(query = "") {
    return new NextRequest(`http://localhost/api/support${query}`);
}

function postRequest(body: unknown) {
    return new NextRequest("http://localhost/api/support", {
        method: "POST",
        body: JSON.stringify(body),
    });
}

const validTicket = {
    subject: "Payment failed",
    description: "My card was charged but I got no booking confirmation.",
    email: "user@example.com",
};

describe("GET /api/support", () => {
    beforeEach(() => {
        mocks.assertRateLimit.mockResolvedValue({ ok: true });
        mocks.requireHostOrAdmin.mockResolvedValue({
            ok: true,
            user: { id: "admin-1" },
            role: "admin",
        });
    });

    it("pages tickets with limit + cursor and reports nextCursor", async () => {
        const rows = [
            { id: "t3", created_at: "2026-09-03T00:00:00.000Z", workshop_id: null },
            { id: "t2", created_at: "2026-09-02T00:00:00.000Z", workshop_id: null },
            { id: "t1", created_at: "2026-09-01T00:00:00.000Z", workshop_id: null },
        ];
        const db = createChainableSupabase({
            support_tickets: [{ data: rows, error: null }],
            support_ticket_replies: [{ data: [], error: null }],
        });
        mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });

        const response = await GET(getRequest("?limit=2&cursor=2026-09-04T00:00:00.000Z"));
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.tickets.map((ticket: { id: string }) => ticket.id)).toEqual(["t3", "t2"]);
        expect(body.nextCursor).toBe("2026-09-02T00:00:00.000Z");

        const ticketCalls = db.callsFor("support_tickets");
        expect(ticketCalls).toContainEqual({ op: "limit", args: [3] });
        expect(ticketCalls).toContainEqual({
            op: "lt",
            args: ["created_at", "2026-09-04T00:00:00.000Z"],
        });
    });

    it("returns a null nextCursor on the last page", async () => {
        const db = createChainableSupabase({
            support_tickets: [
                {
                    data: [{ id: "t1", created_at: "2026-09-01T00:00:00.000Z", workshop_id: null }],
                    error: null,
                },
            ],
            support_ticket_replies: [{ data: [], error: null }],
        });
        mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });

        const response = await GET(getRequest("?limit=2"));
        const body = await response.json();

        expect(body.tickets).toHaveLength(1);
        expect(body.nextCursor).toBeNull();
    });

    it("rejects an out-of-range limit and a malformed cursor", async () => {
        expect((await GET(getRequest("?limit=5000"))).status).toBe(400);
        expect((await GET(getRequest("?cursor=not-a-date"))).status).toBe(400);
    });

    it("never returns a raw database error message", async () => {
        const db = createChainableSupabase({
            support_tickets: [
                {
                    data: null,
                    error: { message: 'relation "secret_table" exploded', code: "XX000" },
                },
            ],
        });
        mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });

        const response = await GET(getRequest());
        const text = await response.text();

        expect(response.status).toBe(500);
        expect(text).not.toContain("secret_table");
    });
});

describe("POST /api/support", () => {
    beforeEach(() => {
        mocks.assertRateLimit.mockResolvedValue({ ok: true });
    });

    it("rejects a malformed workshop id", async () => {
        mocks.requireSupabaseService.mockReturnValue({
            ok: true,
            client: createChainableSupabase().client,
        });

        const response = await POST(postRequest({ ...validTicket, workshopId: "not-a-uuid" }));

        expect(response.status).toBe(400);
    });

    it("rejects a workshop id that does not exist", async () => {
        const db = createChainableSupabase({ workshops: [{ data: null, error: null }] });
        mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });

        const response = await POST(postRequest({ ...validTicket, workshopId: WORKSHOP_ID }));

        expect(response.status).toBe(400);
        expect(db.tables()).not.toContain("support_tickets");
    });

    it("files a ticket linked to an existing workshop", async () => {
        const db = createChainableSupabase({
            workshops: [{ data: { id: WORKSHOP_ID }, error: null }],
            support_tickets: [{ data: null, error: null }],
        });
        mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });

        const response = await POST(postRequest({ ...validTicket, workshopId: WORKSHOP_ID }));

        expect(response.status).toBe(200);
        const insert = db.callsFor("support_tickets").find((call) => call.op === "insert");
        expect((insert!.args[0] as Array<{ workshop_id: string }>)[0].workshop_id).toBe(
            WORKSHOP_ID
        );
    });

    it("files a ticket with no workshop without any workshop lookup", async () => {
        const db = createChainableSupabase({ support_tickets: [{ data: null, error: null }] });
        mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });

        const response = await POST(postRequest(validTicket));

        expect(response.status).toBe(200);
        expect(db.tables()).not.toContain("workshops");
    });

    it("caps field lengths", async () => {
        mocks.requireSupabaseService.mockReturnValue({
            ok: true,
            client: createChainableSupabase().client,
        });

        const tooLong = await POST(
            postRequest({ ...validTicket, subject: "s".repeat(500), description: "d".repeat(9000) })
        );

        expect(tooLong.status).toBe(400);
    });
});
