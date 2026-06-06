import { createServerClient } from "@supabase/ssr";
import * as Sentry from "@sentry/nextjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getUserRole } from "@/lib/api-auth";
import type { Database } from "@/lib/database.types";
import { getPublicSupabaseConfig } from "@/lib/env";

/** BUG-2 fix: Validate redirect target to prevent open redirect attacks. */
function sanitizeRedirect(raw: string | null): string {
    const fallback = "/";
    if (!raw) return fallback;
    // Must start with "/" and must NOT start with "//" (protocol-relative URL)
    if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
    // Block any URL-encoded protocol-relative patterns
    if (raw.includes("\\")) return fallback;
    return raw;
}

export async function GET(request: Request) {
    const requestUrl = new URL(request.url);
    const code = requestUrl.searchParams.get("code");

    const next = sanitizeRedirect(requestUrl.searchParams.get("next"));

    if (code) {
        const cookieStore = await cookies();
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
                        } catch {
                            // Ignored due to middleware refreshing session
                        }
                    },
                    remove(name: string, options: any) {
                        try {
                            cookieStore.set({ name, value: "", ...options });
                        } catch {
                            // Ignored due to middleware refreshing session
                        }
                    },
                },
            }
        );

        try {
            const { data, error } = await supabase.auth.exchangeCodeForSession(code);

            if (!error && data?.user) {
                const role = await getUserRole(data.user.id);

                if (role === "admin") {
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

    return NextResponse.redirect(new URL(next, request.url));
}
