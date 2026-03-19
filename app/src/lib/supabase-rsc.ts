import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Database, Tables } from "@/lib/database.types";
import { getPublicSupabaseConfig } from "@/lib/env";

type ProfileRoleRow = {
    role: Tables<"profiles">["role"] | null;
};

export function createSupabaseRscClient() {
    const config = getPublicSupabaseConfig();
    if (!config?.url || !config.key) {
        return null;
    }

    const cookieStore = cookies();
    return createServerClient<Database>(config.url, config.key, {
        cookies: {
            getAll() {
                return cookieStore.getAll();
            },
            setAll(
                cookiesToSet: Array<{
                    name: string;
                    value: string;
                    options?: Record<string, unknown>;
                }>
            ) {
                try {
                    cookiesToSet.forEach(({ name, value, options }) => {
                        cookieStore.set(name, value, options as any);
                    });
                } catch {
                    // Some server contexts expose read-only cookie stores.
                }
            },
        },
    });
}

export async function requireAdminSupabaseRscClient(
    redirectPath = "/admin/dashboard"
): Promise<NonNullable<ReturnType<typeof createSupabaseRscClient>>> {
    const client = createSupabaseRscClient();
    if (!client) {
        redirect(`/auth/login?redirect=${encodeURIComponent(redirectPath)}`);
    }

    const {
        data: { user },
    } = await client.auth.getUser();

    if (!user) {
        redirect(`/auth/login?redirect=${encodeURIComponent(redirectPath)}`);
    }

    const { data: profile } = await client
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
    const profileRow = profile as ProfileRoleRow | null;

    if (profileRow?.role !== "admin") {
        redirect("/");
    }

    return client;
}
