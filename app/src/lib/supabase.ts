import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";
import { getPublicSupabaseConfig } from "@/lib/env";

const supabasePublicConfig = getPublicSupabaseConfig();

export const isSupabaseConfigured = Boolean(supabasePublicConfig);

const developmentSupabaseConfig = {
    url: "http://127.0.0.1:54321",
    key: "missing-public-supabase-key",
};

if (
    !isSupabaseConfigured &&
    typeof window !== "undefined" &&
    process.env.NODE_ENV !== "production"
) {
    console.warn(
        "Supabase env vars are missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)."
    );
}

if (!isSupabaseConfigured && process.env.NODE_ENV === "production") {
    throw new Error(
        "Supabase public env vars are missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY."
    );
}

export const supabase = createBrowserClient<Database>(
    isSupabaseConfigured ? supabasePublicConfig!.url : developmentSupabaseConfig.url,
    isSupabaseConfigured ? supabasePublicConfig!.key : developmentSupabaseConfig.key,
    {
        auth: {
            persistSession: isSupabaseConfigured,
            autoRefreshToken: isSupabaseConfigured,
            detectSessionInUrl: isSupabaseConfigured,
        },
    }
);
