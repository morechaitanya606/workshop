import { describe, expect, it } from "vitest";
import {
    SIGN_IN_CANCELLED_MESSAGE,
    getAuthNotice,
    getFriendlyAuthError,
    getKnownSignInError,
    isEmailNotConfirmedError,
} from "@/lib/auth-notices";

describe("auth notices", () => {
    it("shows only the sign-in errors this app wrote, never arbitrary ?error= text", () => {
        expect(getKnownSignInError(SIGN_IN_CANCELLED_MESSAGE)).toBe(SIGN_IN_CANCELLED_MESSAGE);
        expect(getKnownSignInError("Your account is locked. Call +1-555-0100.")).toBeNull();
        expect(getKnownSignInError(null)).toBeNull();
    });

    it("resolves known notice codes and nothing else, including prototype keys", () => {
        expect(getAuthNotice("email-confirmed")?.tone).toBe("success");
        expect(getAuthNotice("link-expired")?.tone).toBe("error");
        for (const code of ["unknown", "__proto__", "toString", "", null]) {
            expect(getAuthNotice(code)).toBeNull();
        }
    });

    it("rewrites confusing Supabase errors and passes others through", () => {
        expect(getFriendlyAuthError("Email not confirmed")).toMatch(/confirm your email/i);
        expect(getFriendlyAuthError("email rate limit exceeded")).toMatch(/wait a minute/i);
        expect(
            getFriendlyAuthError(
                "For security purposes, you can only request this after 42 seconds."
            )
        ).toMatch(/wait a minute/i);
        expect(getFriendlyAuthError("Auth session missing!")).toMatch(/expired/i);
        expect(getFriendlyAuthError("Invalid login credentials")).toMatch(/do not match/i);
        expect(getFriendlyAuthError("Something new")).toBe("Something new");
    });

    it("detects the unconfirmed-email sign-in error", () => {
        expect(isEmailNotConfirmedError("Email not confirmed")).toBe(true);
        expect(isEmailNotConfirmedError("Invalid login credentials")).toBe(false);
        expect(isEmailNotConfirmedError(null)).toBe(false);
    });
});
