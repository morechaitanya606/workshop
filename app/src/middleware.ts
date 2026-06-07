import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database, Tables } from "@/lib/database.types";
import { getPublicSupabaseConfig } from "@/lib/env";

const supabasePublicConfig = getPublicSupabaseConfig();
const ADMIN_ROUTES = ["/admin", "/dashboard"];
const AUTH_CALLBACK_PARAMS = ["code", "error", "error_description"];

function isAdminRoute(pathname: string) {
    return ADMIN_ROUTES.some((route) => pathname.startsWith(route));
}

function shouldRecoverAuthCallback(request: NextRequest) {
    if (request.nextUrl.pathname === "/auth/callback") return false;
    return AUTH_CALLBACK_PARAMS.some((param) => request.nextUrl.searchParams.has(param));
}

function getAuthRecoveryNextPath(request: NextRequest) {
    const next = request.nextUrl.searchParams.get("next");
    if (next?.startsWith("/") && !next.startsWith("//") && !next.includes("\\")) {
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

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    if (shouldRecoverAuthCallback(request)) {
        return recoverAuthCallback(request);
    }

    if (!supabasePublicConfig) {
        // BUG-10 fix: Block admin routes when auth is misconfigured instead of passing all traffic
        if (isAdminRoute(pathname)) {
            return NextResponse.json(
                { error: "Authentication service is not configured." },
                { status: 503 }
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
                        response.cookies.set(name, value, options)
                    );
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
            return NextResponse.redirect(loginUrl);
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
            return NextResponse.redirect(new URL("/", request.url));
        }
    }

    return response;
}

export const config = {
    matcher: ["/", "/admin/:path*", "/dashboard/:path*"],
    runtime: "nodejs",
};
