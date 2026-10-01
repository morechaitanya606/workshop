"use client";

import { useEffect } from "react";
import { startAnalytics, stopAnalytics } from "@/lib/analytics";
import { COOKIE_CONSENT_EVENT, readCookieConsent, type CookieConsent } from "@/lib/cookie-consent";
import { publicEnv } from "@/lib/env";

/**
 * Starts PostHog once (and only once) the visitor has accepted cookies.
 *
 * This always renders its children directly, whatever the configuration. Swapping a Fragment for
 * a provider component after mount changes the element type at the root of the tree and makes
 * React remount every page below it, so initialisation lives purely in an effect and the library
 * is imported lazily from `@/lib/analytics`.
 */
export default function AnalyticsProvider({ children }: { children: React.ReactNode }) {
    useEffect(() => {
        if (!publicEnv.NEXT_PUBLIC_POSTHOG_KEY) {
            return;
        }

        const apply = (consent: CookieConsent | null) => {
            if (consent === "accepted") {
                void startAnalytics();
            } else if (consent === "declined") {
                stopAnalytics();
            }
        };

        apply(readCookieConsent());

        const onConsentChange = (event: Event) => {
            apply((event as CustomEvent<CookieConsent>).detail ?? readCookieConsent());
        };

        window.addEventListener(COOKIE_CONSENT_EVENT, onConsentChange);
        return () => window.removeEventListener(COOKIE_CONSENT_EVENT, onConsentChange);
    }, []);

    return <>{children}</>;
}
