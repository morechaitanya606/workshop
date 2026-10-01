import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createChainableSupabase } from "@/test/chainable-supabase";

const mocks = vi.hoisted(() => ({
    requireAdminUser: vi.fn(),
    requireAuthenticatedUser: vi.fn(),
    requireSupabaseService: vi.fn(),
    assertRateLimit: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
    requireAdminUser: mocks.requireAdminUser,
    requireAuthenticatedUser: mocks.requireAuthenticatedUser,
}));
vi.mock("@/lib/api-helpers", () => ({ requireSupabaseService: mocks.requireSupabaseService }));
vi.mock("@/lib/rate-limit", () => ({
    assertRateLimit: mocks.assertRateLimit,
    getRateLimitKey: () => "key",
}));
vi.mock("@sentry/nextjs", () => ({ captureException: () => undefined }));

import { GET, POST } from "./route";

function submit(body: unknown) {
    return POST(
        new NextRequest("http://localhost/api/host-applications", {
            method: "POST",
            body: JSON.stringify(body),
        })
    );
}

const baseApplication = {
    name: "Asha Rao",
    email: "asha@example.com",
    bio: "I have taught pottery for ten years and run weekly studio sessions.",
    portfolioUrl: "https://asha.example.com",
    applicationType: "creator",
};

describe("POST /api/host-applications", () => {
    beforeEach(() => {
        mocks.assertRateLimit.mockResolvedValue({ ok: true });
        mocks.requireAuthenticatedUser.mockResolvedValue({ ok: true, user: { id: "user-1" } });
    });

    it("rate limits by address before the remote auth lookup", async () => {
        mocks.assertRateLimit.mockResolvedValueOnce({
            ok: false,
            response: new Response(null, { status: 429 }),
        });

        const response = await submit(baseApplication);

        expect(response.status).toBe(429);
        expect(mocks.requireAuthenticatedUser).not.toHaveBeenCalled();
    });

    it("accepts the details the creator form sends", async () => {
        const db = createChainableSupabase({
            host_applications: [
                { data: null, error: null },
                { data: { id: "app-1" }, error: null },
            ],
        });
        mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });

        const response = await submit({
            ...baseApplication,
            details: {
                expertise: "Pottery",
                location: "Pune",
                phone: "+91 99999 88888",
                socialLinks: { instagram: "", youtube: "", website: "https://asha.example.com" },
            },
        });

        expect(response.status).toBe(201);
    });

    it("rejects oversized details", async () => {
        const db = createChainableSupabase();
        mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });

        const response = await submit({
            ...baseApplication,
            details: Object.fromEntries(
                Array.from({ length: 12 }, (_, index) => [`field${index}`, "x".repeat(900)])
            ),
        });

        expect(response.status).toBe(400);
        expect(db.tables()).not.toContain("host_applications");
    });

    it("rejects non-object and deeply nested details", async () => {
        const db = createChainableSupabase();
        mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });

        expect((await submit({ ...baseApplication, details: "a string" })).status).toBe(400);
        expect((await submit({ ...baseApplication, details: [1, 2, 3] })).status).toBe(400);
        expect(
            (await submit({ ...baseApplication, details: { a: { b: { c: "too deep" } } } })).status
        ).toBe(400);
    });
});

describe("GET /api/host-applications", () => {
    beforeEach(() => {
        mocks.assertRateLimit.mockResolvedValue({ ok: true });
        mocks.requireAdminUser.mockResolvedValue({ ok: true, user: { id: "admin-1" } });
    });

    it("pages with limit + cursor and reports nextCursor", async () => {
        const rows = [
            { id: "a3", created_at: "2026-09-03T00:00:00.000Z" },
            { id: "a2", created_at: "2026-09-02T00:00:00.000Z" },
            { id: "a1", created_at: "2026-09-01T00:00:00.000Z" },
        ];
        const db = createChainableSupabase({ host_applications: [{ data: rows, error: null }] });
        mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });

        const response = await GET(
            new NextRequest(
                "http://localhost/api/host-applications?limit=2&cursor=2026-09-04T00:00:00.000Z"
            )
        );
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.applications).toHaveLength(2);
        expect(body.nextCursor).toBe("2026-09-02T00:00:00.000Z");
        expect(db.callsFor("host_applications")).toContainEqual({ op: "limit", args: [3] });
    });

    it("caps the default page size", async () => {
        const db = createChainableSupabase({ host_applications: [{ data: [], error: null }] });
        mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });

        await GET(new NextRequest("http://localhost/api/host-applications"));

        // default limit 50 (+1 probe row)
        expect(db.callsFor("host_applications")).toContainEqual({ op: "limit", args: [51] });
    });

    it("rejects a limit above 100", async () => {
        const response = await GET(
            new NextRequest("http://localhost/api/host-applications?limit=1000")
        );

        expect(response.status).toBe(400);
    });
});
