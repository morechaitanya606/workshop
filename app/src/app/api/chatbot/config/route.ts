import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-auth";
import { requireSupabaseService } from "@/lib/api-helpers";
import { resolveChatbotBookingUrl, resolveChatbotClient } from "@/lib/chatbot-clients";

function buildDefaultChatbotConfig(request: NextRequest) {
    const contextWorkshopId = request.nextUrl.searchParams.get("contextWorkshopId");

    return {
        clientId: null,
        bookingUrl: resolveChatbotBookingUrl(null, contextWorkshopId),
        clientName: "OnlyWorkshop Platform",
    };
}

export async function GET(request: NextRequest) {
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

        return NextResponse.json({
            clientId: resolvedClient.client?.id ?? null,
            clientName: resolvedClient.client?.name ?? "OnlyWorkshop Platform",
            bookingUrl: resolveChatbotBookingUrl(
                resolvedClient.client,
                request.nextUrl.searchParams.get("contextWorkshopId")
            ),
        });
    } catch {
        return NextResponse.json(buildDefaultChatbotConfig(request), {
            headers: {
                "Cache-Control": "no-store",
            },
        });
    }
}
