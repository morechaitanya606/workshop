import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireHostOrAdmin } from "@/lib/api-auth";

const authMocks = vi.hoisted(() => ({
    getUser: vi.fn(),
    maybeSingle: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
    captureException: vi.fn(),
    captureMessage: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({
    isSupabasePublicConfigured: true,
    isSupabaseServiceConfigured: true,
    createSupabaseAnonServerClient: vi.fn(() => ({
        auth: {
            getUser: authMocks.getUser,
        },
    })),
    createSupabaseServiceClient: vi.fn(() => ({
        from: vi.fn(() => ({
            select: vi.fn(() => ({
                eq: vi.fn(() => ({
                    maybeSingle: authMocks.maybeSingle,
                })),
            })),
        })),
    })),
}));

function createAuthorizedRequest() {
    return new NextRequest("http://localhost/api/guarded", {
        headers: {
            Authorization: "Bearer test-token",
        },
    });
}

describe("requireHostOrAdmin", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        authMocks.getUser.mockResolvedValue({
            data: {
                user: {
                    id: "user-1",
                    email: "user@example.com",
                    app_metadata: {},
                    user_metadata: {},
                },
            },
            error: null,
        });
    });

    it("rejects authenticated users without host or admin role", async () => {
        authMocks.maybeSingle.mockResolvedValue({
            data: { role: "user" },
            error: null,
        });

        const result = await requireHostOrAdmin(createAuthorizedRequest());

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.response.status).toBe(403);
            await expect(result.response.json()).resolves.toMatchObject({
                error: "Host or Admin access is required for this action.",
            });
        }
    });

    it("allows admins", async () => {
        authMocks.maybeSingle.mockResolvedValue({
            data: { role: "admin" },
            error: null,
        });

        const result = await requireHostOrAdmin(createAuthorizedRequest());

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.role).toBe("admin");
            expect(result.user.id).toBe("user-1");
        }
    });
});
