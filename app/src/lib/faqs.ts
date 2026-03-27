import { DEFAULT_CHATBOT_FAQS, type ChatbotFaq } from "@/lib/chatbot";
import { getPlatformChatbotClient } from "@/lib/chatbot-clients";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase-server";

export const FAQ_PUBLIC_SELECT_FIELDS = "id, question, answer";
export const FAQ_ADMIN_SELECT_FIELDS = "id, client_id, question, answer, created_at, updated_at";

export function getDefaultFaqRows(): ChatbotFaq[] {
    return DEFAULT_CHATBOT_FAQS.map((faq, index) => ({
        id: `default-faq-${index + 1}`,
        question: faq.question,
        answer: faq.answer,
    }));
}

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
        return getDefaultFaqRows();
    }

    try {
        const client = createSupabaseServiceClient({ requestTimeoutMs: 5000 });
        const resolvedClientId =
            options?.clientId || (await getPlatformChatbotClient(client))?.id || null;

        if (!resolvedClientId) {
            return getDefaultFaqRows();
        }

        const { data, error } = await client
            .from("faq")
            .select(FAQ_PUBLIC_SELECT_FIELDS)
            .eq("client_id", resolvedClientId)
            .order("created_at", { ascending: true });

        if (error) {
            if (isMissingFaqTableError(error)) {
                return getDefaultFaqRows();
            }

            throw error;
        }

        const rows = (Array.isArray(data) ? data : []) as ChatbotFaq[];
        return rows.length > 0 ? rows : getDefaultFaqRows();
    } catch {
        return getDefaultFaqRows();
    }
}
