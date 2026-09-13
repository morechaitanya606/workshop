import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-auth";
import { requireSupabaseService } from "@/lib/api-helpers";
import { resolveChatbotBookingUrl, resolveChatbotClient } from "@/lib/chatbot-clients";
import { assertRateLimit, getRateLimitKey } from "@/lib/rate-limit";

// Non-personal config keyed entirely by query params; safe for the CDN to hold.
const CONFIG_CACHE_HEADERS = {
    "Cache-Control": "public, s-maxage=600, stale-while-revalidate=86400",
} as const;

function buildDefaultChatbotConfig(request: NextRequest) {
    const contextWorkshopId = request.nextUrl.searchParams.get("contextWorkshopId");

    return {
        clientId: null,
        bookingUrl: resolveChatbotBookingUrl(null, contextWorkshopId),
        clientName: "OnlyWorkshop Platform",
    };
}

export async function GET(request: NextRequest) {
    const limit = await assertRateLimit({
        key: getRateLimitKey(request, "api-chatbot-config"),
        limit: 120,
        windowMs: 60_000,
    });
    if (!limit.ok) return limit.response;

    const service = requireSupabaseService();
    if (!service.ok) {
        return NextResponse.json(buildDefaultChatbotConfig(request));
    }

    try {
        const resolvedClient = await resolveChatbotClient(service.client, {
            clientApiKey: request.nextUrl.searchParams.get("client"),
            clientId: request.nextUrl.searchParams.get("clientId"),
            contextWorkshopId: request.nextUrl.searchParams.get("contextWorkshopId"),
        });

        if (resolvedClient.explicitLookupFailed) {
            return jsonError("Unknown chatbot client.", 404);
        }

        return NextResponse.json(
            {
                clientId: resolvedClient.client?.id ?? null,
                clientName: resolvedClient.client?.name ?? "OnlyWorkshop Platform",
                bookingUrl: resolveChatbotBookingUrl(
                    resolvedClient.client,
                    request.nextUrl.searchParams.get("contextWorkshopId")
                ),
            },
            { headers: CONFIG_CACHE_HEADERS }
        );
    } catch {
        return NextResponse.json(buildDefaultChatbotConfig(request), {
            headers: {
                "Cache-Control": "no-store",
            },
        });
    }
}
