import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublicKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const isSupabasePublicConfigured = Boolean(supabaseUrl && supabasePublicKey);
export const isSupabaseServiceConfigured = Boolean(
    supabaseUrl && supabaseServiceRoleKey
);

function missingEnvError(missing: string[]) {
    return new Error(
        `Missing environment variable(s): ${missing.join(", ")}. Update your .env.local.`
    );
}

export function createSupabaseAnonServerClient() {
    if (!supabaseUrl || !supabasePublicKey) {
        throw missingEnvError([
            "NEXT_PUBLIC_SUPABASE_URL",
            "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)",
        ]);
    }

    return createClient(supabaseUrl, supabasePublicKey, {
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
