import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { sanitizeInternalRedirect, withSharedAuthCookieOptions } from "@/lib/auth-origin";
import type { Database, Tables } from "@/lib/database.types";
import { getPublicSupabaseConfig } from "@/lib/env";

const supabasePublicConfig = getPublicSupabaseConfig();
const ADMIN_ROUTES = ["/admin", "/dashboard"];
const REQUEST_ID_HEADER = "x-request-id";
const AUTH_CALLBACK_PARAMS = ["code", "error", "error_description"];

function isAdminRoute(pathname: string) {
    return ADMIN_ROUTES.some((route) => pathname.startsWith(route));
}

function shouldRecoverAuthCallback(request: NextRequest) {
    if (request.nextUrl.pathname === "/auth/callback") return false;
    return AUTH_CALLBACK_PARAMS.some((param) => request.nextUrl.searchParams.has(param));
}

function getAuthRecoveryNextPath(request: NextRequest) {
    const rawNext = request.nextUrl.searchParams.get("next");
    // Same parse-and-compare rule as the auth routes: a string-prefix test lets
    // "/\t/evil.example" through, and the URL parser then resolves it off-origin.
    const next = rawNext ? sanitizeInternalRedirect(rawNext, request.nextUrl.origin) : "/";
    if (rawNext && next !== "/") {
        return next;
    }

    const query = new URLSearchParams(request.nextUrl.searchParams);
    AUTH_CALLBACK_PARAMS.forEach((param) => query.delete(param));
    query.delete("next");

    const search = query.toString();
    return `${request.nextUrl.pathname}${search ? `?${search}` : ""}`;
}

function recoverAuthCallback(request: NextRequest) {
    const callbackUrl = new URL("/auth/callback", request.url);
    AUTH_CALLBACK_PARAMS.forEach((param) => {
        const value = request.nextUrl.searchParams.get(param);
        if (value) callbackUrl.searchParams.set(param, value);
    });
    callbackUrl.searchParams.set("next", getAuthRecoveryNextPath(request));
    return NextResponse.redirect(callbackUrl);
}

/**
 * One id per request, echoed on the response and readable downstream via the request
 * headers. Without it a customer report ("my payment failed") cannot be tied from the
 * Vercel log line to the Sentry event to the Postgres statement. Vercel supplies
 * `x-vercel-id`; this keeps a stable name and works locally too.
 */
function getRequestId(request: NextRequest) {
    // An inbound id is honoured only if it looks like one. It is forwarded to the handler and
    // becomes the Sentry request_id tag on the payment routes, so an unvalidated header lets
    // any caller pick the id their events are filed under -- or reuse one id for every
    // request and make trace correlation useless exactly when it is needed.
    const inbound = request.headers.get(REQUEST_ID_HEADER);
    if (inbound && /^[A-Za-z0-9_-]{8,64}$/.test(inbound)) {
        return inbound;
    }

    return request.headers.get("x-vercel-id") || crypto.randomUUID();
}

function withRequestId(response: NextResponse, requestId: string) {
    response.headers.set(REQUEST_ID_HEADER, requestId);
    return response;
}

/**
 * Forward the id to the handler as well as echoing it to the caller.
 *
 * Setting it only on the response gave the browser an id that appeared nowhere on the server
 * side, so a customer quoting it could not be matched to anything. Rewriting the request
 * headers puts the same id in front of the route handler -- and therefore into the request
 * data Sentry attaches to any event raised there -- which is what makes "my payment failed"
 * traceable from the Vercel log line to the Sentry event.
 */
function passthroughWithRequestId(request: NextRequest, requestId: string) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(REQUEST_ID_HEADER, requestId);

    return withRequestId(NextResponse.next({ request: { headers: requestHeaders } }), requestId);
}

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const requestId = getRequestId(request);

    // API routes are in the matcher purely to be stamped with a request id. They must never
    // reach the auth-callback recovery below, which keys off the presence of a "code",
    // "error" or "error_description" query param and would redirect any API call that
    // happens to carry one -- /api/auth/callback?code=... among them -- into an HTML page.
    if (pathname.startsWith("/api/")) {
        return passthroughWithRequestId(request, requestId);
    }

    if (shouldRecoverAuthCallback(request)) {
        return withRequestId(recoverAuthCallback(request), requestId);
    }

    // Public routes need nothing else from middleware. Resolving the Supabase session here
    // cost a blocking GoTrue round-trip in front of the ISR cache on the busiest route, and
    // the resulting `user` was dead code for anything outside /admin and /dashboard.
    if (!isAdminRoute(pathname)) {
        return passthroughWithRequestId(request, requestId);
    }

    if (!supabasePublicConfig) {
        // BUG-10 fix: Block admin routes when auth is misconfigured instead of passing all traffic
        if (isAdminRoute(pathname)) {
            return withRequestId(
                NextResponse.json(
                    { error: "Authentication service is not configured." },
                    { status: 503 }
                ),
                requestId
            );
        }
        return NextResponse.next();
    }

    let response = NextResponse.next({
        request: {
            headers: request.headers,
        },
    });

    const supabase = createServerClient<Database>(
        supabasePublicConfig.url,
        supabasePublicConfig.key,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet: { name: string; value: string; options: any }[]) {
                    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
                    response = NextResponse.next({
                        request,
                    });
                    cookiesToSet.forEach(({ name, value, options }) =>
                        response.cookies.set(
                            name,
                            value,
                            withSharedAuthCookieOptions(request, options)
                        )
                    );
                    response.headers.set("Cache-Control", "private, no-store");
                },
            },
        }
    );

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        if (isAdminRoute(pathname)) {
            const loginUrl = new URL("/auth/login", request.url);
            loginUrl.searchParams.set("redirect", pathname + request.nextUrl.search);
            return withRequestId(NextResponse.redirect(loginUrl), requestId);
        }
    }

    if (user && isAdminRoute(pathname)) {
        const profileResult = await supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .maybeSingle();

        const profile = profileResult.data as Pick<Tables<"profiles">, "role"> | null;

        if (profile?.role !== "admin") {
            return withRequestId(NextResponse.redirect(new URL("/", request.url)), requestId);
        }
    }

    return withRequestId(response, requestId);
}

export const config = {
    matcher: [
        "/admin/:path*",
        "/dashboard/:path*",
        // API routes are never served from the ISR cache, so stamping them costs nothing the
        // public-page exclusion below was protecting -- and a payment path with no request id
        // cannot be traced from a customer report to a log line to a Sentry event.
        "/api/:path*",
        // Auth-callback recovery only needs to run when a provider bounced back to a page
        // with these params, so it no longer costs an edge invocation on every homepage hit.
        { source: "/", has: [{ type: "query", key: "code" }] },
        { source: "/", has: [{ type: "query", key: "error" }] },
        { source: "/", has: [{ type: "query", key: "error_description" }] },
    ],
};
