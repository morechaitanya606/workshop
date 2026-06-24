import { randomBytes } from "crypto";
import type { Tables } from "@/lib/database.types";
import { getAppUrl } from "@/lib/env";
import type { SupabaseServerClient } from "@/lib/supabase-server";
import { getWorkshopOwnerLookup } from "@/lib/workshop-attendees";

export type ChatbotClientRecord = Pick<
    Tables<"clients">,
    | "id"
    | "host_user_id"
    | "name"
    | "api_key"
    | "booking_url"
    | "is_platform_default"
    | "created_at"
    | "updated_at"
>;

type ResolvedChatbotClient = {
    client: ChatbotClientRecord | null;
    explicitLookupFailed: boolean;
    source: "api_key" | "client_id" | "workshop" | "platform_default";
};

const CHATBOT_CLIENT_SELECT =
    "id, host_user_id, name, api_key, booking_url, is_platform_default, created_at, updated_at";

export function createChatbotApiKey() {
    return randomBytes(24).toString("hex");
}

export function toAbsoluteAppUrl(pathname: string) {
    return new URL(pathname, getAppUrl()).toString();
}

export function buildChatbotEmbedScriptUrl() {
    return toAbsoluteAppUrl("/chatbot.js");
}

export function buildChatbotEmbedIframeUrl(apiKey: string) {
    return toAbsoluteAppUrl(`/chatbot/embed?client=${encodeURIComponent(apiKey)}`);
}

export function buildChatbotEmbedSnippet(apiKey: string) {
    return `<script src="${buildChatbotEmbedScriptUrl()}" data-client="${apiKey}" defer></script>`;
}

export function resolveChatbotBookingUrl(
    client: Pick<ChatbotClientRecord, "booking_url"> | null,
    contextWorkshopId?: string | null
) {
    if (client?.booking_url?.trim()) {
        return client.booking_url.trim();
    }

    if (contextWorkshopId) {
        return toAbsoluteAppUrl(`/workshop/${encodeURIComponent(contextWorkshopId)}`);
    }

    return toAbsoluteAppUrl("/explore");
}

async function getClientByColumn(
    serviceClient: SupabaseServerClient,
    column: "id" | "api_key" | "host_user_id",
    value: string
) {
    const { data, error } = await serviceClient
        .from("clients")
        .select(CHATBOT_CLIENT_SELECT)
        .eq(column, value)
        .maybeSingle();

    if (error) {
        throw error;
    }

    return (data as ChatbotClientRecord | null) ?? null;
}

async function getHostDisplayName(serviceClient: SupabaseServerClient, userId: string) {
    const { data, error } = await serviceClient
        .from("profiles")
        .select("full_name")
        .eq("id", userId)
        .maybeSingle();

    if (error) {
        return "Host AI Assistant";
    }

    return data?.full_name?.trim() || "Host AI Assistant";
}

export async function getPlatformChatbotClient(serviceClient: SupabaseServerClient) {
    const { data, error } = await serviceClient
        .from("clients")
        .select(CHATBOT_CLIENT_SELECT)
        .eq("is_platform_default", true)
        .maybeSingle();

    if (error) {
        throw error;
    }

    return (data as ChatbotClientRecord | null) ?? null;
}

export async function getChatbotClientById(serviceClient: SupabaseServerClient, clientId: string) {
    return getClientByColumn(serviceClient, "id", clientId);
}

export async function getChatbotClientByApiKey(
    serviceClient: SupabaseServerClient,
    apiKey: string
) {
    return getClientByColumn(serviceClient, "api_key", apiKey);
}

export async function getChatbotClientByHostUserId(
    serviceClient: SupabaseServerClient,
    hostUserId: string
) {
    return getClientByColumn(serviceClient, "host_user_id", hostUserId);
}

export async function getOrCreateHostChatbotClient(
    serviceClient: SupabaseServerClient,
    hostUserId: string
): Promise<ChatbotClientRecord> {
    const existing = await getChatbotClientByHostUserId(serviceClient, hostUserId);
    if (existing) {
        return existing;
    }

    const name = await getHostDisplayName(serviceClient, hostUserId);
    const { data, error } = await serviceClient
        .from("clients")
        .insert({
            host_user_id: hostUserId,
            name,
            api_key: createChatbotApiKey(),
            is_platform_default: false,
        })
        .select(CHATBOT_CLIENT_SELECT)
        .single();

    if (error) {
        if (
            String(error.message || "")
                .toLowerCase()
                .includes("duplicate")
        ) {
            const duplicatedClient = await getChatbotClientByHostUserId(serviceClient, hostUserId);
            if (duplicatedClient) {
                return duplicatedClient;
            }
        }

        throw error;
    }

    return data as ChatbotClientRecord;
}

export async function rotateHostChatbotApiKey(
    serviceClient: SupabaseServerClient,
    clientId: string
) {
    const { data, error } = await serviceClient
        .from("clients")
        .update({
            api_key: createChatbotApiKey(),
        })
        .eq("id", clientId)
        .select(CHATBOT_CLIENT_SELECT)
        .single();

    if (error) {
        throw error;
    }

    return data as ChatbotClientRecord;
}

export async function resolveChatbotClient(
    serviceClient: SupabaseServerClient,
    options: {
        clientApiKey?: string | null;
        clientId?: string | null;
        contextWorkshopId?: string | null;
        allowClientIdLookup?: boolean;
    }
): Promise<ResolvedChatbotClient> {
    if (options.clientApiKey?.trim()) {
        const client = await getChatbotClientByApiKey(serviceClient, options.clientApiKey.trim());
        return {
            client,
            explicitLookupFailed: !client,
            source: "api_key",
        };
    }

    if (options.clientId?.trim()) {
        if (!options.allowClientIdLookup) {
            return {
                client: null,
                explicitLookupFailed: true,
                source: "client_id",
            };
        }

        const client = await getChatbotClientById(serviceClient, options.clientId.trim());
        return {
            client,
            explicitLookupFailed: !client,
            source: "client_id",
        };
    }

    if (options.contextWorkshopId?.trim()) {
        const workshopLookup = await getWorkshopOwnerLookup(
            serviceClient,
            options.contextWorkshopId.trim()
        );

        if (workshopLookup.ownerUserId) {
            const client = await getChatbotClientByHostUserId(
                serviceClient,
                workshopLookup.ownerUserId
            );

            if (client) {
                return {
                    client,
                    explicitLookupFailed: false,
                    source: "workshop",
                };
            }
        }

        return {
            client: await getPlatformChatbotClient(serviceClient),
            explicitLookupFailed: false,
            source: "workshop",
        };
    }

    return {
        client: await getPlatformChatbotClient(serviceClient),
        explicitLookupFailed: false,
        source: "platform_default",
    };
}
