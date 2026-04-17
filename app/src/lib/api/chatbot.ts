import { apiRequest, ApiClientError } from "./client";

export type ChatbotResponse = {
    reply: string;
    showBookingButton: boolean;
    askName: boolean;
    askPhone: boolean;
};

export function askChatbot(payload: {
    message: string;
    stage: "idle" | "asking_name" | "asking_phone" | "completed";
    lead?: {
        name?: string;
        phone?: string;
        query?: string;
    };
    clientId?: string;
    clientApiKey?: string;
    contextWorkshopId?: string | null;
}) {
    return apiRequest<ChatbotResponse>("/api/chat", {
        method: "POST",
        body: payload,
    });
}

export type ChatbotConfigResponse = {
    clientId: string | null;
    clientName: string;
    bookingUrl: string;
};

export function getChatbotConfig(params?: {
    clientApiKey?: string | null;
    clientId?: string | null;
    contextWorkshopId?: string | null;
}) {
    const searchParams = new URLSearchParams();

    if (params?.clientApiKey) {
        searchParams.set("client", params.clientApiKey);
    }

    if (params?.clientId) {
        searchParams.set("clientId", params.clientId);
    }

    if (params?.contextWorkshopId) {
        searchParams.set("contextWorkshopId", params.contextWorkshopId);
    }

    const query = searchParams.toString();
    return apiRequest<ChatbotConfigResponse>(`/api/chatbot/config${query ? `?${query}` : ""}`, {
        cache: "no-store",
    });
}
