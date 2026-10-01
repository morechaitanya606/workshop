"use client";

import { publicEnv } from "@/lib/env";

type PostHogClient = (typeof import("posthog-js"))["default"];

let client: PostHogClient | null = null;
let clientPromise: Promise<PostHogClient | null> | null = null;

/**
 * Query strings on this app carry things analytics has no business storing: `/booking` is
 * reached with `?workshop=&guests=&hold=&coupon=`, and the OAuth bounce can land on `/` with
 * `?code=`. Strip the search and hash off every URL property before it leaves the browser.
 */
function stripUrlQuery(rawUrl: unknown) {
    if (typeof rawUrl !== "string" || !rawUrl) return rawUrl;

    try {
        const url = new URL(rawUrl);
        return `${url.origin}${url.pathname}`;
    } catch {
        return rawUrl.split(/[?#]/)[0];
    }
}

/**
 * Loads and initialises PostHog. Only call this once the visitor has accepted cookies. The
 * library is imported lazily so it never ships in the root bundle when no key is configured (or
 * before consent), and repeated calls share one in-flight import.
 */
export function startAnalytics(): Promise<PostHogClient | null> {
    const key = publicEnv.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key || typeof window === "undefined") {
        return Promise.resolve(null);
    }

    if (!clientPromise) {
        clientPromise = import("posthog-js")
            .then(({ default: posthog }) => {
                posthog.init(key, {
                    api_host: publicEnv.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
                    capture_pageview: true,
                    capture_pageleave: true,
                    // Autocapture records every click and change across the whole app, including
                    // the checkout form, with no per-page control. The product is already
                    // explicitly instrumented via `trackEvent`, so the only thing autocapture
                    // adds here is surface area on the one page where name, email, phone and
                    // payment live.
                    autocapture: false,
                    sanitize_properties: (properties) => {
                        // Matched by shape rather than a fixed list: posthog-js carries the URL on
                        // more properties than the obvious three ($session_entry_url on every
                        // event, $initial_current_url as a person property), and an allowlist
                        // silently misses whichever ones a future version adds.
                        const sanitized = { ...properties };
                        for (const propertyKey of Object.keys(sanitized)) {
                            if (/(url|referrer|pathname)$/i.test(propertyKey)) {
                                sanitized[propertyKey] = stripUrlQuery(sanitized[propertyKey]);
                            }
                        }
                        return sanitized;
                    },
                });
                client = posthog;
                return posthog;
            })
            .catch(() => {
                clientPromise = null;
                return null;
            });
    }

    return clientPromise.then((posthog) => {
        if (posthog?.has_opted_out_capturing()) {
            posthog.opt_in_capturing();
        }
        return posthog;
    });
}

/** Stops capturing (and clears PostHog's local identifiers) after a visitor declines or withdraws. */
export function stopAnalytics() {
    try {
        client?.opt_out_capturing();
    } catch {
        // Non-blocking analytics.
    }
}

export function trackEvent(
    eventName: string,
    properties?: Record<string, string | number | boolean | null | undefined>
) {
    if (typeof window === "undefined" || !client) {
        // No client means no key or no consent yet: drop the event rather than queue it.
        return;
    }

    try {
        client.capture(eventName, properties);
    } catch {
        // Non-blocking analytics.
    }
}
