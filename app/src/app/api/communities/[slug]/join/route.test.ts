import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createChainableSupabase } from "@/test/chainable-supabase";

const mocks = vi.hoisted(() => ({
    assertRateLimit: vi.fn(),
    createSupabaseServiceClient: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
    jsonError: (message: string, status = 400) =>
        new Response(JSON.stringify({ error: message }), {
            status,
            headers: { "content-type": "application/json" },
        }),
}));
vi.mock("@/lib/rate-limit", () => ({
    assertRateLimit: mocks.assertRateLimit,
    getRateLimitKey: () => "key",
}));
vi.mock("@/lib/supabase-server", () => ({
    createSupabaseServiceClient: mocks.createSupabaseServiceClient,
    isSupabaseServiceConfigured: true,
}));
vi.mock("@sentry/nextjs", () => ({ captureException: () => undefined }));

import { POST } from "./route";

const joinBody = {
    fullName: "Asha Rao",
    email: "Asha.Rao@Example.com",
    phone: "+91 99999 88888",
    note: "Looking forward to it",
};

function join(body: unknown = joinBody) {
    return POST(
        new NextRequest("http://localhost/api/communities/pottery/join", {
            method: "POST",
            body: JSON.stringify(body),
        }),
        { params: Promise.resolve({ slug: "pottery" }) }
    );
}

describe("POST /api/communities/[slug]/join", () => {
    beforeEach(() => {
        mocks.assertRateLimit.mockResolvedValue({ ok: true });
    });

    it("records a new request with the e-mail lower-cased", async () => {
        const db = createChainableSupabase({
            communities: [{ data: { id: "community-1" }, error: null }],
            community_join_requests: [
                { data: [], error: null },
                { data: null, error: null },
            ],
        });
        mocks.createSupabaseServiceClient.mockReturnValue(db.client);

        const response = await join();
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toMatchObject({
            success: true,
            message: "Your join request has been submitted.",
        });
        const insert = db.callsFor("community_join_requests").find((call) => call.op === "insert");
        expect(insert!.args[0]).toMatchObject({
            community_id: "community-1",
            email: "asha.rao@example.com",
            status: "pending",
        });
    });

    it("answers 'already requested' without inserting when a request exists", async () => {
        const db = createChainableSupabase({
            communities: [{ data: { id: "community-1" }, error: null }],
            community_join_requests: [{ data: [{ id: "req-1" }], error: null }],
        });
        mocks.createSupabaseServiceClient.mockReturnValue(db.client);

        const response = await join();
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toMatchObject({ success: true, alreadyRequested: true });
        expect(db.callsFor("community_join_requests").some((call) => call.op === "insert")).toBe(
            false
        );
    });

    it("treats a unique-violation (23505) race as already requested, not a failure", async () => {
        const db = createChainableSupabase({
            communities: [{ data: { id: "community-1" }, error: null }],
            community_join_requests: [
                { data: [], error: null },
                { data: null, error: { code: "23505", message: "duplicate key" } },
            ],
        });
        mocks.createSupabaseServiceClient.mockReturnValue(db.client);

        const response = await join();
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toMatchObject({ success: true, alreadyRequested: true });
    });

    it("escapes LIKE metacharacters in the duplicate pre-check", async () => {
        const db = createChainableSupabase({
            communities: [{ data: { id: "community-1" }, error: null }],
            community_join_requests: [
                { data: [], error: null },
                { data: null, error: null },
            ],
        });
        mocks.createSupabaseServiceClient.mockReturnValue(db.client);

        // `%` cannot appear here: the email validator rejects it before any query runs. `_` is
        // both a valid email character and a LIKE wildcard, which is the case that matters.
        const response = await join({ ...joinBody, email: "A_b.c@Example.com" });
        expect(response.status).toBe(200);

        const ilike = db.callsFor("community_join_requests").find((call) => call.op === "ilike");
        expect(ilike!.args).toEqual(["email", "a\\_b.c@example.com"]);
    });

    it("returns 404 for an unknown community", async () => {
        const db = createChainableSupabase({ communities: [{ data: null, error: null }] });
        mocks.createSupabaseServiceClient.mockReturnValue(db.client);

        const response = await join();

        expect(response.status).toBe(404);
    });

    it("still surfaces genuine insert failures as a generic 500", async () => {
        const db = createChainableSupabase({
            communities: [{ data: { id: "community-1" }, error: null }],
            community_join_requests: [
                { data: [], error: null },
                { data: null, error: { code: "XX000", message: "table exploded" } },
            ],
        });
        mocks.createSupabaseServiceClient.mockReturnValue(db.client);

        const response = await join();

        expect(response.status).toBe(500);
    });
});
