"use client";

import posthog from "posthog-js";

export function trackEvent(
    eventName: string,
    properties?: Record<string, string | number | boolean | null | undefined>
) {
    if (typeof window === "undefined") {
        return;
    }

    try {
        posthog.capture(eventName, properties);
    } catch {
        // Non-blocking analytics.
    }
}
