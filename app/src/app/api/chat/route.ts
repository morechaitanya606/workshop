import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { generateChatbotReply } from "@/lib/chatbot";
import { resolveChatbotClient } from "@/lib/chatbot-clients";
import { isChatbotMatchBelowThreshold, searchChatbotFaqs } from "@/lib/chatbot-vector-search";
import { getGroqConfig, getHuggingFaceEmbeddingConfig } from "@/lib/env";
import { assertRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { loadSupportChatWorkshops } from "@/lib/support-chat";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase-server";
import { handleApiError, parseBody } from "@/lib/api-route";
import { jsonError } from "@/lib/api-auth";
import { chatbotRequestSchema } from "@/lib/validators";

async function persistLead(clientId: string | null, name: string, phone: string, query: string) {
    if (!isSupabaseServiceConfigured || !clientId) {
        return;
    }

    try {
        const client = createSupabaseServiceClient({ requestTimeoutMs: 5000 });
        await client.from("leads").insert({
            client_id: clientId,
            name,
            phone,
            query,
        });
    } catch {
        // Lead persistence should not block the booking flow.
    }
}

async function persistUnansweredQuestion(clientId: string | null, question: string) {
    if (!isSupabaseServiceConfigured || !clientId) {
        return;
    }

    try {
        const client = createSupabaseServiceClient({ requestTimeoutMs: 5000 });
        await client.from("unanswered_questions").insert({
            client_id: clientId,
            question,
        });
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
            parsed.data.stage === "idle" ? await loadSupportChatWorkshops() : undefined;
        const groq = getGroqConfig();
        const embeddingConfig = getHuggingFaceEmbeddingConfig();
        const serviceClient = isSupabaseServiceConfigured
            ? createSupabaseServiceClient({ requestTimeoutMs: 5000 })
            : null;
        const resolvedClient = serviceClient
            ? await resolveChatbotClient(serviceClient, {
                  clientApiKey: parsed.data.clientApiKey,
                  clientId: parsed.data.clientId,
                  contextWorkshopId: parsed.data.contextWorkshopId,
              })
            : {
                  client: null,
                  explicitLookupFailed: false,
                  source: "platform_default" as const,
              };

        if (resolvedClient.explicitLookupFailed) {
            return jsonError("Unknown chatbot client.", 404);
        }

        const result = await generateChatbotReply({
            message: parsed.data.message,
            stage: parsed.data.stage,
            lead: parsed.data.lead,
            faqs: [],
            workshops,
            contextWorkshopId: parsed.data.contextWorkshopId,
            groq,
            retrieveRelevantFaqs:
                serviceClient && embeddingConfig && resolvedClient.client
                    ? async (message) => {
                          const matches = await searchChatbotFaqs(serviceClient, {
                              clientId: resolvedClient.client?.id || "",
                              message,
                              embeddingConfig,
                          });

                          if (isChatbotMatchBelowThreshold(matches)) {
                              return [];
                          }

                          return matches;
                      }
                    : undefined,
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
