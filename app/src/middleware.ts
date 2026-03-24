import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database, Tables } from "@/lib/database.types";
import { getPublicSupabaseConfig } from "@/lib/env";

const supabasePublicConfig = getPublicSupabaseConfig();

const PUBLIC_ROUTES = [
    "/",
    "/explore",
    "/auth/login",
    "/auth/signup",
    "/auth/callback",
    "/about",
    "/contact",
    "/careers",
    "/help",
    "/safety",
    "/legal",
    "/cancellations",
    "/sitemap",
    "/sitemap.xml",
    "/robots.txt",
];

const PROTECTED_ROUTES: string[] = [];
const ADMIN_ROUTES = ["/admin", "/dashboard"];

function isPublicRoute(pathname: string) {
    if (PUBLIC_ROUTES.includes(pathname)) return true;
    if (pathname.startsWith("/workshop/")) return true;
    if (pathname.startsWith("/api/")) return true;
    if (pathname.startsWith("/_next/") || pathname.startsWith("/images/")) return true;
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

    if (isPublicRoute(pathname)) {
        return NextResponse.next();
    }

    if (!supabasePublicConfig) {
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
        if (isProtectedRoute(pathname) || isAdminRoute(pathname)) {
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
