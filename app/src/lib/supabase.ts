import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

const fallbackUrl = "https://placeholder.supabase.co";
const fallbackAnonKey = "placeholder-anon-key";

if (!isSupabaseConfigured && typeof window !== "undefined") {
    console.warn(
        "Supabase env vars are missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
}

export const supabase = createClient(
    isSupabaseConfigured ? supabaseUrl! : fallbackUrl,
    isSupabaseConfigured ? supabaseAnonKey! : fallbackAnonKey,
    {
        auth: {
            persistSession: isSupabaseConfigured,
            autoRefreshToken: isSupabaseConfigured,
            detectSessionInUrl: isSupabaseConfigured,
        },
    }
);
