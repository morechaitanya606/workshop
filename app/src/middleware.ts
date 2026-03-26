import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database, Tables } from "@/lib/database.types";
import { getPublicSupabaseConfig } from "@/lib/env";

const supabasePublicConfig = getPublicSupabaseConfig();
const ADMIN_ROUTES = ["/admin", "/dashboard"];

function isAdminRoute(pathname: string) {
    return ADMIN_ROUTES.some((route) => pathname.startsWith(route));
}

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

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
    matcher: ["/admin/:path*", "/dashboard/:path*"],
};
