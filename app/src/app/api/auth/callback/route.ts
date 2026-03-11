import { createServerClient } from "@supabase/ssr";
import * as Sentry from "@sentry/core";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getUserRole } from "@/lib/api-auth";
import type { Database } from "@/lib/database.types";
import { getPublicSupabaseConfig } from "@/lib/env";

export async function GET(request: Request) {
    const requestUrl = new URL(request.url);
    const code = requestUrl.searchParams.get("code");

    // The redirect path they originally intended to go to
    const next = requestUrl.searchParams.get("next") ?? "/";

    if (code) {
        const cookieStore = cookies();
        const supabasePublicConfig = getPublicSupabaseConfig();
        if (!supabasePublicConfig) {
            return NextResponse.redirect(new URL(next, request.url));
        }

        const supabase = createServerClient<Database>(
            supabasePublicConfig.url,
            supabasePublicConfig.key,
            {
                cookies: {
                    get(name: string) {
                        return cookieStore.get(name)?.value;
                    },
                    set(name: string, value: string, options: any) {
                        try {
                            cookieStore.set({ name, value, ...options });
                        } catch (error) {
                            // Ignored due to middleware refreshing session
                        }
                    },
                    remove(name: string, options: any) {
                        try {
                            cookieStore.set({ name, value: "", ...options });
                        } catch (error) {
                            // Ignored due to middleware refreshing session
                        }
                    },
                },
            }
        );

        try {
            const { data, error } = await supabase.auth.exchangeCodeForSession(code);

            if (!error && data?.user) {
                // Determine if this user is an admin
                const role = await getUserRole(data.user.id);

                if (role === "admin") {
                    // Force admin redirect
                    return NextResponse.redirect(new URL("/admin/dashboard", request.url));
                }
            }
        } catch (err) {
            Sentry.captureException(err, {
                tags: {
                    layer: "auth",
                    route: "auth_callback",
                },
                extra: {
                    next,
                    hasCode: Boolean(code),
                },
            });
        }
    }

    // Default redirect to the intended `next` path or home
    return NextResponse.redirect(new URL(next, request.url));
}
