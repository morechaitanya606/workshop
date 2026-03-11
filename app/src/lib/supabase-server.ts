import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { env, getPublicSupabaseConfig, getServiceRoleKey } from "@/lib/env";

const supabasePublicConfig = getPublicSupabaseConfig();

export type SupabaseServerClient = SupabaseClient<Database>;

export const isSupabasePublicConfigured = Boolean(supabasePublicConfig);
export const isSupabaseServiceConfigured = Boolean(
    supabasePublicConfig?.url && env.SUPABASE_SERVICE_ROLE_KEY
);

function createFetchWithTimeout(timeoutMs: number): typeof fetch {
    return async (input, init) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
            return await fetch(input, { ...init, signal: controller.signal });
        } finally {
            clearTimeout(timeoutId);
        }
    };
}

function missingEnvError(missing: string[]) {
    return new Error(
        `Missing environment variable(s): ${missing.join(", ")}. Update your .env.local.`
    );
}

export function createSupabaseAnonServerClient(options?: { requestTimeoutMs?: number }) {
    if (!supabasePublicConfig) {
        throw missingEnvError([
            "NEXT_PUBLIC_SUPABASE_URL",
            "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)",
        ]);
    }

    const requestTimeoutMs = options?.requestTimeoutMs;

    return createClient<Database>(supabasePublicConfig.url, supabasePublicConfig.key, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
        global:
            typeof requestTimeoutMs === "number" && requestTimeoutMs > 0
                ? { fetch: createFetchWithTimeout(requestTimeoutMs) }
                : undefined,
    });
}

export function createSupabaseServiceClient(options?: {
    requestTimeoutMs?: number;
}): SupabaseServerClient {
    if (!supabasePublicConfig?.url || !env.SUPABASE_SERVICE_ROLE_KEY) {
        throw missingEnvError(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
    }

    const requestTimeoutMs = options?.requestTimeoutMs;

    return createClient<Database>(supabasePublicConfig.url, getServiceRoleKey(), {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
        global:
            typeof requestTimeoutMs === "number" && requestTimeoutMs > 0
                ? { fetch: createFetchWithTimeout(requestTimeoutMs) }
                : undefined,
    });
}
