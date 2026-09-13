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

    const hostname = host.trim().replace(/^\[/, "").replace(/\]$/, "").split(":")[0]?.toLowerCase();

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

/**
 * Any absolute base works for the comparison below -- the question is only whether the
 * input stays on the base it is resolved against. Client callers therefore do not need
 * window.location.origin, which does not exist during SSR.
 */
const REDIRECT_RESOLUTION_BASE = "https://redirect-base.invalid";

/**
 * Resolve a caller-supplied `next`/`redirect` into a path guaranteed to stay on this origin.
 *
 * Prefix tests on the raw string are not a sufficient filter. The WHATWG URL parser strips
 * ASCII tab (U+0009), LF (U+000A) and CR (U+000D) from its input BEFORE parsing, so
 * `"/\t/evil.example"` passes a `!startsWith("//")` check as a string and then resolves to
 * `https://evil.example`. It also treats `\` as `/` under http(s), so `"/\evil.example"`
 * escapes the same way once the literal-backslash check is the only thing standing in front
 * of it. Either one turns the post-login redirect -- which is followed with the session
 * cookies freshly set -- into an attacker-chosen landing page.
 *
 * So parse it and compare the origin the parser actually produced, then rebuild the path
 * from the parsed components rather than echoing back the caller's string.
 */
export function sanitizeInternalRedirect(
    raw: string | null | undefined,
    origin: string = REDIRECT_RESOLUTION_BASE
) {
    const fallback = "/";
    if (!raw || !raw.startsWith("/")) return fallback;

    try {
        const base = new URL(origin);
        const resolved = new URL(raw, base);

        if (resolved.origin !== base.origin) return fallback;

        const path = `${resolved.pathname}${resolved.search}${resolved.hash}`;

        // One origin check is not enough, because the value we return is re-parsed later by
        // a DIFFERENT parser -- the Next router, or NextResponse.redirect against the real
        // origin. "/..//evil.example/steal" resolves ON-origin here (the ".." pops a segment
        // inside the base) and leaves a pathname of "//evil.example/steal", which is
        // protocol-relative to whoever parses it next. Re-resolve what we are about to hand
        // back and require the origin to survive that second pass too.
        if (new URL(path, base).origin !== base.origin) return fallback;

        return path;
    } catch {
        return fallback;
    }
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
