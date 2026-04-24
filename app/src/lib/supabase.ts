import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";
import { getPublicSupabaseConfig } from "@/lib/env";

const supabasePublicConfig = getPublicSupabaseConfig();

export const isSupabaseConfigured = Boolean(supabasePublicConfig);

const fallbackUrl = "https://placeholder.supabase.co";
const fallbackAnonKey = "placeholder-anon-key";

if (
    !isSupabaseConfigured &&
    typeof window !== "undefined" &&
    process.env.NODE_ENV !== "production"
) {
    console.warn(
        "Supabase env vars are missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)."
    );
}

export const supabase = createBrowserClient<Database>(
    isSupabaseConfigured ? supabasePublicConfig!.url : fallbackUrl,
    isSupabaseConfigured ? supabasePublicConfig!.key : fallbackAnonKey,
    {
        auth: {
            persistSession: isSupabaseConfigured,
            autoRefreshToken: isSupabaseConfigured,
            detectSessionInUrl: isSupabaseConfigured,
        },
    }
);
