import { NextResponse } from "next/server";
import type { SupabaseServerClient } from "./supabase-server";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "./supabase-server";
import { jsonError } from "./api-auth";

export function requireSupabaseService():
    | { ok: true; client: SupabaseServerClient }
    | { ok: false; response: NextResponse } {
    if (!isSupabaseServiceConfigured) {
        return {
            ok: false,
            response: jsonError(
                "Supabase service role is not configured. Add SUPABASE_SERVICE_ROLE_KEY.",
                500
            ),
        };
    }

    return {
        ok: true,
        client: createSupabaseServiceClient(),
    };
}
