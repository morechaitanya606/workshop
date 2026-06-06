import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
    DEFAULT_CHATBOT_FAQS,
    generateChatbotReply,
    tokenizeChatText,
    type ChatbotFaq,
} from "@/lib/chatbot";
import { resolveChatbotClient } from "@/lib/chatbot-clients";
import { isChatbotMatchBelowThreshold, searchChatbotFaqs } from "@/lib/chatbot-vector-search";
import { getGroqConfig, getHuggingFaceEmbeddingConfig } from "@/lib/env";
import { assertRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { loadSupportChatWorkshops } from "@/lib/support-chat";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase-server";
import { handleApiError, parseBody } from "@/lib/api-route";
import { jsonError } from "@/lib/api-auth";
import { chatbotRequestSchema } from "@/lib/validators";

const defaultChatbotFaqs: ChatbotFaq[] = DEFAULT_CHATBOT_FAQS.map((faq, index) => ({
    id: `default-${index + 1}`,
    question: faq.question,
    answer: faq.answer,
}));

function searchDefaultChatbotFaqs(message: string) {
    const messageTokens = new Set(tokenizeChatText(message));
    if (messageTokens.size === 0) {
        return [];
    }

    return defaultChatbotFaqs
        .map((faq) => {
            const faqTokens = new Set(tokenizeChatText(`${faq.question} ${faq.answer}`));
            const score = Array.from(messageTokens).reduce(
                (total, token) => total + (faqTokens.has(token) ? 1 : 0),
                0
            );

            return { faq, score };
        })
        .filter((match) => match.score > 0)
        .sort((left, right) => right.score - left.score)
        .map((match) => match.faq);
}

async function persistLead(clientId: string | null, name: string, phone: string, query: string) {
    if (!isSupabaseServiceConfigured) {
        return;
    }

    try {
        const client = createSupabaseServiceClient({ requestTimeoutMs: 5000 });
        if (clientId) {
            const { error } = await client.from("leads").insert({
                client_id: clientId,
                name,
                phone,
                query,
            });
            if (!error) {
                return;
            }
        }

        await client.from("leads").insert({
            name,
            phone,
            query,
        } as any);
    } catch {
        // Lead persistence should not block the booking flow.
    }
}

async function persistUnansweredQuestion(clientId: string | null, question: string) {
    if (!isSupabaseServiceConfigured) {
        return;
    }

    try {
        const client = createSupabaseServiceClient({ requestTimeoutMs: 5000 });
        if (clientId) {
            const { error } = await client.from("unanswered_questions").insert({
                client_id: clientId,
                question,
            });
            if (!error) {
                return;
            }
        }

        await client.from("unanswered_questions").insert({
            question,
        } as any);
    } catch {
        // Logging unanswered questions should not block the chat reply.
    }
}

export async function POST(request: NextRequest) {
    const rateLimitResult = await assertRateLimit({
        key: getRateLimitKey(request, "api-chat"),
        limit: 30,
        windowMs: 60_000,
        message: "Too many chatbot messages. Please wait a moment and try again.",
    });
    if (!rateLimitResult.ok) {
        return rateLimitResult.response;
    }

    const parsed = await parseBody(
        request,
        chatbotRequestSchema,
        "Invalid chat payload.",
        "Chat request is invalid."
    );
    if (!parsed.ok) {
        return parsed.response;
    }

    try {
        const workshops =
            parsed.data.stage === "idle"
                ? await loadSupportChatWorkshops().catch(() => undefined)
                : undefined;

        const groq = getGroqConfig();
        const embeddingConfig = getHuggingFaceEmbeddingConfig();
        const serviceClient = isSupabaseServiceConfigured
            ? createSupabaseServiceClient({ requestTimeoutMs: 5000 })
            : null;
        const fallbackResolvedClient: Awaited<ReturnType<typeof resolveChatbotClient>> = {
            client: null,
            explicitLookupFailed: false,
            source: "platform_default" as const,
        };
        let resolvedClient: Awaited<ReturnType<typeof resolveChatbotClient>> =
            fallbackResolvedClient;

        if (serviceClient) {
            try {
                resolvedClient = await resolveChatbotClient(serviceClient, {
                    clientApiKey: parsed.data.clientApiKey,
                    clientId: parsed.data.clientId,
                    contextWorkshopId: parsed.data.contextWorkshopId,
                });
            } catch {
                resolvedClient = fallbackResolvedClient;
            }
        }

        if (resolvedClient.explicitLookupFailed) {
            return jsonError("Unknown chatbot client.", 404);
        }

        const canUseTenantRag = Boolean(
            serviceClient && embeddingConfig && resolvedClient.client?.id
        );

        const result = await generateChatbotReply({
            message: parsed.data.message,
            stage: parsed.data.stage,
            lead: parsed.data.lead,
            faqs: [],
            workshops,
            contextWorkshopId: parsed.data.contextWorkshopId,
            groq,
            retrieveRelevantFaqs: async (message) => {
                if (
                    !(canUseTenantRag && serviceClient && embeddingConfig && resolvedClient.client)
                ) {
                    return searchDefaultChatbotFaqs(message);
                }

                try {
                    const matches = await searchChatbotFaqs(serviceClient, {
                        clientId: resolvedClient.client?.id || "",
                        message,
                        embeddingConfig,
                    });

                    if (isChatbotMatchBelowThreshold(matches)) {
                        return [];
                    }

                    return matches;
                } catch {
                    return searchDefaultChatbotFaqs(message);
                }
            },
            onLeadCaptured: async (lead) => {
                await persistLead(
                    resolvedClient.client?.id ?? null,
                    lead.name,
                    lead.phone,
                    lead.query
                );
            },
            onUnansweredQuestion: async (question) => {
                await persistUnansweredQuestion(resolvedClient.client?.id ?? null, question);
            },
        });

        return NextResponse.json(result, {
            headers: {
                "Cache-Control": "no-store",
            },
        });
    } catch (error) {
        return handleApiError("Failed to generate chatbot reply.", error);
    }
}
