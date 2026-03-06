import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublicKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const PUBLIC_ROUTES = [
    "/",
    "/explore",
    "/auth/login",
    "/auth/signup",
    "/auth/callback",
    "/about",
    "/blog",
    "/contact",
    "/careers",
    "/help",
    "/press",
    "/safety",
    "/legal",
    "/cancellations",
    "/sitemap",
];

const PROTECTED_ROUTES = ["/booking", "/dashboard"];
const ADMIN_ROUTES = ["/admin"];

function isPublicRoute(pathname: string) {
    if (PUBLIC_ROUTES.includes(pathname)) return true;
    // Workshop detail pages are public
    if (pathname.startsWith("/workshop/")) return true;
    // API routes handle their own auth
    if (pathname.startsWith("/api/")) return true;
    // Static files
    if (pathname.startsWith("/_next/") || pathname.startsWith("/images/")) return true;
    // Legal sub-pages
    if (pathname.startsWith("/legal/")) return true;
    return false;
}

function isProtectedRoute(pathname: string) {
    return PROTECTED_ROUTES.some((route) => pathname.startsWith(route));
}

function isAdminRoute(pathname: string) {
    return ADMIN_ROUTES.some((route) => pathname.startsWith(route));
}

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Skip middleware for public routes
    if (isPublicRoute(pathname)) {
        return NextResponse.next();
    }

    // For protected and admin routes, verify the session
    if (!supabaseUrl || !supabasePublicKey) {
        // Supabase not configured — let the app handle it client-side
        return NextResponse.next();
    }

    // Try to get the access token from cookies
    const accessToken =
        request.cookies.get("sb-access-token")?.value ||
        request.cookies.get(`sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`)?.value;

    // Parse the Supabase auth cookie (stored as JSON array)
    let token: string | null = null;
    if (accessToken) {
        try {
            const parsed = JSON.parse(accessToken);
            token = Array.isArray(parsed) ? parsed[0] : parsed;
        } catch {
            token = accessToken;
        }
    }

    // Also check the standard sb-<ref>-auth-token cookie format
    if (!token) {
        const allCookies = request.cookies.getAll();
        for (let i = 0; i < allCookies.length; i++) {
            const cookie = allCookies[i];
            if (cookie.name.startsWith("sb-") && cookie.name.endsWith("-auth-token")) {
                try {
                    const parsed = JSON.parse(cookie.value);
                    token = Array.isArray(parsed) ? parsed[0] : parsed;
                } catch {
                    token = cookie.value;
                }
                if (token) break;
            }
        }
    }

    if (!token && (isProtectedRoute(pathname) || isAdminRoute(pathname))) {
        const loginUrl = new URL("/auth/login", request.url);
        loginUrl.searchParams.set("redirect", pathname + request.nextUrl.search);
        return NextResponse.redirect(loginUrl);
    }

    if (token) {
        try {
            const supabase = createClient(supabaseUrl, supabasePublicKey, {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false,
                },
            });

            const { data: { user }, error } = await supabase.auth.getUser(token);

            if (error || !user) {
                if (isProtectedRoute(pathname) || isAdminRoute(pathname)) {
                    const loginUrl = new URL("/auth/login", request.url);
                    loginUrl.searchParams.set("redirect", pathname + request.nextUrl.search);
                    return NextResponse.redirect(loginUrl);
                }
            }
        } catch {
            // If auth check fails, let the app handle it
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        /*
         * Match all request paths except:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - public folder files
         */
        "/((?!_next/static|_next/image|favicon.ico|images/).*)",
    ],
};
