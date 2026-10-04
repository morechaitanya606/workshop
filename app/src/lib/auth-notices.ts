/**
 * Fixed messages the auth pages may show because of a redirect.
 *
 * Redirects carry a short code (`?notice=link-expired`), never the text itself: the login
 * page used to render `?error=` verbatim, so anyone could link to it with "Your account is
 * locked, call +1-555-..." and have that appear on our page. Only strings defined here are
 * ever displayed.
 */

export const SIGN_IN_EXPIRED_MESSAGE =
    "Google sign-in expired. Please click Continue with Google again.";
export const SIGN_IN_CANCELLED_MESSAGE = "Sign-in was cancelled. Please try again.";
export const SIGN_IN_FAILED_MESSAGE = "Sign-in could not be completed. Please try again.";

/** Messages /api/auth/callback may put in `?error=`; anything else in that param is ignored. */
const KNOWN_SIGN_IN_ERRORS = new Set([
    SIGN_IN_EXPIRED_MESSAGE,
    SIGN_IN_CANCELLED_MESSAGE,
    SIGN_IN_FAILED_MESSAGE,
]);

export function getKnownSignInError(raw: string | null | undefined) {
    return raw && KNOWN_SIGN_IN_ERRORS.has(raw) ? raw : null;
}

export const AUTH_NOTICES = {
    "email-confirmed": {
        tone: "success",
        text: "Your email is confirmed. Log in to continue.",
    },
    "link-expired": {
        tone: "error",
        text: "That link has expired, was already used, or was opened in a different browser. Request a new one below.",
    },
    "password-updated": {
        tone: "success",
        text: "Your password has been updated. Log in with your new password.",
    },
} as const;

export type AuthNoticeCode = keyof typeof AUTH_NOTICES;

export function getAuthNotice(code: string | null | undefined) {
    return code && Object.prototype.hasOwnProperty.call(AUTH_NOTICES, code)
        ? AUTH_NOTICES[code as AuthNoticeCode]
        : null;
}

/** Auth error text from Supabase, rewritten where the raw message would confuse a visitor. */
export function getFriendlyAuthError(message: string) {
    const normalized = message.toLowerCase();

    if (normalized.includes("email not confirmed")) {
        return "Please confirm your email first. Use the link we sent you, or resend it below.";
    }
    if (normalized.includes("rate limit") || normalized.includes("for security purposes")) {
        return "Too many emails were requested. Please wait a minute and try again.";
    }
    if (normalized.includes("invalid login credentials")) {
        return "That email and password do not match. Check them, or reset your password.";
    }
    if (normalized.includes("auth session missing") || normalized.includes("session_not_found")) {
        return "Your reset link has expired. Request a new one to set your password.";
    }

    return message;
}

export function isEmailNotConfirmedError(message: string | null | undefined) {
    return Boolean(message && message.toLowerCase().includes("email not confirmed"));
}
