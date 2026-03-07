"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "./supabase";

type UserRole = "admin" | "user";

interface AuthContextType {
    user: User | null;
    session: Session | null;
    role: UserRole;
    roleLoading: boolean;
    loading: boolean;
    signIn: (email: string, password: string) => Promise<{ error: string | null }>;
    signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>;
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
    signOut: async () => { },
});

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [role, setRole] = useState<UserRole>("user");
    const [roleLoading, setRoleLoading] = useState(isSupabaseConfigured);
    const [loading, setLoading] = useState(isSupabaseConfigured);

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
                const response = await fetch("/api/auth/me", {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                    cache: "no-store",
                });

                if (!response.ok) {
                    return "user" as UserRole;
                }

                const result = await response.json();
                return result.role === "admin" ? "admin" : "user";
            } catch {
                return "user" as UserRole;
            }
        };

        const applySession = (nextSession: Session | null) => {
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
            setRoleLoading(true);
            void loadRole(nextSession.access_token).then((nextRole) => {
                if (cancelled || currentRequestId !== roleRequestId) {
                    return;
                }
                setRole(nextRole);
                setRoleLoading(false);
            });
        };

        // Get initial session
        supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
            if (cancelled) return;
            applySession(initialSession);
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

    const signIn = async (email: string, password: string) => {
        if (!isSupabaseConfigured) {
            return {
                error:
                    "Authentication is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY).",
            };
        }
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { error: error?.message ?? null };
    };

    const signUp = async (email: string, password: string, fullName: string) => {
        if (!isSupabaseConfigured) {
            return {
                error:
                    "Authentication is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY).",
            };
        }
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
                error:
                    "Authentication is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY).",
            };
        }

        const safeRedirectPath = redirectPath.startsWith("/") ? redirectPath : "/";
        const { error } = await supabase.auth.signInWithOAuth({
            provider: "google",
            options: {
                redirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(safeRedirectPath)}`,
            },
        });
        return { error: error?.message ?? null };
    };

    const signOut = async () => {
        if (!isSupabaseConfigured) return;
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
