import type { Tables } from "@/lib/database.types";
import { embedChatbotPassage, embedChatbotQuery } from "@/lib/chatbot-embeddings";
import type { SupabaseServerClient } from "@/lib/supabase-server";

type HuggingFaceEmbeddingConfig = {
    apiKey: string;
    endpoint: string;
    model: string;
};

export type ChatbotFaqMatch = Pick<Tables<"faq">, "id" | "client_id" | "question" | "answer"> & {
    similarity: number;
};

const DEFAULT_CHATBOT_MATCH_COUNT = 3;
export const DEFAULT_CHATBOT_SIMILARITY_THRESHOLD = 0.62;

export function buildChatbotFaqDocument(question: string, answer: string) {
    return `Q: ${question.trim()}\nA: ${answer.trim()}`;
}

export function toVectorLiteral(vector: number[]) {
    return `[${vector.join(",")}]`;
}

export async function generateChatbotFaqEmbedding(
    question: string,
    answer: string,
    config: HuggingFaceEmbeddingConfig,
    fetchImpl?: typeof fetch
) {
    return embedChatbotPassage(buildChatbotFaqDocument(question, answer), config, fetchImpl);
}

export async function searchChatbotFaqs(
    serviceClient: SupabaseServerClient,
    options: {
        clientId: string;
        message: string;
        embeddingConfig: HuggingFaceEmbeddingConfig;
        matchCount?: number;
        fetchImpl?: typeof fetch;
    }
) {
    const queryEmbedding = await embedChatbotQuery(
        options.message,
        options.embeddingConfig,
        options.fetchImpl
    );

    const { data, error } = await serviceClient.rpc("match_faqs", {
        p_client_id: options.clientId,
        p_query_embedding: toVectorLiteral(queryEmbedding),
        p_match_count: options.matchCount ?? DEFAULT_CHATBOT_MATCH_COUNT,
    });

    if (error) {
        throw error;
    }

    return ((Array.isArray(data) ? data : []) as ChatbotFaqMatch[]).map((row) => ({
        ...row,
        similarity: Number(row.similarity ?? 0),
    }));
}

export function isChatbotMatchBelowThreshold(
    matches: Array<Pick<ChatbotFaqMatch, "similarity">>,
    threshold = DEFAULT_CHATBOT_SIMILARITY_THRESHOLD
) {
    const bestMatch = matches[0];
    return !bestMatch || Number(bestMatch.similarity ?? 0) < threshold;
}
