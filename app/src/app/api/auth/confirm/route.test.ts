import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    enforceRateLimit: vi.fn(),
    verifyOtp: vi.fn(),
    exchangeCodeForSession: vi.fn(),
    setAll: null as null | ((cookies: Array<{ name: string; value: string }>) => void),
}));

vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: mocks.enforceRateLimit }));
vi.mock("@/lib/env", () => ({
    getPublicSupabaseConfig: () => ({ url: "https://example.supabase.co", key: "anon" }),
}));
vi.mock("next/headers", () => ({
    cookies: async () => ({ getAll: () => [] }),
}));
vi.mock("@supabase/ssr", () => ({
    createServerClient: (
        _url: string,
        _key: string,
        options: { cookies: { setAll: (c: Array<{ name: string; value: string }>) => void } }
    ) => {
        mocks.setAll = options.cookies.setAll;
        return {
            auth: {
                verifyOtp: mocks.verifyOtp,
                exchangeCodeForSession: mocks.exchangeCodeForSession,
            },
        };
    },
}));
vi.mock("@sentry/nextjs", () => ({ captureException: () => undefined }));

import { GET } from "./route";

function confirm(query: string) {
    return GET(new NextRequest(`http://localhost/auth/confirm${query}`));
}

function target(response: Response) {
    const location = response.headers.get("location");
    expect(location).toBeTruthy();
    const url = new URL(location!);
    return `${url.pathname}${url.search}`;
}

/** A successful verification sets the session cookies, like the real client does. */
function succeed() {
    mocks.setAll?.([{ name: "sb-test-auth-token", value: "session" }]);
    return { data: {}, error: null };
}

describe("GET /auth/confirm", () => {
    beforeEach(() => {
        mocks.enforceRateLimit.mockResolvedValue({ ok: true });
        mocks.verifyOtp.mockImplementation(async () => succeed());
        mocks.exchangeCodeForSession.mockImplementation(async () => succeed());
    });

    it("verifies a reset link from the template and lands on the reset page signed in", async () => {
        const response = await confirm("?token_hash=abc&type=recovery&next=/auth/reset-password");

        expect(mocks.verifyOtp).toHaveBeenCalledWith({ type: "recovery", token_hash: "abc" });
        expect(target(response)).toBe("/auth/reset-password");
        expect(response.headers.get("set-cookie")).toContain("sb-test-auth-token=session");
        expect(response.headers.get("cache-control")).toBe("private, no-store");
    });

    it("sends a set-password link to the reset page whatever next says", async () => {
        const response = await confirm("?token_hash=abc&type=recovery&next=/profile");
        expect(target(response)).toBe("/auth/reset-password");

        const invite = await confirm("?token_hash=abc&type=invite&next=/admin/dashboard");
        expect(target(invite)).toBe("/auth/reset-password");
    });

    it("confirms a signup and honours an on-site next", async () => {
        const response = await confirm("?token_hash=abc&type=email&next=/workshop/pottery-101");

        expect(mocks.verifyOtp).toHaveBeenCalledWith({ type: "email", token_hash: "abc" });
        expect(target(response)).toBe("/workshop/pottery-101");
    });

    it("never redirects off-site, however next is written", async () => {
        for (const next of ["//evil.example/x", "https://evil.example", "/\t/evil.example"]) {
            const response = await confirm(
                `?token_hash=abc&type=email&next=${encodeURIComponent(next)}`
            );
            expect(new URL(response.headers.get("location")!).host).toBe("localhost");
            expect(target(response)).toBe("/");
        }
    });

    it("sends an email change to the profile", async () => {
        const response = await confirm("?token_hash=abc&type=email_change&next=/");
        expect(target(response)).toBe("/profile");
    });

    it("sends a stale reset link back to forgot-password, and a stale signup link to login", async () => {
        mocks.verifyOtp.mockResolvedValue({ data: {}, error: { message: "Token has expired" } });

        const reset = await confirm("?token_hash=old&type=recovery");
        expect(target(reset)).toBe("/auth/forgot-password?notice=link-expired");
        expect(reset.headers.get("set-cookie")).toBeNull();

        const signup = await confirm("?token_hash=old&type=email");
        expect(target(signup)).toBe("/auth/login?notice=link-expired");
    });

    it("rejects an unknown link type without calling Supabase", async () => {
        const response = await confirm("?token_hash=abc&type=sms");

        expect(mocks.verifyOtp).not.toHaveBeenCalled();
        expect(target(response)).toBe("/auth/login?notice=link-expired");
    });

    it("exchanges a default-template code and keeps the flow's destination", async () => {
        const response = await confirm("?code=xyz&flow=recovery&next=/auth/reset-password");

        expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("xyz");
        expect(target(response)).toBe("/auth/reset-password");
    });

    it("tells a signup whose code cannot be exchanged that the email is confirmed anyway", async () => {
        // Supabase confirms the address before redirecting with the code; a different browser
        // only lacks the PKCE verifier.
        mocks.exchangeCodeForSession.mockResolvedValue({
            data: {},
            error: { message: "both auth code and code verifier should be non-empty" },
        });

        const signup = await confirm("?code=xyz&flow=signup&next=/");
        expect(target(signup)).toBe("/auth/login?notice=email-confirmed");

        const reset = await confirm("?code=xyz&flow=recovery");
        expect(target(reset)).toBe("/auth/forgot-password?notice=link-expired");
    });

    it("maps Supabase's expired-link redirect to a fixed notice and never echoes its text", async () => {
        const spoof = "Your account is locked. Call +1-555-0100.";
        const response = await confirm(
            `?error=access_denied&error_code=otp_expired&error_description=${encodeURIComponent(spoof)}&flow=recovery`
        );

        const location = response.headers.get("location")!;
        expect(target(response)).toBe("/auth/forgot-password?notice=link-expired");
        expect(location).not.toContain("555");
        expect(mocks.verifyOtp).not.toHaveBeenCalled();
    });

    it("sends a bare visit to the login page", async () => {
        const response = await confirm("");
        expect(target(response)).toBe("/auth/login");
    });

    it("keeps the rate limit in front of everything", async () => {
        const limited = NextResponse.json({ error: "slow down" }, { status: 429 });
        mocks.enforceRateLimit.mockResolvedValue({ ok: false, response: limited });

        const response = await confirm("?token_hash=abc&type=recovery");

        expect(response.status).toBe(429);
        expect(mocks.verifyOtp).not.toHaveBeenCalled();
    });
});
