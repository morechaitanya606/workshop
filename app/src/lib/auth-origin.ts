import type { CookieOptions } from "@supabase/ssr";
import type { NextResponse } from "next/server";

const CANONICAL_APP_ORIGIN = "https://onlyworkshops.com";
const SHARED_AUTH_COOKIE_DOMAIN = ".onlyworkshops.com";
const TRUSTED_PRODUCTION_HOSTS = new Set(["onlyworkshops.com", "www.onlyworkshops.com"]);

type PendingCookie = {
    name: string;
    value: string;
    options?: CookieOptions;
};

function firstHeaderValue(value: string | null) {
    return value?.split(",")[0]?.trim() || null;
}

function normalizeHostname(host: string | null) {
    if (!host) return null;

    const hostname = host
        .trim()
        .replace(/^\[/, "")
        .replace(/\]$/, "")
        .split(":")[0]
        ?.toLowerCase();

    if (!hostname || !/^[a-z0-9.-]+$/.test(hostname)) {
        return null;
    }

    return hostname;
}

function hostnameFromUrl(rawUrl: string | undefined) {
    if (!rawUrl?.trim()) return null;

    try {
        const url = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
        return normalizeHostname(url.hostname);
    } catch {
        return null;
    }
}

function isLocalhost(hostname: string | null) {
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function getTrustedProductionHosts() {
    const trustedHosts = new Set(TRUSTED_PRODUCTION_HOSTS);
    const configuredHosts = [
        hostnameFromUrl(process.env.NEXT_PUBLIC_APP_URL),
        hostnameFromUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL),
        hostnameFromUrl(process.env.VERCEL_URL),
    ];

    configuredHosts.forEach((hostname) => {
        if (hostname && !isLocalhost(hostname)) {
            trustedHosts.add(hostname);
        }
    });

    return trustedHosts;
}

export function getRequestHostname(request: Request) {
    const requestUrl = new URL(request.url);
    const forwardedHost = firstHeaderValue(request.headers.get("x-forwarded-host"));
    const host = forwardedHost || request.headers.get("host") || requestUrl.host;
    return normalizeHostname(host) || normalizeHostname(requestUrl.hostname);
}

export function getAuthAppOrigin(request: Request) {
    const requestUrl = new URL(request.url);

    if (process.env.NODE_ENV !== "production") {
        return requestUrl.origin;
    }

    const hostname = getRequestHostname(request);
    if (hostname && getTrustedProductionHosts().has(hostname)) {
        return `https://${hostname}`;
    }

    return CANONICAL_APP_ORIGIN;
}

export function getSharedAuthCookieDomain(request: Request) {
    const hostname = getRequestHostname(request);
    if (hostname === "onlyworkshops.com" || hostname === "www.onlyworkshops.com") {
        return SHARED_AUTH_COOKIE_DOMAIN;
    }

    return undefined;
}

export function withSharedAuthCookieOptions(request: Request, options?: CookieOptions) {
    const domain = getSharedAuthCookieDomain(request);
    if (!domain) {
        return options;
    }

    return {
        ...options,
        domain,
        path: options?.path ?? "/",
        sameSite: options?.sameSite ?? "lax",
        secure: true,
    };
}

export function applyAuthCookies(
    request: Request,
    response: NextResponse,
    cookiesToSet: PendingCookie[]
) {
    cookiesToSet.forEach(({ name, value, options }) => {
        response.cookies.set(name, value, withSharedAuthCookieOptions(request, options));
    });

    if (cookiesToSet.length > 0) {
        response.headers.set("Cache-Control", "private, no-store");
    }

    return response;
}

