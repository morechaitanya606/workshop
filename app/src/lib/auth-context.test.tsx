import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(),
    signOut: vi.fn(),
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    resend: vi.fn(),
    unsubscribe: vi.fn(),
    getAuthMe: vi.fn(),
}));

vi.mock("@/lib/public-env", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/public-env")>()),
    getPublicSupabaseConfig: () => ({
        url: "https://project.supabase.co",
        key: "sb_publishable_x",
    }),
}));

function supabaseModule() {
    return {
        isSupabaseConfigured: true,
        supabase: {
            auth: {
                getSession: mocks.getSession,
                onAuthStateChange: mocks.onAuthStateChange,
                signOut: mocks.signOut,
                signInWithPassword: mocks.signInWithPassword,
                signUp: mocks.signUp,
                resend: mocks.resend,
            },
        },
    };
}

vi.mock("@/lib/supabase", () => supabaseModule());

vi.mock("@/lib/api-client", () => ({ getAuthMe: mocks.getAuthMe }));

const SESSION = {
    access_token: "access-token",
    user: { id: "user-1" },
};

const NETWORK_ERROR = {
    name: "AuthRetryableFetchError",
    message: "Failed to fetch",
    status: 0,
};

/** What api-client's getAuthMe rejects with when no answer came back (status 0). */
const NO_CONNECTION = {
    name: "ApiClientError",
    message: "You seem to be offline or on a slow connection. Please try again.",
    status: 0,
};

function apiError(status: number, message = "Request failed.") {
    return { name: "ApiClientError", message, status };
}

type AuthModule = typeof import("./auth-context");

async function loadAuthModule() {
    vi.resetModules();
    return import("./auth-context");
}

async function renderAuth(authModule: AuthModule) {
    function AuthProbe() {
        const { loading, user, role, roleLoading } = authModule.useAuth();
        const state = loading ? "loading" : user ? `signed-in:${user.id}:${role}` : "signed-out";
        return (
            <>
                <p data-testid="auth-state">{state}</p>
                <p data-testid="role-state">{roleLoading ? "role-loading" : "role-ready"}</p>
            </>
        );
    }

    render(
        <authModule.AuthProvider>
            <AuthProbe />
        </authModule.AuthProvider>
    );
    await flush();
}

/**
 * Advances the fake clock by `ms` and lets everything pending settle: the dynamic import of
 * supabase-js, getSession and the role request.
 */
async function flush(ms = 0) {
    await act(async () => {
        await vi.dynamicImportSettled();
        await vi.advanceTimersByTimeAsync(ms);
        await vi.dynamicImportSettled();
        await vi.advanceTimersByTimeAsync(0);
    });
}

function authState() {
    return screen.getByTestId("auth-state").textContent;
}

function roleState() {
    return screen.getByTestId("role-state").textContent;
}

function authStateListener() {
    return mocks.onAuthStateChange.mock.calls[0][0] as (event: string, session: unknown) => void;
}

describe("AuthProvider", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        mocks.onAuthStateChange.mockReturnValue({
            data: { subscription: { unsubscribe: mocks.unsubscribe } },
        });
        mocks.signOut.mockResolvedValue({ error: null });
        mocks.getAuthMe.mockResolvedValue({ role: "user" });
    });

    afterEach(() => {
        cleanup();
        vi.useRealTimers();
        vi.doMock("@/lib/supabase", () => supabaseModule());
    });

    it("imports supabase-js only on demand, never with the module itself", () => {
        // The jsdom environment has no file: import.meta.url; tests run from the app folder.
        const source = readFileSync(join(process.cwd(), "src", "lib", "auth-context.tsx"), "utf8");

        expect(source).not.toMatch(/from\s+["'](\.\/supabase|@\/lib\/supabase)["']/);
        expect(source).toContain('import("./supabase")');
    });

    it("reads a signed-out visitor's session once mounted", async () => {
        mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });

        await renderAuth(await loadAuthModule());

        expect(authState()).toBe("signed-out");
        expect(mocks.getAuthMe).not.toHaveBeenCalled();
    });

    it("applies the stored session and loads the role", async () => {
        mocks.getSession.mockResolvedValue({ data: { session: SESSION }, error: null });
        mocks.getAuthMe.mockResolvedValue({ role: "host" });

        await renderAuth(await loadAuthModule());

        expect(authState()).toBe("signed-in:user-1:host");
        expect(mocks.getAuthMe).toHaveBeenCalledTimes(1);
    });

    it("stays loading on a network error and tries again after a pause", async () => {
        mocks.getSession
            .mockResolvedValueOnce({ data: { session: null }, error: NETWORK_ERROR })
            .mockResolvedValueOnce({ data: { session: SESSION }, error: null });

        await renderAuth(await loadAuthModule());
        expect(authState()).toBe("loading");
        expect(mocks.signOut).not.toHaveBeenCalled();

        await flush(1_999);
        expect(mocks.getSession).toHaveBeenCalledTimes(1);

        await flush(1);
        expect(mocks.getSession).toHaveBeenCalledTimes(2);
        expect(authState()).toBe("signed-in:user-1:user");
    });

    it("waits longer after each failure", async () => {
        mocks.getSession
            .mockResolvedValueOnce({ data: { session: null }, error: NETWORK_ERROR })
            .mockResolvedValueOnce({ data: { session: null }, error: NETWORK_ERROR })
            .mockResolvedValueOnce({ data: { session: SESSION }, error: null });

        await renderAuth(await loadAuthModule());
        await flush(2_000);
        expect(mocks.getSession).toHaveBeenCalledTimes(2);
        expect(authState()).toBe("loading");

        await flush(4_999);
        expect(mocks.getSession).toHaveBeenCalledTimes(2);
        await flush(1);
        expect(mocks.getSession).toHaveBeenCalledTimes(3);
        expect(authState()).toBe("signed-in:user-1:user");
    });

    it("tries again as soon as the browser is back online", async () => {
        mocks.getSession
            .mockResolvedValueOnce({ data: { session: null }, error: NETWORK_ERROR })
            .mockResolvedValueOnce({ data: { session: SESSION }, error: null });

        await renderAuth(await loadAuthModule());
        expect(authState()).toBe("loading");

        await act(async () => {
            window.dispatchEvent(new Event("online"));
        });
        await flush();

        expect(mocks.getSession).toHaveBeenCalledTimes(2);
        expect(authState()).toBe("signed-in:user-1:user");

        // The pending pause was cancelled: no third read.
        await flush(60_000);
        expect(mocks.getSession).toHaveBeenCalledTimes(2);
    });

    it("ignores the null INITIAL_SESSION auth-js reports when its refresh fails", async () => {
        mocks.getSession.mockResolvedValue({ data: { session: null }, error: NETWORK_ERROR });

        await renderAuth(await loadAuthModule());
        await act(async () => {
            authStateListener()("INITIAL_SESSION", null);
        });
        expect(authState()).toBe("loading");

        // A later real event still applies, and stops the retries.
        await act(async () => {
            authStateListener()("TOKEN_REFRESHED", SESSION);
        });
        await flush();
        expect(authState()).toBe("signed-in:user-1:user");

        await flush(60_000);
        expect(mocks.getSession).toHaveBeenCalledTimes(1);
    });

    it("still signs out on an invalid refresh token, clearing the local session", async () => {
        mocks.getSession.mockResolvedValue({
            data: { session: null },
            error: {
                name: "AuthApiError",
                message: "Invalid Refresh Token: Already Used",
                status: 400,
            },
        });

        await renderAuth(await loadAuthModule());

        expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
        expect(authState()).toBe("signed-out");
        await flush(60_000);
        expect(mocks.getSession).toHaveBeenCalledTimes(1);
    });

    it("treats any other auth error as signed out, without retrying", async () => {
        mocks.getSession.mockResolvedValue({
            data: { session: null },
            error: { name: "AuthApiError", message: "Session expired", status: 403 },
        });

        await renderAuth(await loadAuthModule());

        expect(authState()).toBe("signed-out");
        await flush(60_000);
        expect(mocks.getSession).toHaveBeenCalledTimes(1);
    });

    describe("when the role check gets no answer", () => {
        const NO_ANSWER: Array<[string, unknown]> = [
            ["no connection", NO_CONNECTION],
            ["a gateway error", apiError(503, "Service Unavailable")],
            ["a server error", apiError(500)],
            ["too many requests", apiError(429)],
            ["an unexpected error", new TypeError("x is not a function")],
        ];

        beforeEach(() => {
            mocks.getSession.mockResolvedValue({ data: { session: SESSION }, error: null });
        });

        it.each(NO_ANSWER)(
            "never hands the visitor a role it could not read (%s)",
            async (_label, failure) => {
                mocks.getAuthMe
                    .mockRejectedValueOnce(failure)
                    .mockResolvedValueOnce({ role: "admin" });

                await renderAuth(await loadAuthModule());

                // Signed in, role unknown: the admin and host pages keep their spinner rather than
                // being told "not allowed".
                expect(authState()).toBe("signed-in:user-1:user");
                expect(roleState()).toBe("role-loading");

                await flush(1_999);
                expect(mocks.getAuthMe).toHaveBeenCalledTimes(1);

                // Asked again after a pause, reading the session first (a fresh token).
                await flush(1);
                expect(mocks.getSession).toHaveBeenCalledTimes(2);
                expect(mocks.getAuthMe).toHaveBeenCalledTimes(2);
                expect(authState()).toBe("signed-in:user-1:admin");
                expect(roleState()).toBe("role-ready");
            }
        );

        it("waits longer after each failed check, then goes on asking quietly", async () => {
            mocks.getAuthMe
                .mockRejectedValueOnce(NO_CONNECTION)
                .mockRejectedValueOnce(NO_CONNECTION)
                .mockResolvedValueOnce({ role: "host" });

            await renderAuth(await loadAuthModule());
            await flush(2_000);
            expect(mocks.getAuthMe).toHaveBeenCalledTimes(2);
            expect(roleState()).toBe("role-loading");

            await flush(4_999);
            expect(mocks.getAuthMe).toHaveBeenCalledTimes(2);
            await flush(1);
            expect(mocks.getAuthMe).toHaveBeenCalledTimes(3);
            expect(authState()).toBe("signed-in:user-1:host");
            expect(roleState()).toBe("role-ready");
        });

        it("asks again as soon as the browser is back online", async () => {
            mocks.getAuthMe
                .mockRejectedValueOnce(NO_CONNECTION)
                .mockResolvedValueOnce({ role: "host" });

            await renderAuth(await loadAuthModule());
            expect(roleState()).toBe("role-loading");

            await act(async () => {
                window.dispatchEvent(new Event("online"));
            });
            await flush();

            expect(authState()).toBe("signed-in:user-1:host");
            expect(roleState()).toBe("role-ready");

            // The pending pause was cancelled: no third request.
            await flush(60_000);
            expect(mocks.getAuthMe).toHaveBeenCalledTimes(2);
        });

        it("keeps a role it already knows when a later check gets no answer", async () => {
            mocks.getAuthMe.mockResolvedValueOnce({ role: "admin" });
            await renderAuth(await loadAuthModule());
            expect(authState()).toBe("signed-in:user-1:admin");

            mocks.getAuthMe.mockRejectedValue(NO_CONNECTION);
            await act(async () => {
                authStateListener()("TOKEN_REFRESHED", SESSION);
            });
            await flush();

            expect(authState()).toBe("signed-in:user-1:admin");
            expect(roleState()).toBe("role-ready");

            // Nothing is waiting on the answer, so there is no retry loop.
            await flush(60_000);
            expect(mocks.getAuthMe).toHaveBeenCalledTimes(2);
        });

        it.each([401, 403])(
            "takes a %i answer as 'not allowed' and does not ask again",
            async (status) => {
                mocks.getAuthMe.mockRejectedValue(apiError(status, "Not allowed."));

                await renderAuth(await loadAuthModule());

                expect(authState()).toBe("signed-in:user-1:user");
                expect(roleState()).toBe("role-ready");
                await flush(60_000);
                expect(mocks.getAuthMe).toHaveBeenCalledTimes(1);
            }
        );

        it("lets a definite 403 take a known role away", async () => {
            mocks.getAuthMe.mockResolvedValueOnce({ role: "admin" });
            await renderAuth(await loadAuthModule());
            expect(authState()).toBe("signed-in:user-1:admin");

            mocks.getAuthMe.mockRejectedValue(apiError(403, "Not allowed."));
            await act(async () => {
                authStateListener()("TOKEN_REFRESHED", SESSION);
            });
            await flush();

            expect(authState()).toBe("signed-in:user-1:user");
            expect(roleState()).toBe("role-ready");
        });

        it("stops asking once the visitor signs out", async () => {
            mocks.getAuthMe.mockRejectedValue(NO_CONNECTION);
            await renderAuth(await loadAuthModule());
            expect(roleState()).toBe("role-loading");

            await act(async () => {
                authStateListener()("SIGNED_OUT", null);
            });
            await flush();

            expect(authState()).toBe("signed-out");
            expect(roleState()).toBe("role-ready");
            await flush(60_000);
            expect(mocks.getAuthMe).toHaveBeenCalledTimes(1);
        });

        it("stops asking on unmount", async () => {
            mocks.getAuthMe.mockRejectedValue(NO_CONNECTION);
            await renderAuth(await loadAuthModule());

            cleanup();
            await flush(60_000);

            expect(mocks.getAuthMe).toHaveBeenCalledTimes(1);
        });
    });

    it("stays loading while offline and supabase-js cannot download, then loads it", async () => {
        const onLine = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
        vi.doMock("@/lib/supabase", () => {
            throw new Error("Loading chunk 77 failed.");
        });
        mocks.getSession.mockResolvedValue({ data: { session: SESSION }, error: null });

        await renderAuth(await loadAuthModule());
        expect(authState()).toBe("loading");
        expect(mocks.getSession).not.toHaveBeenCalled();

        onLine.mockReturnValue(true);
        vi.doMock("@/lib/supabase", () => supabaseModule());
        await act(async () => {
            window.dispatchEvent(new Event("online"));
        });
        await flush();

        expect(authState()).toBe("signed-in:user-1:user");
        expect(mocks.onAuthStateChange).toHaveBeenCalledTimes(1);
    });

    it("hands a chunk that keeps failing while online to the chunk-load recovery", async () => {
        vi.doMock("@/lib/supabase", () => {
            const error = new Error("Loading chunk 77 failed.");
            error.name = "ChunkLoadError";
            throw error;
        });

        await renderAuth(await loadAuthModule());
        await flush(2_000);
        expect(authState()).toBe("loading");

        // The third failure is rethrown outside React, where the root layout's script sees it.
        // (vitest wraps an error thrown by a mock factory; the chunk error is its cause.)
        let rethrown: unknown = null;
        for (let round = 0; round < 6 && !rethrown; round += 1) {
            await flush(5_000).catch((error: unknown) => {
                rethrown = error;
            });
        }
        expect(rethrown).toMatchObject({
            cause: expect.objectContaining({ name: "ChunkLoadError" }),
        });
        expect(authState()).toBe("loading");

        // Only once: later failures go on retrying quietly (a rethrow would fail these).
        await flush(30_000);
        await flush(30_000);
        expect(authState()).toBe("loading");
    });

    describe("actions", () => {
        afterEach(() => {
            vi.unstubAllGlobals();
            window.localStorage.clear();
        });

        /** Renders the provider and hands back the latest value of useAuth(). */
        async function renderWithActions(authModule: AuthModule) {
            const holder: { current: ReturnType<AuthModule["useAuth"]> | null } = {
                current: null,
            };
            function Capture() {
                const auth = authModule.useAuth();
                holder.current = auth;
                const state = auth.loading
                    ? "loading"
                    : auth.user
                      ? `signed-in:${auth.user.id}:${auth.role}`
                      : "signed-out";
                return <p data-testid="auth-state">{state}</p>;
            }

            render(
                <authModule.AuthProvider>
                    <Capture />
                </authModule.AuthProvider>
            );
            await flush();
            return () => holder.current!;
        }

        function failSupabaseDownload() {
            vi.doMock("@/lib/supabase", () => {
                throw new Error("Loading chunk 77 failed.");
            });
        }

        it("signs in through the lazily loaded client, then the SIGNED_IN event takes over", async () => {
            mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
            mocks.signInWithPassword.mockResolvedValue({ data: {}, error: null });
            mocks.getAuthMe.mockResolvedValue({ role: "admin" });
            const auth = await renderWithActions(await loadAuthModule());
            expect(authState()).toBe("signed-out");

            let result: { error: string | null } | undefined;
            await act(async () => {
                result = await auth().signIn("guest@example.com", "pw-123456");
            });

            expect(result).toEqual({ error: null });
            expect(mocks.signInWithPassword).toHaveBeenCalledWith({
                email: "guest@example.com",
                password: "pw-123456",
            });

            // auth-js reports the new session through the subscription made at mount.
            await act(async () => {
                authStateListener()("SIGNED_IN", SESSION);
            });
            await flush();
            expect(authState()).toBe("signed-in:user-1:admin");
            expect(mocks.getAuthMe).toHaveBeenCalledWith("access-token");
        });

        it("returns the message when the credentials are refused", async () => {
            mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
            mocks.signInWithPassword.mockResolvedValue({
                data: {},
                error: { message: "Invalid login credentials" },
            });
            const auth = await renderWithActions(await loadAuthModule());

            let result: { error: string | null } | undefined;
            await act(async () => {
                result = await auth().signIn("guest@example.com", "wrong");
            });

            expect(result).toEqual({ error: "Invalid login credentials" });
            expect(authState()).toBe("signed-out");
        });

        it("clears a stale local session before signing in", async () => {
            mocks.getSession
                .mockResolvedValueOnce({ data: { session: null }, error: null })
                .mockResolvedValueOnce({
                    data: { session: null },
                    error: {
                        name: "AuthApiError",
                        message: "Invalid Refresh Token: Refresh Token Not Found",
                        status: 400,
                    },
                });
            mocks.signInWithPassword.mockResolvedValue({ data: {}, error: null });
            const auth = await renderWithActions(await loadAuthModule());

            await act(async () => {
                await auth().signIn("guest@example.com", "pw-123456");
            });

            expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
            expect(mocks.signOut.mock.invocationCallOrder[0]).toBeLessThan(
                mocks.signInWithPassword.mock.invocationCallOrder[0]
            );
        });

        it("says so, instead of throwing, when supabase-js cannot be downloaded", async () => {
            failSupabaseDownload();
            const auth = await renderWithActions(await loadAuthModule());

            let signIn: { error: string | null } | undefined;
            let signUp: { error: string | null } | undefined;
            let resend: { error: string | null } | undefined;
            await act(async () => {
                signIn = await auth().signIn("guest@example.com", "pw-123456");
                signUp = await auth().signUp("guest@example.com", "pw-123456", "Guest");
                resend = await auth().resendConfirmation("guest@example.com");
            });

            for (const result of [signIn, signUp, resend]) {
                expect(result?.error).toMatch(/could not reach the sign-in service/i);
            }
            expect(mocks.signInWithPassword).not.toHaveBeenCalled();
            expect(mocks.signUp).not.toHaveBeenCalled();
            expect(mocks.resend).not.toHaveBeenCalled();
        });

        it("sends the confirmation link back to /auth/confirm for sign-up and resend", async () => {
            mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
            mocks.signUp.mockResolvedValue({ data: {}, error: null });
            mocks.resend.mockResolvedValue({ data: {}, error: null });
            const auth = await renderWithActions(await loadAuthModule());

            await act(async () => {
                await auth().signUp("new@example.com", "pw-123456", "New Guest");
                await auth().resendConfirmation("new@example.com");
            });

            const redirect = expect.stringContaining("/auth/confirm?flow=signup");
            expect(mocks.signUp).toHaveBeenCalledWith({
                email: "new@example.com",
                password: "pw-123456",
                options: { data: { full_name: "New Guest" }, emailRedirectTo: redirect },
            });
            expect(mocks.resend).toHaveBeenCalledWith({
                type: "signup",
                email: "new@example.com",
                options: { emailRedirectTo: redirect },
            });
        });

        it("signs out through the client, and the SIGNED_OUT event clears the state", async () => {
            mocks.getSession.mockResolvedValue({ data: { session: SESSION }, error: null });
            const auth = await renderWithActions(await loadAuthModule());
            expect(authState()).toBe("signed-in:user-1:user");

            await act(async () => {
                await auth().signOut();
            });
            expect(mocks.signOut).toHaveBeenCalledWith();

            await act(async () => {
                authStateListener()("SIGNED_OUT", null);
            });
            expect(authState()).toBe("signed-out");
        });

        it("drops the local session by hand when supabase-js cannot be downloaded", async () => {
            window.localStorage.setItem("sb-project-auth-token", "{}");
            window.localStorage.setItem("unrelated", "kept");
            failSupabaseDownload();
            const auth = await renderWithActions(await loadAuthModule());

            await act(async () => {
                await auth().signOut();
            });

            expect(window.localStorage.getItem("sb-project-auth-token")).toBeNull();
            expect(window.localStorage.getItem("unrelated")).toBe("kept");
            expect(authState()).toBe("signed-out");
        });

        it("goes ahead with Google sign-in when supabase-js cannot be downloaded", async () => {
            const assign = vi.fn();
            vi.stubGlobal("location", {
                origin: "https://www.onlyworkshops.com",
                hostname: "www.onlyworkshops.com",
                assign,
            });
            failSupabaseDownload();
            const auth = await renderWithActions(await loadAuthModule());

            let result: { error: string | null } | undefined;
            await act(async () => {
                result = await auth().signInWithGoogle("/booking?workshop=abc");
            });

            expect(result).toEqual({ error: null });
            expect(assign).toHaveBeenCalledTimes(1);
            const target = new URL(assign.mock.calls[0][0] as string);
            expect(target.origin + target.pathname).toBe(
                "https://www.onlyworkshops.com/api/auth/google"
            );
            expect(target.searchParams.get("next")).toBe("/booking?workshop=abc");
        });
    });

    it("unsubscribes and stops retrying on unmount", async () => {
        mocks.getSession.mockResolvedValue({ data: { session: null }, error: NETWORK_ERROR });

        await renderAuth(await loadAuthModule());
        cleanup();

        expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
        await flush(60_000);
        expect(mocks.getSession).toHaveBeenCalledTimes(1);
    });
});

describe("isNetworkSessionError", () => {
    it("recognises network failures, but never an invalid refresh token", async () => {
        const { isNetworkSessionError } = await loadAuthModule();

        expect(isNetworkSessionError(NETWORK_ERROR)).toBe(true);
        expect(isNetworkSessionError({ name: "AuthRetryableFetchError", status: 503 })).toBe(true);
        expect(isNetworkSessionError(new TypeError("Failed to fetch"))).toBe(true);
        expect(isNetworkSessionError(new TypeError("Load failed"))).toBe(true);
        expect(isNetworkSessionError({ name: "ChunkLoadError", message: "x" })).toBe(true);
        expect(
            isNetworkSessionError(new Error("wrapped", { cause: new TypeError("Failed to fetch") }))
        ).toBe(true);

        expect(
            isNetworkSessionError({ message: "Invalid Refresh Token: Refresh Token Not Found" })
        ).toBe(false);
        expect(isNetworkSessionError({ name: "AuthApiError", status: 400 })).toBe(false);
    });
});
