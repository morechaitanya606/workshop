export const COOKIE_CONSENT_KEY = "cookie_consent";
export const COOKIE_CONSENT_EVENT = "onlyworkshops:cookie-consent";

export type CookieConsent = "accepted" | "declined";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

/** Maps a stored value to a consent state. `"true"` is what the first version of the banner wrote. */
export function parseCookieConsent(raw: string | null | undefined): CookieConsent | null {
    if (raw === "accepted" || raw === "true") return "accepted";
    if (raw === "declined") return "declined";
    return null;
}

function getBrowserStorage(): StorageLike | null {
    try {
        return typeof window === "undefined" ? null : window.localStorage;
    } catch {
        // Accessing localStorage itself can throw (blocked site data, some private modes).
        return null;
    }
}

export function readCookieConsent(storage: StorageLike | null = getBrowserStorage()) {
    if (!storage) return null;

    try {
        return parseCookieConsent(storage.getItem(COOKIE_CONSENT_KEY));
    } catch {
        return null;
    }
}

/** Persists the choice (best effort) and tells listeners in this tab. Returns false if it could not be saved. */
export function writeCookieConsent(
    consent: CookieConsent,
    storage: StorageLike | null = getBrowserStorage()
) {
    let persisted = false;

    if (storage) {
        try {
            storage.setItem(COOKIE_CONSENT_KEY, consent);
            persisted = true;
        } catch {
            // Safari private mode and full quotas throw on write; the in-memory choice still applies.
        }
    }

    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(COOKIE_CONSENT_EVENT, { detail: consent }));
    }

    return persisted;
}
