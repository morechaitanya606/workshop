"use client";

import { createContext, useContext, useEffect, useState, useRef, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "./supabase";
import { getAuthMe } from "@/lib/api-client";

import { clearFavoritesCache } from "@/components/WorkshopCard";

type UserRole = "admin" | "host" | "user";

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
    signOut: () => Promise<void>;
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
        });
    } catch {
        // Cookie writes can fail in unusual browser contexts.
    }
}

async function clearStaleSupabaseSession() {
    clearFavoritesCache();

    try {
        await supabase.auth.signOut({ scope: "local" });
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

        const loadRole = async (accessToken: string) => {
            try {
                const result = await getAuthMe(accessToken);
                return result.role === "admin" || result.role === "host" ? result.role : "user";
            } catch {
                return "user" as UserRole;
            }
        };

        const resetSession = () => {
            roleRequestId += 1;
            userIdRef.current = null;
            setSession(null);
            setUser(null);
            setRole("user");
            setLoading(false);
            setRoleLoading(false);
        };

        const applySession = (nextSession: Session | null) => {
            const isSameUser = nextSession?.user?.id === userIdRef.current;
            userIdRef.current = nextSession?.user?.id ?? null;

            setSession(nextSession);
            setUser(nextSession?.user ?? null);
            setLoading(false);

            if (!nextSession?.access_token) {
                roleRequestId += 1;
                setRole("user");
                setRoleLoading(false);
                return;
            }

            const currentRequestId = ++roleRequestId;
            if (!isSameUser) {
                setRoleLoading(true);
            }

            void loadRole(nextSession.access_token).then((nextRole) => {
                if (cancelled || currentRequestId !== roleRequestId) {
                    return;
                }
                setRole(nextRole);
                setRoleLoading(false);
            });
        };

        // Get initial session
        supabase.auth
            .getSession()
            .then(async ({ data: { session: initialSession }, error }) => {
                if (cancelled) return;

                if (error) {
                    if (isInvalidRefreshTokenError(error)) {
                        await clearStaleSupabaseSession();
                    }
                    resetSession();
                    return;
                }

                applySession(initialSession);
            })
            .catch(async (error) => {
                if (cancelled) return;

                if (isInvalidRefreshTokenError(error)) {
                    await clearStaleSupabaseSession();
                }
                resetSession();
            });

        // Listen for auth state changes
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, nextSession) => {
            if (cancelled) return;
            applySession(nextSession);
        });

        return () => {
            cancelled = true;
            roleRequestId += 1;
            subscription.unsubscribe();
        };
    }, []);

    const clearInvalidSessionBeforeAuth = async () => {
        try {
            const { error } = await supabase.auth.getSession();
            if (isInvalidRefreshTokenError(error)) {
                await clearStaleSupabaseSession();
            }
        } catch (error) {
            if (isInvalidRefreshTokenError(error)) {
                await clearStaleSupabaseSession();
            }
        }
    };

    const signIn = async (email: string, password: string) => {
        if (!isSupabaseConfigured) {
            return {
                error: "Authentication is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY).",
            };
        }
        await clearInvalidSessionBeforeAuth();
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { error: error?.message ?? null };
    };

    const signUp = async (email: string, password: string, fullName: string) => {
        if (!isSupabaseConfigured) {
            return {
                error: "Authentication is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY).",
            };
        }
        await clearInvalidSessionBeforeAuth();
        const { error } = await supabase.auth.signUp({
            email,
            password,
            options: { data: { full_name: fullName } },
        });
        return { error: error?.message ?? null };
    };

    const signInWithGoogle = async (redirectPath = "/") => {
        if (!isSupabaseConfigured) {
            return {
                error: "Authentication is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY).",
            };
        }

        await clearInvalidSessionBeforeAuth();
        const safeRedirectPath = redirectPath.startsWith("/") ? redirectPath : "/";
        const googleUrl = new URL("/api/auth/google", window.location.origin);
        googleUrl.searchParams.set("next", safeRedirectPath);
        window.location.assign(googleUrl.toString());
        return { error: null };
    };

    const signOut = async () => {
        if (!isSupabaseConfigured) return;
        clearFavoritesCache();
        await supabase.auth.signOut();
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
                signOut,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
