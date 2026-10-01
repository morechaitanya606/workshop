import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createChainableSupabase } from "@/test/chainable-supabase";

const mocks = vi.hoisted(() => ({
    requireAdminUser: vi.fn(),
    requireSupabaseService: vi.fn(),
    assertRateLimit: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({ requireAdminUser: mocks.requireAdminUser }));
vi.mock("@/lib/api-helpers", () => ({ requireSupabaseService: mocks.requireSupabaseService }));
vi.mock("@/lib/rate-limit", () => ({
    assertRateLimit: mocks.assertRateLimit,
    getRateLimitKey: () => "key",
}));
vi.mock("@sentry/nextjs", () => ({ captureException: () => undefined }));

import { POST } from "./route";

const params = { params: Promise.resolve({ id: "app-1" }) };
const request = {} as NextRequest;

describe("POST /api/admin/host-applications/[id]/approve", () => {
    beforeEach(() => {
        mocks.assertRateLimit.mockResolvedValue({ ok: true });
        mocks.requireAdminUser.mockResolvedValue({ ok: true, user: { id: "admin-1" } });
    });

    it("only upgrades a profile whose role is 'user' (never demotes an admin)", async () => {
        const application = {
            id: "app-1",
            user_id: "u-1",
            name: "A",
            bio: "b",
            portfolio_url: null,
            status: "pending",
        };
        const db = createChainableSupabase({
            host_applications: [
                { data: application, error: null },
                { data: { ...application, status: "approved" }, error: null },
            ],
            profiles: [{ data: null, error: null }],
            hosts: [
                { data: null, error: null },
                { data: null, error: null },
            ],
        });
        mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });

        const response = await POST(request, params);

        expect(response.status).toBe(200);
        const profileCalls = db.callsFor("profiles");
        expect(profileCalls).toContainEqual({ op: "update", args: [{ role: "host" }] });
        expect(profileCalls).toContainEqual({ op: "eq", args: ["id", "u-1"] });
        expect(profileCalls).toContainEqual({ op: "eq", args: ["role", "user"] });
    });

    it("rate limits by address before the remote admin lookup", async () => {
        mocks.assertRateLimit.mockResolvedValueOnce({
            ok: false,
            response: new Response(null, { status: 429 }),
        });

        const response = await POST(request, params);

        expect(response.status).toBe(429);
        expect(mocks.requireAdminUser).not.toHaveBeenCalled();
    });
});
