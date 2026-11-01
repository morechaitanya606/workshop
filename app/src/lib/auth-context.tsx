"use client";

import { createContext, useContext, useEffect, useState, useRef, ReactNode } from "react";
import { sanitizeInternalRedirect } from "@/lib/auth-origin";
import { getClientAppUrl } from "@/lib/client-url";
import type { User, Session } from "@supabase/supabase-js";
import { getPublicSupabaseConfig } from "@/lib/public-env";
import { getAuthMe } from "@/lib/api-client";

import { clearFavoritesCache } from "@/lib/favorites-cache";

type UserRole = "admin" | "host" | "user";

type BrowserSupabaseClient = (typeof import("./supabase"))["supabase"];

/** Same rule as `isSupabaseConfigured` in ./supabase, without loading supabase-js to learn it. */
const isSupabaseConfigured = getPublicSupabaseConfig() !== null;

let supabaseClientPromise: Promise<BrowserSupabaseClient> | null = null;

/**
 * supabase-js (auth, realtime, storage and the Buffer polyfill storage needs: about 57 KB
 * gzipped) is imported after hydration, not with every page's first-load JavaScript. Nothing on
 * a public page needs it sooner, and the server HTML is unchanged: it always rendered the auth
 * `loading` state, which lasts until the session is read below. Repeated calls share one import;
 * a failed one (a dropped connection) is forgotten so the next call tries again.
 */
function loadSupabaseClient() {
    if (!supabaseClientPromise) {
        supabaseClientPromise = import("./supabase")
            .then(({ supabase }) => supabase)
            .catch((error: unknown) => {
                supabaseClientPromise = null;
                throw error;
            });
    }
    return supabaseClientPromise;
}

function loadSupabaseClientOrNull() {
    return loadSupabaseClient().catch(() => null);
}

const AUTH_SERVICE_UNREACHABLE_MESSAGE =
    "We could not reach the sign-in service. Check your connection and try again.";

/**
 * Pauses between attempts to read the session, or its role, after a network failure; the last
 * one repeats. The browser's `online` event retries straight away.
 */
const SESSION_RETRY_DELAYS_MS = [2_000, 5_000, 10_000, 20_000, 30_000];

/** Failed downloads of supabase-js, while online, before the chunk-load recovery is told. */
const CHUNK_FAILURES_BEFORE_RECOVERY = 3;

interface AuthContextType {
    user: User | null;
    session: Session | null;
    role: UserRole;
    roleLoading: boolean;
    loading: boolean;
    signIn: (email: string, password: string) => Promise<{ error: string | null }>;
    signUp: (
        email: string,
        password: string,
        fullName: string
    ) => Promise<{ error: string | null }>;
    signInWithGoogle: (redirectPath?: string) => Promise<{ error: string | null }>;
    /** Sends the signup confirmation email again (Supabase allows one per address per minute). */
    resendConfirmation: (email: string) => Promise<{ error: string | null }>;
    signOut: () => Promise<void>;
}

/**
 * Where a confirmation link returns to. /auth/confirm verifies it and signs the visitor in;
 * `flow=signup` lets it say "email confirmed, log in" when the link is opened in another
 * browser. Must be allow-listed under Supabase > Authentication > URL Configuration.
 */
function getSignupConfirmRedirect() {
    return getClientAppUrl("/auth/confirm?flow=signup&next=/");
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    session: null,
    role: "user",
    roleLoading: true,
    loading: true,
    signIn: async () => ({ error: null }),
    signUp: async () => ({ error: null }),
    signInWithGoogle: async () => ({ error: null }),
    resendConfirmation: async () => ({ error: null }),
    signOut: async () => {},
});

function getErrorMessage(error: unknown) {
    if (typeof error === "string") return error;
    if (error && typeof error === "object" && "message" in error) {
        return String((error as { message?: unknown }).message || "");
    }
    return "";
}

function isInvalidRefreshTokenError(error: unknown) {
    const message = getErrorMessage(error).toLowerCase();
    return message.includes("invalid refresh token") || message.includes("refresh token not found");
}

const NETWORK_ERROR_MESSAGE_PATTERN =
    /failed to fetch|fetch failed|networkerror|network error|network request failed|load failed|loading chunk|failed to load chunk|dynamically imported module|timed out|timeout/i;

/**
 * An error that says the session could not be read right now (no connection, a gateway error,
 * the supabase-js chunk failing to download), not that the visitor is signed out. auth-js names
 * its own retryable failures AuthRetryableFetchError: status 0 when no answer came back, 502-504
 * from a gateway.
 */
export function isNetworkSessionError(error: unknown, depth = 0): boolean {
    if (isInvalidRefreshTokenError(error)) return false;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return true;

    if (error && typeof error === "object") {
        const { name, status, cause } = error as {
            name?: unknown;
            status?: unknown;
            cause?: unknown;
        };
        if (name === "AuthRetryableFetchError" || name === "ChunkLoadError") return true;
        if (typeof status === "number" && (status === 0 || status >= 500)) return true;
        // A wrapper error (`new Error(message, { cause })`) is judged by what it wraps.
        if (cause && depth < 3 && isNetworkSessionError(cause, depth + 1)) return true;
    }

    return NETWORK_ERROR_MESSAGE_PATTERN.test(getErrorMessage(error));
}

/** An answer of "no" (the token is not accepted), as opposed to no answer at all. */
function isDefiniteDenial(error: unknown) {
    const status =
        error && typeof error === "object" ? (error as { status?: unknown }).status : undefined;
    return status === 401 || status === 403;
}

function clearSupabaseAuthStorage() {
    if (typeof window === "undefined") {
        return;
    }

    const clearStorage = (storage: Storage) => {
        for (let index = storage.length - 1; index >= 0; index -= 1) {
            const key = storage.key(index);
            if (key?.startsWith("sb-") || key?.includes("supabase.auth.token")) {
                storage.removeItem(key);
            }
        }
    };

    try {
        clearStorage(window.localStorage);
    } catch {
        // Storage can be unavailable in restricted browser contexts.
    }

    try {
        clearStorage(window.sessionStorage);
    } catch {
        // Storage can be unavailable in restricted browser contexts.
    }

    try {
        document.cookie.split(";").forEach((cookie) => {
            const name = cookie.split("=")[0]?.trim();
            if (!name?.startsWith("sb-")) {
                return;
            }

            document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
            if (window.location.hostname.endsWith("onlyworkshops.com")) {
                document.cookie = `${name}=; Max-Age=0; path=/; domain=.onlyworkshops.com; SameSite=Lax`;
            }
        });
    } catch {
        // Cookie writes can fail in unusual browser contexts.
    }
}

async function clearStaleSupabaseSession(client: BrowserSupabaseClient) {
    clearFavoritesCache();

    try {
        await client.auth.signOut({ scope: "local" });
    } catch {
        // If the refresh token is already invalid, manual storage cleanup below is enough.
    }

    clearSupabaseAuthStorage();
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [role, setRole] = useState<UserRole>("user");
    const [roleLoading, setRoleLoading] = useState(isSupabaseConfigured);
    const [loading, setLoading] = useState(isSupabaseConfigured);

    const userIdRef = useRef<string | null>(null);

    useEffect(() => {
        if (!isSupabaseConfigured) {
            setLoading(false);
            setRoleLoading(false);
            return;
        }

        let cancelled = false;
        let roleRequestId = 0;
        let subscription: { unsubscribe: () => void } | null = null;
        let retryTimer: ReturnType<typeof setTimeout> | null = null;
        let retryCount = 0;
        let isWaitingToRetry = false;
        let importFailuresWhileOnline = 0;
        // The visitor whose role the server has answered for, so a failed re-check keeps it.
        let confirmedRoleUserId: string | null = null;

        /**
         * The role, or null when the server could not be asked (no connection, a timeout, a 5xx).
         * Only an answer may change what a visitor is allowed to see: an admin on a weak
         * connection used to be told "not allowed" because a failed check counted as "visitor".
         */
        const loadRole = async (accessToken: string): Promise<UserRole | null> => {
            try {
                const result = await getAuthMe(accessToken);
                return result.role === "admin" || result.role === "host" ? result.role : "user";
            } catch (error) {
                return isDefiniteDenial(error) ? "user" : null;
            }
        };

        const stopRetrying = () => {
            isWaitingToRetry = false;
            if (retryTimer !== null) {
                clearTimeout(retryTimer);
                retryTimer = null;
            }
        };

        const resetSession = () => {
            stopRetrying();
            roleRequestId += 1;
            userIdRef.current = null;
            confirmedRoleUserId = null;
            setSession(null);
            setUser(null);
            setRole("user");
            setLoading(false);
            setRoleLoading(false);
        };

        const applySession = (nextSession: Session | null) => {
            stopRetrying();
            const userId = nextSession?.user?.id ?? null;
            const isSameUser = userId === userIdRef.current;
            userIdRef.current = userId;

            setSession(nextSession);
            setUser(nextSession?.user ?? null);
            setLoading(false);

            if (!nextSession?.access_token) {
                roleRequestId += 1;
                confirmedRoleUserId = null;
                retryCount = 0;
                setRole("user");
                setRoleLoading(false);
                return;
            }

            const currentRequestId = ++roleRequestId;
            if (!isSameUser) {
                confirmedRoleUserId = null;
                setRoleLoading(true);
            }

            void loadRole(nextSession.access_token).then((nextRole) => {
                if (cancelled || currentRequestId !== roleRequestId) {
                    return;
                }

                if (nextRole === null) {
                    // Not answered. A role confirmed earlier for this visitor stands; otherwise
                    // the pages that need the role keep waiting while it is asked for again (a
                    // fresh session read each time, so a token that expired meanwhile is renewed).
                    if (confirmedRoleUserId !== userId) retryLater();
                    return;
                }

                confirmedRoleUserId = userId;
                retryCount = 0;
                setRole(nextRole);
                setRoleLoading(false);
            });
        };

        const retryNow = () => {
            stopRetrying();
            void loadInitialSession();
        };

        // A session refresh that failed for lack of network says nothing about whether the
        // visitor is signed in, and signing them out here bounced a customer mid-booking to
        // /auth/login. Stay in `loading` and read the session again: as soon as the browser
        // says it is back online, otherwise after a growing pause.
        const retryLater = () => {
            stopRetrying();
            isWaitingToRetry = true;
            const delay =
                SESSION_RETRY_DELAYS_MS[Math.min(retryCount, SESSION_RETRY_DELAYS_MS.length - 1)];
            retryCount += 1;
            retryTimer = setTimeout(retryNow, delay);
        };

        const onOnline = () => {
            if (isWaitingToRetry) retryNow();
        };

        const handleSessionError = async (error: unknown, client: BrowserSupabaseClient | null) => {
            if (client && isInvalidRefreshTokenError(error)) {
                await clearStaleSupabaseSession(client);
            } else if (isNetworkSessionError(error)) {
                retryLater();
                return;
            }
            if (!cancelled) resetSession();
        };

        const loadInitialSession = async () => {
            let client: BrowserSupabaseClient | null = null;
            try {
                try {
                    client = await loadSupabaseClient();
                    importFailuresWhileOnline = 0;
                } catch (error) {
                    // Online and still failing: most likely a tab open across a deploy, whose
                    // old chunk is gone. Hand it to the root layout's chunk-load recovery
                    // (which reloads, at most twice in five minutes) and keep retrying meanwhile.
                    if (navigator.onLine !== false) importFailuresWhileOnline += 1;
                    if (importFailuresWhileOnline === CHUNK_FAILURES_BEFORE_RECOVERY) {
                        setTimeout(() => {
                            throw error;
                        }, 0);
                    }
                    throw error;
                }
                if (cancelled) return;

                if (!subscription) {
                    subscription = client.auth.onAuthStateChange((event, nextSession) => {
                        // The first session comes from getSession() below. auth-js reports
                        // INITIAL_SESSION as null when its token refresh fails for lack of
                        // network, which would sign the visitor out, and applying it as well
                        // only repeated the role request.
                        if (cancelled || event === "INITIAL_SESSION") return;
                        applySession(nextSession);
                    }).data.subscription;
                }

                const {
                    data: { session: initialSession },
                    error,
                } = await client.auth.getSession();
                if (cancelled) return;

                if (error) {
                    await handleSessionError(error, client);
                    return;
                }

                applySession(initialSession);
            } catch (error) {
                if (cancelled) return;
                await handleSessionError(error, client);
            }
        };

        window.addEventListener("online", onOnline);
        void loadInitialSession();

        return () => {
            cancelled = true;
            roleRequestId += 1;
            stopRetrying();
            window.removeEventListener("online", onOnline);
            subscription?.unsubscribe();
        };
    }, []);

    const clearInvalidSessionBeforeAuth = async (client: BrowserSupabaseClient) => {
        try {
            const { error } = await client.auth.getSession();
            if (isInvalidRefreshTokenError(error)) {
                await clearStaleSupabaseSession(client);
            }
        } catch (error) {
            if (isInvalidRefreshTokenError(error)) {
                await clearStaleSupabaseSession(client);
            }
        }
    };

    const signIn = async (email: string, password: string) => {
        if (!isSupabaseConfigured) {
            return {
                error: "Authentication is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY).",
            };
        }
        const client = await loadSupabaseClientOrNull();
        if (!client) return { error: AUTH_SERVICE_UNREACHABLE_MESSAGE };
        await clearInvalidSessionBeforeAuth(client);
        const { error } = await client.auth.signInWithPassword({ email, password });
        return { error: error?.message ?? null };
    };

    const signUp = async (email: string, password: string, fullName: string) => {
        if (!isSupabaseConfigured) {
            return {
                error: "Authentication is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY).",
            };
        }
        const client = await loadSupabaseClientOrNull();
        if (!client) return { error: AUTH_SERVICE_UNREACHABLE_MESSAGE };
        await clearInvalidSessionBeforeAuth(client);
        const { error } = await client.auth.signUp({
            email,
            password,
            options: {
                data: { full_name: fullName },
                emailRedirectTo: getSignupConfirmRedirect(),
            },
        });
        return { error: error?.message ?? null };
    };

    const resendConfirmation = async (email: string) => {
        if (!isSupabaseConfigured) {
            return { error: "Authentication is not configured." };
        }
        const client = await loadSupabaseClientOrNull();
        if (!client) return { error: AUTH_SERVICE_UNREACHABLE_MESSAGE };
        const { error } = await client.auth.resend({
            type: "signup",
            email,
            options: { emailRedirectTo: getSignupConfirmRedirect() },
        });
        return { error: error?.message ?? null };
    };

    const signInWithGoogle = async (redirectPath = "/") => {
        if (!isSupabaseConfigured) {
            return {
                error: "Authentication is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY).",
            };
        }

        // Best effort: the Google flow runs on the server, so it goes ahead even if the
        // client could not be loaded to clear a stale local session first.
        const client = await loadSupabaseClientOrNull();
        if (client) await clearInvalidSessionBeforeAuth(client);
        // Same parse-and-compare rule as the server routes; see sanitizeInternalRedirect.
        // A startsWith("/") test alone accepts "//evil.example".
        const safeRedirectPath = sanitizeInternalRedirect(redirectPath);
        const googleUrl = new URL("/api/auth/google", window.location.origin);
        googleUrl.searchParams.set("next", safeRedirectPath);
        window.location.assign(googleUrl.toString());
        return { error: null };
    };

    const signOut = async () => {
        if (!isSupabaseConfigured) return;
        clearFavoritesCache();
        const client = await loadSupabaseClientOrNull();
        if (client) {
            await client.auth.signOut();
            return;
        }

        // Only reachable if supabase-js never loaded: drop the local session by hand.
        clearSupabaseAuthStorage();
        userIdRef.current = null;
        setSession(null);
        setUser(null);
        setRole("user");
        setLoading(false);
        setRoleLoading(false);
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                session,
                role,
                roleLoading,
                loading,
                signIn,
                signUp,
                signInWithGoogle,
                resendConfirmation,
                signOut,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
