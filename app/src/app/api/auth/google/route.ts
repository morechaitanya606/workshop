import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { applyAuthCookies, getAuthAppOrigin } from "@/lib/auth-origin";
import type { Database } from "@/lib/database.types";
import { getPublicSupabaseConfig } from "@/lib/env";

function sanitizeRedirect(raw: string | null): string {
    if (!raw) return "/";
    if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/";
    return raw;
}

function redirectToLoginWithError(request: Request, next: string, errorMessage: string) {
    const loginUrl = new URL("/auth/login", getAuthAppOrigin(request));
    loginUrl.searchParams.set("redirect", next);
    loginUrl.searchParams.set("error", errorMessage);
    return NextResponse.redirect(loginUrl);
}

export async function GET(request: Request) {
    const requestUrl = new URL(request.url);
    const next = sanitizeRedirect(
        requestUrl.searchParams.get("next") || requestUrl.searchParams.get("redirect")
    );
    const supabasePublicConfig = getPublicSupabaseConfig();

    if (!supabasePublicConfig) {
        return redirectToLoginWithError(
            request,
            next,
            "Authentication is not configured. Please contact support."
        );
    }

    const cookieStore = await cookies();
    const cookiesToSet: {
        name: string;
        value: string;
        options: CookieOptions;
    }[] = [];

    const supabase = createServerClient<Database>(
        supabasePublicConfig.url,
        supabasePublicConfig.key,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll();
                },
                setAll(nextCookies) {
                    cookiesToSet.push(...nextCookies);
                },
            },
        }
    );

    const callbackUrl = new URL("/auth/callback", getAuthAppOrigin(request));
    callbackUrl.searchParams.set("next", next);

    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
            redirectTo: callbackUrl.toString(),
        },
    });

    if (error || !data.url) {
        return redirectToLoginWithError(
            request,
            next,
            error?.message || "Google sign-in could not be started. Please try again."
        );
    }

    return applyAuthCookies(request, NextResponse.redirect(data.url), cookiesToSet);
}
