import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import * as Sentry from "@sentry/nextjs";
import { cookies } from "next/headers";
import { applyAuthCookies, getAuthAppOrigin, sanitizeInternalRedirect } from "@/lib/auth-origin";
import type { AuthNoticeCode } from "@/lib/auth-notices";
import type { Database } from "@/lib/database.types";
import { getPublicSupabaseConfig } from "@/lib/env";
import { enforceRateLimit } from "@/lib/rate-limit";

/**
 * Landing route for every link in an auth email: confirm signup, reset password, invite,
 * magic link and email change. Served at /auth/confirm (see src/app/auth/confirm/route.ts).
 *
 * Two link shapes arrive here:
 *   - `?token_hash=...&type=...` from the templates in supabase/templates. Verified
 *     server-side with verifyOtp, so the link works in ANY browser or device -- the reason
 *     to use these templates.
 *   - `?code=...` when the dashboard still uses Supabase's default `{{ .ConfirmationURL }}`
 *     templates (PKCE). That code can only be exchanged by the browser that asked for the
 *     email, because the verifier lives in its cookies.
 * `flow` (recovery | signup) is set by the app on its redirect URLs so a failed `code` link
 * still lands on the right page with the right explanation.
 */

type PendingCookie = { name: string; value: string; options?: CookieOptions };

const EMAIL_OTP_TYPES: ReadonlySet<EmailOtpType> = new Set<EmailOtpType>([
    "signup",
    "invite",
    "magiclink",
    "recovery",
    "email_change",
    "email",
]);

/** Links that end with the visitor choosing a password. */
const SET_PASSWORD_TYPES: ReadonlySet<EmailOtpType> = new Set<EmailOtpType>(["recovery", "invite"]);

function isEmailOtpType(value: string | null): value is EmailOtpType {
    return value !== null && EMAIL_OTP_TYPES.has(value as EmailOtpType);
}

function redirectTo(request: Request, path: string, cookiesToSet: PendingCookie[] = []) {
    const url = new URL(path, getAuthAppOrigin(request));
    return applyAuthCookies(request, NextResponse.redirect(url), cookiesToSet);
}

function noticeRedirect(request: Request, page: string, notice: AuthNoticeCode) {
    return redirectTo(request, `${page}?notice=${notice}`);
}

/** Where a link that could not be used should send the visitor to try again. */
function retryPage(isPasswordFlow: boolean) {
    return isPasswordFlow ? "/auth/forgot-password" : "/auth/login";
}

export async function GET(request: NextRequest) {
    const limited = await enforceRateLimit(request, "auth", "api-auth-confirm");
    if (!limited.ok) return limited.response;

    const params = new URL(request.url).searchParams;
    const appOrigin = getAuthAppOrigin(request);
    const tokenHash = params.get("token_hash");
    const rawType = params.get("type");
    const code = params.get("code");
    const flow = params.get("flow");
    const next = sanitizeInternalRedirect(params.get("next"), appOrigin);

    const otpType = isEmailOtpType(rawType) ? rawType : null;
    const isPasswordFlow =
        flow === "recovery" || (otpType !== null && SET_PASSWORD_TYPES.has(otpType));

    // Supabase redirects here with ?error=access_denied&error_code=otp_expired when the link
    // is stale. The description is attacker-controllable, so it is never shown.
    if (params.get("error") || params.get("error_code")) {
        return noticeRedirect(request, retryPage(isPasswordFlow), "link-expired");
    }

    const config = getPublicSupabaseConfig();
    if (!config || (!tokenHash && !code)) {
        return redirectTo(request, "/auth/login");
    }

    const cookieStore = await cookies();
    const cookiesToSet: PendingCookie[] = [];
    const supabase = createServerClient<Database>(config.url, config.key, {
        cookies: {
            getAll() {
                return cookieStore.getAll();
            },
            setAll(nextCookies) {
                cookiesToSet.push(...nextCookies);
            },
        },
    });

    // A set-password link always lands on the reset page, whatever `next` says, so a link
    // cannot be bent into skipping the step it exists for.
    const destination = isPasswordFlow
        ? "/auth/reset-password"
        : otpType === "email_change"
          ? "/profile"
          : next;

    try {
        if (tokenHash) {
            if (!otpType) {
                return noticeRedirect(request, "/auth/login", "link-expired");
            }

            const { error } = await supabase.auth.verifyOtp({
                type: otpType,
                token_hash: tokenHash,
            });
            if (error) {
                return noticeRedirect(request, retryPage(isPasswordFlow), "link-expired");
            }

            return redirectTo(request, destination, cookiesToSet);
        }

        const { error } = await supabase.auth.exchangeCodeForSession(code!);
        if (error) {
            // Supabase confirms the address BEFORE redirecting with the code, so a signup
            // link that cannot be exchanged (other browser, verifier gone) still confirmed
            // the email: say so and let them log in.
            if (flow === "signup") {
                return noticeRedirect(request, "/auth/login", "email-confirmed");
            }
            return noticeRedirect(request, retryPage(isPasswordFlow), "link-expired");
        }

        return redirectTo(request, destination, cookiesToSet);
    } catch (error) {
        Sentry.captureException(error, {
            tags: { layer: "auth", route: "auth_confirm" },
            extra: {
                hasTokenHash: Boolean(tokenHash),
                hasCode: Boolean(code),
                type: rawType,
                flow,
            },
        });
        return noticeRedirect(request, retryPage(isPasswordFlow), "link-expired");
    }
}
