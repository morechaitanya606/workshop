"use client";

import { useEffect, useState } from "react";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { publicEnv } from "@/lib/env";

let posthogInitialized = false;

function initPostHog() {
    if (posthogInitialized || !publicEnv.NEXT_PUBLIC_POSTHOG_KEY) {
        return;
    }

    posthog.init(publicEnv.NEXT_PUBLIC_POSTHOG_KEY, {
        api_host: publicEnv.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
        capture_pageview: true,
        capture_pageleave: true,
        autocapture: true,
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
