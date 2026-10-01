import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    enforceRateLimit: vi.fn(),
    exchangeCodeForSession: vi.fn(),
    getUserRole: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: mocks.enforceRateLimit }));
vi.mock("@/lib/api-auth", () => ({ getUserRole: mocks.getUserRole }));
vi.mock("@/lib/env", () => ({
    getPublicSupabaseConfig: () => ({ url: "https://example.supabase.co", key: "anon" }),
}));
vi.mock("next/headers", () => ({
    cookies: async () => ({ getAll: () => [] }),
}));
vi.mock("@supabase/ssr", () => ({
    createServerClient: () => ({
        auth: { exchangeCodeForSession: mocks.exchangeCodeForSession },
    }),
}));
vi.mock("@sentry/nextjs", () => ({ captureException: () => undefined }));

import { GET } from "./route";

function callback(query: string) {
    return new NextRequest(`http://localhost/api/auth/callback${query}`);
}

function loginError(response: Response) {
    const location = response.headers.get("location");
    expect(location).toBeTruthy();
    const url = new URL(location!);
    expect(url.pathname).toBe("/auth/login");
    return url.searchParams.get("error");
}

describe("GET /api/auth/callback", () => {
    beforeEach(() => {
        mocks.enforceRateLimit.mockResolvedValue({ ok: true });
        mocks.getUserRole.mockResolvedValue("user");
    });

    it("never copies a caller-supplied error_description into the login redirect", async () => {
        const spoof = "Your account is locked. Call +1-555-0100 to restore access.";
        const response = await GET(
            callback(`?error=server_error&error_description=${encodeURIComponent(spoof)}`)
        );

        const message = loginError(response);
        expect(message).not.toContain("locked");
        expect(message).not.toContain("555");
        expect(message).toBe("Sign-in could not be completed. Please try again.");
    });

    it("maps access_denied to a fixed cancelled message", async () => {
        const response = await GET(
            callback("?error=access_denied&error_description=The+user+denied+access")
        );

        expect(loginError(response)).toBe("Sign-in was cancelled. Please try again.");
    });

    it("maps a PKCE failure to the fixed expired message", async () => {
        const response = await GET(
            callback("?error_description=PKCE+code+verifier+not+found+in+storage")
        );

        expect(loginError(response)).toBe(
            "Google sign-in expired. Please click Continue with Google again."
        );
    });

    it("does not echo an exchange error message either", async () => {
        mocks.exchangeCodeForSession.mockResolvedValue({
            data: null,
            error: { message: "internal gotrue failure at host 10.0.0.5" },
        });

        const response = await GET(callback("?code=abc"));

        const message = loginError(response);
        expect(message).not.toContain("10.0.0.5");
        expect(message).toBe("Sign-in could not be completed. Please try again.");
    });
});
