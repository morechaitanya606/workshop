import { NextResponse, type NextRequest } from "next/server";
import { loadFaqRows } from "@/lib/faqs";
import { assertRateLimit, getRateLimitKey } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
    const limit = await assertRateLimit({
        key: getRateLimitKey(request, "api-faqs-get"),
        limit: 120,
        windowMs: 60_000,
    });
    if (!limit.ok) return limit.response;

    const faqs = await loadFaqRows();

    return NextResponse.json(
        {
            faqs,
        },
        {
            headers: {
                // Global, non-personal content that changes rarely. It was `no-store`, which
                // forced two Supabase queries on every workshop-detail page view.
                "Cache-Control": "public, s-maxage=600, stale-while-revalidate=86400",
            },
        }
    );
}
