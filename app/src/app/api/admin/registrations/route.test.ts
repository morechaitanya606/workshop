import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createChainableSupabase } from "@/test/chainable-supabase";

const mocks = vi.hoisted(() => ({
    requireAdminUser: vi.fn(),
    requireSupabaseService: vi.fn(),
    enforceRateLimit: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
    requireAdminUser: mocks.requireAdminUser,
    jsonError: (message: string, status = 400) =>
        new Response(JSON.stringify({ error: message }), { status }),
}));
vi.mock("@/lib/api-helpers", () => ({ requireSupabaseService: mocks.requireSupabaseService }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: mocks.enforceRateLimit }));
vi.mock("@sentry/nextjs", () => ({ captureException: () => undefined }));

import { GET } from "./route";

function listRequest(query: string) {
    return new NextRequest(`http://localhost/api/admin/registrations${query}`);
}

describe("GET /api/admin/registrations", () => {
    beforeEach(() => {
        mocks.enforceRateLimit.mockResolvedValue({ ok: true });
        mocks.requireAdminUser.mockResolvedValue({ ok: true, user: { id: "admin-1" } });
    });

    it("strips PostgREST structural characters from the search term", async () => {
        const db = createChainableSupabase({
            bookings: [{ data: [], error: null, count: 0 }],
        });
        mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });

        const injected = encodeURIComponent('x,id.neq.0),or(email.ilike.*"\\');
        const response = await GET(listRequest(`?q=${injected}`));

        expect(response.status).toBe(200);
        const orCall = db.callsFor("bookings").find((call) => call.op === "or");
        expect(orCall).toBeDefined();
        const expression = String(orCall!.args[0]);
        // Exactly the three intended filters, nothing smuggled in.
        expect(expression.split(",")).toHaveLength(3);
        expect(expression).not.toMatch(/[()*"\\]/);
    });

    it("skips the filter entirely when nothing searchable survives", async () => {
        const db = createChainableSupabase({ bookings: [{ data: [], error: null, count: 0 }] });
        mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });

        const response = await GET(listRequest(`?q=${encodeURIComponent(",(),%")}`));

        expect(response.status).toBe(200);
        expect(db.callsFor("bookings").some((call) => call.op === "or")).toBe(false);
    });

    it("caps the search term length", async () => {
        const db = createChainableSupabase({ bookings: [{ data: [], error: null, count: 0 }] });
        mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });

        // The query schema already caps q at 120; the sanitiser then caps what reaches .or().
        await GET(listRequest(`?q=${"a".repeat(120)}`));

        const orCall = db.callsFor("bookings").find((call) => call.op === "or");
        expect(String(orCall!.args[0]).length).toBeLessThan(3 * (80 + 20));
    });

    it("rejects an absurd page number", async () => {
        const db = createChainableSupabase();
        mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });

        const response = await GET(listRequest("?page=99999999999"));

        expect(response.status).toBe(400);
    });
});
