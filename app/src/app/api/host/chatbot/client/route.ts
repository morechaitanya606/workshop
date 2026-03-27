import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { handleApiError, parseBody } from "@/lib/api-route";
import { jsonError, requireHostOrAdmin } from "@/lib/api-auth";
import { requireSupabaseService } from "@/lib/api-helpers";
import {
    buildChatbotEmbedIframeUrl,
    buildChatbotEmbedScriptUrl,
    buildChatbotEmbedSnippet,
    getOrCreateHostChatbotClient,
    rotateHostChatbotApiKey,
} from "@/lib/chatbot-clients";
import { chatbotClientUpdateSchema } from "@/lib/validators";

function formatClientResponse(client: {
    id: string;
    name: string;
    api_key: string;
    booking_url: string | null;
}) {
    return {
        client: {
            id: client.id,
            name: client.name,
            apiKey: client.api_key,
            bookingUrl: client.booking_url,
            embedScriptUrl: buildChatbotEmbedScriptUrl(),
            embedIframeUrl: buildChatbotEmbedIframeUrl(client.api_key),
            embedSnippet: buildChatbotEmbedSnippet(client.api_key),
        },
    };
}

export async function GET(request: NextRequest) {
    const auth = await requireHostOrAdmin(request);
    if (!auth.ok) {
        return auth.response;
    }

    const service = requireSupabaseService();
    if (!service.ok) {
        return service.response;
    }

    try {
        const client = await getOrCreateHostChatbotClient(service.client, auth.user.id);
        return NextResponse.json(formatClientResponse(client), {
            headers: {
                "Cache-Control": "no-store",
            },
        });
    } catch (error) {
        return handleApiError("Failed to load chatbot client.", error);
    }
}

export async function PATCH(request: NextRequest) {
    const auth = await requireHostOrAdmin(request);
    if (!auth.ok) {
        return auth.response;
    }

    const service = requireSupabaseService();
    if (!service.ok) {
        return service.response;
    }

    const parsed = await parseBody(
        request,
        chatbotClientUpdateSchema,
        "Invalid chatbot client payload.",
        "Chatbot client request is invalid."
    );
    if (!parsed.ok) {
        return parsed.response;
    }

    try {
        const existingClient = await getOrCreateHostChatbotClient(service.client, auth.user.id);

        let nextClient = existingClient;
        if (parsed.data.rotateApiKey) {
            nextClient = await rotateHostChatbotApiKey(service.client, existingClient.id);
        }

        const updates: {
            name?: string;
            booking_url?: string | null;
        } = {};

        if (typeof parsed.data.name !== "undefined") {
            updates.name = parsed.data.name.trim();
        }

        if (typeof parsed.data.bookingUrl !== "undefined") {
            updates.booking_url = parsed.data.bookingUrl?.trim() || null;
        }

        if (Object.keys(updates).length > 0) {
            const { data, error } = await service.client
                .from("clients")
                .update(updates)
                .eq("id", nextClient.id)
                .eq("host_user_id", auth.user.id)
                .select("id, name, api_key, booking_url")
                .single();

            if (error) {
                throw error;
            }

            nextClient = {
                ...nextClient,
                ...data,
            } as typeof nextClient;
        } else if (!parsed.data.rotateApiKey) {
            return jsonError("Provide at least one chatbot client field to update.", 400);
        }

        return NextResponse.json(formatClientResponse(nextClient));
    } catch (error) {
        return handleApiError("Failed to update chatbot client.", error);
    }
}
