import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const isSupabasePublicConfigured = Boolean(supabaseUrl && supabaseAnonKey);
export const isSupabaseServiceConfigured = Boolean(
    supabaseUrl && supabaseAnonKey && supabaseServiceRoleKey
);

function missingEnvError(missing: string[]) {
    return new Error(
        `Missing environment variable(s): ${missing.join(", ")}. Update your .env.local.`
    );
}

export function createSupabaseAnonServerClient() {
    if (!supabaseUrl || !supabaseAnonKey) {
        throw missingEnvError([
            "NEXT_PUBLIC_SUPABASE_URL",
            "NEXT_PUBLIC_SUPABASE_ANON_KEY",
        ]);
    }

    return createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
}

export function createSupabaseServiceClient() {
    if (!supabaseUrl || !supabaseServiceRoleKey) {
        throw missingEnvError([
            "NEXT_PUBLIC_SUPABASE_URL",
            "SUPABASE_SERVICE_ROLE_KEY",
        ]);
    }

    return createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
}
