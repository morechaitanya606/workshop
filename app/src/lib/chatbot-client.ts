import type { ChatbotStage } from "@/lib/chatbot-text";

/**
 * Browser-side call to /api/chat. `askChatbot` in api-client.ts cannot carry conversation
 * history or a language hint, so the widget uses this instead. Client-safe: no server imports.
 */

export type ChatbotHistoryPayload = {
    role: "user" | "assistant";
    content: string;
};

export type ChatbotRequestPayload = {
    message: string;
    stage: ChatbotStage;
    lead?: { name?: string; phone?: string; query?: string };
    clientId?: string;
    clientApiKey?: string;
    contextWorkshopId?: string | null;
    history?: ChatbotHistoryPayload[];
    language?: string;
};

export type ChatbotReplyPayload = {
    reply: string;
    showBookingButton: boolean;
    askName: boolean;
    askPhone: boolean;
};

export class ChatbotRequestError extends Error {
    status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = "ChatbotRequestError";
        this.status = status;
    }
}

// Slightly under the route's 30s function limit so the user sees our error, not a platform one.
const CLIENT_TIMEOUT_MS = 28_000;

export async function sendChatbotMessage(
    payload: ChatbotRequestPayload,
    fetchImpl: typeof fetch = fetch
): Promise<ChatbotReplyPayload> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);

    try {
        const response = await fetchImpl("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            cache: "no-store",
            signal: controller.signal,
        });

        const body = (await response.json().catch(() => ({}))) as Partial<ChatbotReplyPayload> & {
            error?: string;
        };

        if (!response.ok || typeof body.reply !== "string") {
            throw new ChatbotRequestError(
                String(body.error || "Chat request failed."),
                response.status || 0
            );
        }

        return {
            reply: body.reply,
            showBookingButton: Boolean(body.showBookingButton),
            askName: Boolean(body.askName),
            askPhone: Boolean(body.askPhone),
        };
    } catch (error) {
        if (error instanceof ChatbotRequestError) {
            throw error;
        }

        throw new ChatbotRequestError("Network error.", 0);
    } finally {
        clearTimeout(timeoutId);
    }
}
