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

function getUserFacingAuthError(errorMessage: string) {
    const normalizedMessage = errorMessage.toLowerCase();
    if (
        normalizedMessage.includes("code verifier") ||
        normalizedMessage.includes("pkce") ||
        normalizedMessage.includes("auth flow was initiated")
    ) {
        return "Google sign-in expired. Please click Continue with Google again.";
    }

    return errorMessage;
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
    const oauthError =
        requestUrl.searchParams.get("error_description") || requestUrl.searchParams.get("error");

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
