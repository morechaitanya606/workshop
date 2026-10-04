import type { NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import * as Sentry from "@sentry/nextjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { applyAuthCookies, getAuthAppOrigin, sanitizeInternalRedirect } from "@/lib/auth-origin";
import { getUserRole } from "@/lib/api-auth";
import type { Database } from "@/lib/database.types";
import { getPublicSupabaseConfig } from "@/lib/env";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
    SIGN_IN_CANCELLED_MESSAGE,
    SIGN_IN_EXPIRED_MESSAGE,
    SIGN_IN_FAILED_MESSAGE,
} from "@/lib/auth-notices";

/**
 * The login page shows `?error=` only when it is one of these fixed messages (see
 * auth-notices.ts). Copying the provider's `error_description` (which anyone can put in a link
 * to this callback) into the redirect would let an attacker write arbitrary text onto our login
 * page -- "Your account is locked, call +1-555-..." -- so the raw value only classifies.
 */

function getUserFacingAuthError(errorMessage: string) {
    const normalizedMessage = errorMessage.toLowerCase();
    if (
        normalizedMessage.includes("code verifier") ||
        normalizedMessage.includes("pkce") ||
        normalizedMessage.includes("auth flow was initiated")
    ) {
        return SIGN_IN_EXPIRED_MESSAGE;
    }

    if (normalizedMessage.includes("access_denied") || normalizedMessage.includes("cancel")) {
        return SIGN_IN_CANCELLED_MESSAGE;
    }

    return SIGN_IN_FAILED_MESSAGE;
}

function createRedirectResponse(
    request: Request,
    url: URL,
    cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }> = []
) {
    return applyAuthCookies(request, NextResponse.redirect(url), cookiesToSet);
}

function redirectToLoginWithError(
    request: Request,
    next: string,
    errorMessage: string,
    cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }> = []
) {
    const loginUrl = new URL("/auth/login", getAuthAppOrigin(request));
    loginUrl.searchParams.set("redirect", next);
    loginUrl.searchParams.set("error", getUserFacingAuthError(errorMessage));
    return createRedirectResponse(request, loginUrl, cookiesToSet);
}

export async function GET(request: NextRequest) {
    const limited = await enforceRateLimit(request, "auth", "api-auth-callback");
    if (!limited.ok) return limited.response;

    const requestUrl = new URL(request.url);
    const code = requestUrl.searchParams.get("code");
    const appOrigin = getAuthAppOrigin(request);
    const next = sanitizeInternalRedirect(requestUrl.searchParams.get("next"), appOrigin);
    // Both params are classified, never echoed (see getUserFacingAuthError).
    const oauthError = [
        requestUrl.searchParams.get("error"),
        requestUrl.searchParams.get("error_code"),
        requestUrl.searchParams.get("error_description"),
    ]
        .filter(Boolean)
        .join(" ");

    if (oauthError) {
        return redirectToLoginWithError(request, next, oauthError);
    }

    const cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }> = [];

    if (code) {
        const cookieStore = await cookies();
        const supabasePublicConfig = getPublicSupabaseConfig();
        if (!supabasePublicConfig) {
            return createRedirectResponse(request, new URL(next, getAuthAppOrigin(request)));
        }

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

        try {
            const { data, error } = await supabase.auth.exchangeCodeForSession(code);

            if (error) {
                return redirectToLoginWithError(request, next, error.message, cookiesToSet);
            }

            if (!error && data?.user) {
                const role = await getUserRole(data.user.id);

                if (role === "admin") {
                    return createRedirectResponse(
                        request,
                        new URL("/admin/dashboard", getAuthAppOrigin(request)),
                        cookiesToSet
                    );
                }
            }
        } catch (err) {
            Sentry.captureException(err, {
                tags: {
                    layer: "auth",
                    route: "auth_callback",
                },
                extra: {
                    next,
                    hasCode: Boolean(code),
                },
            });
            return redirectToLoginWithError(
                request,
                next,
                "Google sign-in could not be completed. Please try again.",
                cookiesToSet
            );
        }
    }

    return createRedirectResponse(request, new URL(next, getAuthAppOrigin(request)), cookiesToSet);
}
