"use client";

import { useEffect, useState } from "react";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { publicEnv } from "@/lib/env";

let posthogInitialized = false;

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

function initPostHog() {
    if (posthogInitialized || !publicEnv.NEXT_PUBLIC_POSTHOG_KEY) {
        return;
    }

    posthog.init(publicEnv.NEXT_PUBLIC_POSTHOG_KEY, {
        api_host: publicEnv.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
        capture_pageview: true,
        capture_pageleave: true,
        // Autocapture records every click and change across the whole app, including the
        // checkout form, with no per-page control -- and it is on wherever the key is set,
        // preview environments included. The product is already explicitly instrumented via
        // `trackEvent`, so the only thing autocapture adds here is surface area on the one
        // page where name, email, phone and payment live.
        autocapture: false,
        sanitize_properties: (properties) => {
            // Matched by shape rather than a fixed list: posthog-js carries the URL on more
            // properties than the obvious three ($session_entry_url on every event,
            // $initial_current_url as a person property), and an allowlist silently misses
            // whichever ones a future version adds.
            const sanitized = { ...properties };
            for (const key of Object.keys(sanitized)) {
                if (/(url|referrer|pathname)$/i.test(key)) {
                    sanitized[key] = stripUrlQuery(sanitized[key]);
                }
            }
            return sanitized;
        },
    });

    posthogInitialized = true;
}

export default function AnalyticsProvider({ children }: { children: React.ReactNode }) {
    const [isReady, setIsReady] = useState(!publicEnv.NEXT_PUBLIC_POSTHOG_KEY);

    useEffect(() => {
        initPostHog();
        setIsReady(true);
    }, []);

    if (!publicEnv.NEXT_PUBLIC_POSTHOG_KEY || !isReady) {
        return <>{children}</>;
    }

    return <PostHogProvider client={posthog}>{children}</PostHogProvider>;
}
