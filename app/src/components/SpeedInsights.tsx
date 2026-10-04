"use client";

import { useEffect, useRef } from "react";
import { useParams, usePathname } from "next/navigation";
import { SPEED_INSIGHTS_SCRIPT_SRC, speedInsightsRoute } from "@/lib/speed-insights";

/**
 * Real-user Core Web Vitals for the Vercel dashboard (see `@/lib/speed-insights` for why this
 * is not the npm package).
 *
 * Production builds only: Vercel serves the script under /_vercel/, which `next dev` does not.
 * It sets no cookies and records no personal data, so unlike PostHog it does not wait for
 * cookie consent. Collects nothing until Speed Insights is enabled for the project in Vercel.
 */
export default function SpeedInsights() {
    const pathname = usePathname();
    const params = useParams<Record<string, string | string[]>>();
    const scriptRef = useRef<HTMLScriptElement | null>(null);
    const route = pathname ? speedInsightsRoute(pathname, params) : null;

    useEffect(() => {
        if (process.env.NODE_ENV !== "production") return;

        let script = scriptRef.current;
        if (!script) {
            script = document.createElement("script");
            script.src = SPEED_INSIGHTS_SCRIPT_SRC;
            script.defer = true;
            scriptRef.current = script;
            if (route) script.dataset.route = route;
            document.head.appendChild(script);
            return;
        }
        if (route) script.dataset.route = route;
    }, [route]);

    return null;
}
