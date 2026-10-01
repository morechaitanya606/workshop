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

describe("POST /api/admin/host-applications/[id]/reject", () => {
    beforeEach(() => {
        mocks.assertRateLimit.mockResolvedValue({ ok: true });
        mocks.requireAdminUser.mockResolvedValue({ ok: true, user: { id: "admin-1" } });
    });

    it("revokes the host role (host only) when an approved application is rejected", async () => {
        const db = createChainableSupabase({
            host_applications: [
                { data: { id: "app-1", user_id: "u-1", status: "approved" }, error: null },
                { data: { id: "app-1", user_id: "u-1", status: "rejected" }, error: null },
            ],
            profiles: [{ data: [{ id: "u-1" }], error: null }],
        });
        mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });

        const response = await POST(request, params);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.roleRevoked).toBe(true);
        const profileCalls = db.callsFor("profiles");
        expect(profileCalls).toContainEqual({ op: "update", args: [{ role: "user" }] });
        expect(profileCalls).toContainEqual({ op: "eq", args: ["id", "u-1"] });
        expect(profileCalls).toContainEqual({ op: "eq", args: ["role", "host"] });
        // Nothing else is deactivated.
        expect(db.tables()).not.toContain("hosts");
        expect(db.tables()).not.toContain("workshops");
    });

    it("leaves profiles alone when the application was only pending", async () => {
        const db = createChainableSupabase({
            host_applications: [
                { data: { id: "app-1", user_id: "u-1", status: "pending" }, error: null },
                { data: { id: "app-1", user_id: "u-1", status: "rejected" }, error: null },
            ],
        });
        mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });

        const response = await POST(request, params);

        expect(response.status).toBe(200);
        expect(db.tables()).not.toContain("profiles");
    });

    it("returns 404 for an unknown application", async () => {
        const db = createChainableSupabase({ host_applications: [{ data: null, error: null }] });
        mocks.requireSupabaseService.mockReturnValue({ ok: true, client: db.client });

        const response = await POST(request, params);

        expect(response.status).toBe(404);
    });
});
