import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { env, getPublicSupabaseConfig, getServiceRoleKey } from "@/lib/env";

const supabasePublicConfig = getPublicSupabaseConfig();

export type SupabaseServerClient = SupabaseClient<Database>;

export const isSupabasePublicConfigured = Boolean(supabasePublicConfig);
export const isSupabaseServiceConfigured = Boolean(
    supabasePublicConfig?.url && env.SUPABASE_SERVICE_ROLE_KEY
);

function missingEnvError(missing: string[]) {
    return new Error(
        `Missing environment variable(s): ${missing.join(", ")}. Update your .env.local.`
    );
}

export function createSupabaseAnonServerClient() {
    if (!supabasePublicConfig) {
        throw missingEnvError([
            "NEXT_PUBLIC_SUPABASE_URL",
            "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)",
        ]);
    }

    return createClient<Database>(supabasePublicConfig.url, supabasePublicConfig.key, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
}

export function createSupabaseServiceClient(): SupabaseServerClient {
    if (!supabasePublicConfig?.url || !env.SUPABASE_SERVICE_ROLE_KEY) {
        throw missingEnvError(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
    }

    return createClient<Database>(supabasePublicConfig.url, getServiceRoleKey(), {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
}
