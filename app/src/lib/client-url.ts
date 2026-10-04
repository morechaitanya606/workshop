"use client";

import { PRODUCTION_SITE_URL } from "@/lib/env";

/**
 * The host the site is served from: the bare domain answers 308 to www. Auth email links are
 * built on it, so they match the `https://www.onlyworkshops.com/**` entry in Supabase's
 * Redirect URLs (the bare domain is only allow-listed for /auth/callback and
 * /auth/reset-password) and skip a redirect hop.
 */
const PRODUCTION_APP_ORIGIN = PRODUCTION_SITE_URL;

function isLocalhost(hostname: string) {
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function normalizeOrigin(value: string | undefined) {
    if (!value?.trim()) return null;

    try {
        const url = new URL(value.trim());
        return url.origin;
    } catch {
        return null;
    }
}

export function getClientAppOrigin() {
    if (process.env.NODE_ENV === "production") {
        return PRODUCTION_APP_ORIGIN;
    }

    const configuredOrigin = normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL);
    if (configuredOrigin) {
        try {
            const configuredUrl = new URL(configuredOrigin);
            if (!isLocalhost(configuredUrl.hostname)) {
                return configuredOrigin;
            }
        } catch {
            // Fall through to the browser origin below.
        }
    }

    if (typeof window !== "undefined") {
        const currentOrigin = window.location.origin;

        try {
            const currentUrl = new URL(currentOrigin);
            return currentUrl.origin;
        } catch {
            return PRODUCTION_APP_ORIGIN;
        }
    }

    return PRODUCTION_APP_ORIGIN;
}

export function getClientAppUrl(path = "/") {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return new URL(normalizedPath, getClientAppOrigin()).toString();
}
