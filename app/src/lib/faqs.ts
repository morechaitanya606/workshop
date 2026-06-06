import { getPlatformChatbotClient } from "@/lib/chatbot-clients";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase-server";

export const FAQ_PUBLIC_SELECT_FIELDS = "id, question, answer";
export const FAQ_ADMIN_SELECT_FIELDS = "id, client_id, question, answer, created_at, updated_at";

export type PublicFaqRow = {
    id: string;
    question: string;
    answer: string;
};

export function isMissingFaqTableError(error: unknown) {
    const message =
        error && typeof error === "object" && "message" in error
            ? String((error as { message?: unknown }).message || "").toLowerCase()
            : "";

    return (
        message.includes("faq") &&
        (message.includes("does not exist") || message.includes("schema cache"))
    );
}

export async function loadFaqRows(options?: { clientId?: string | null }) {
    if (!isSupabaseServiceConfigured) {
        return [];
    }

    try {
        const client = createSupabaseServiceClient({ requestTimeoutMs: 5000 });
        const resolvedClientId =
            options?.clientId || (await getPlatformChatbotClient(client))?.id || null;

        if (!resolvedClientId) {
            return [];
        }

        const { data, error } = await client
            .from("faq")
            .select(FAQ_PUBLIC_SELECT_FIELDS)
            .eq("client_id", resolvedClientId)
            .order("created_at", { ascending: true });

        if (error) {
            if (isMissingFaqTableError(error)) {
                return [];
            }

            throw error;
        }

        return (Array.isArray(data) ? data : []) as PublicFaqRow[];
    } catch {
        return [];
    }
}
