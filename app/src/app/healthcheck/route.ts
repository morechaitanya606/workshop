import { NextResponse } from "next/server";

import { probeRateLimitStore } from "@/lib/rate-limit";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase-server";

// Must never be answered from the CDN: a cached "ok" is worse than no healthcheck at all.
export const dynamic = "force-dynamic";

const PROBE_TIMEOUT_MS = 3000;

type CheckState = "ok" | "degraded" | "skipped";

export async function GET() {
    const checks: Record<string, CheckState> = {};

    if (!isSupabaseServiceConfigured) {
        checks.database = "skipped";
    } else {
        try {
            const supabase = createSupabaseServiceClient({ requestTimeoutMs: PROBE_TIMEOUT_MS });
            const { error } = await supabase
                .from("platform_settings")
                .select("setting_key")
                .limit(1);
            checks.database = error ? "degraded" : "ok";
        } catch {
            checks.database = "degraded";
        }
    }

    checks.rateLimiter = await probeRateLimitStore();

    const isProduction = process.env.NODE_ENV === "production";

    // "skipped" is an honest answer in development, where a missing service role or Upstash
    // config is just an unconfigured laptop. In production it means a dependency the app
    // cannot work without is absent, and reporting ok:true for that is how a load balancer
    // keeps routing customers at an instance that cannot take a booking.
    const failing = Object.values(checks).filter(
        (state) => state === "degraded" || (isProduction && state === "skipped")
    );
    const healthy = failing.length === 0;

    return NextResponse.json(
        { ok: healthy, service: "onlyworkshop", checks },
        {
            status: healthy ? 200 : 503,
            headers: { "Cache-Control": "no-store" },
        }
    );
}
