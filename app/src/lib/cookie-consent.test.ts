import { describe, expect, it } from "vitest";
import {
    COOKIE_CONSENT_KEY,
    parseCookieConsent,
    readCookieConsent,
    writeCookieConsent,
} from "./cookie-consent";

function memoryStorage(initial: Record<string, string> = {}) {
    const data = new Map(Object.entries(initial));
    return {
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => {
            data.set(key, value);
        },
    };
}

describe("parseCookieConsent", () => {
    it("understands the current and legacy values", () => {
        expect(parseCookieConsent("accepted")).toBe("accepted");
        expect(parseCookieConsent("true")).toBe("accepted");
        expect(parseCookieConsent("declined")).toBe("declined");
    });

    it("treats anything else as undecided", () => {
        expect(parseCookieConsent(null)).toBeNull();
        expect(parseCookieConsent("")).toBeNull();
        expect(parseCookieConsent("false")).toBeNull();
    });
});

describe("readCookieConsent / writeCookieConsent", () => {
    it("round-trips through storage", () => {
        const storage = memoryStorage();
        expect(readCookieConsent(storage)).toBeNull();

        expect(writeCookieConsent("declined", storage)).toBe(true);
        expect(readCookieConsent(storage)).toBe("declined");
        expect(storage.getItem(COOKIE_CONSENT_KEY)).toBe("declined");
    });

    it("does not throw when storage is unavailable or throws", () => {
        const throwing = {
            getItem: () => {
                throw new Error("denied");
            },
            setItem: () => {
                throw new Error("quota");
            },
        };

        expect(readCookieConsent(null)).toBeNull();
        expect(readCookieConsent(throwing)).toBeNull();
        expect(writeCookieConsent("accepted", throwing)).toBe(false);
        expect(writeCookieConsent("accepted", null)).toBe(false);
    });
});
