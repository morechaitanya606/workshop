import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { handleApiError, parseBody } from "@/lib/api-route";
import { jsonError, requireHostOrAdmin } from "@/lib/api-auth";
import { requireSupabaseService } from "@/lib/api-helpers";
import { getOrCreateHostChatbotClient } from "@/lib/chatbot-clients";
import { generateChatbotFaqEmbedding, toVectorLiteral } from "@/lib/chatbot-vector-search";
import { getHuggingFaceEmbeddingConfig } from "@/lib/env";
import { FAQ_ADMIN_SELECT_FIELDS } from "@/lib/faqs";
import { faqEntryUpdateSchema } from "@/lib/validators";

type RouteContext = {
    params: {
        id: string;
    };
};

export async function PATCH(request: NextRequest, context: RouteContext) {
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
        faqEntryUpdateSchema,
        "Invalid FAQ payload.",
        "FAQ update is invalid."
    );
    if (!parsed.ok) {
        return parsed.response;
    }

    const embeddingConfig = getHuggingFaceEmbeddingConfig();
    if (!embeddingConfig) {
        return jsonError(
            "Embedding service is not configured. Add HUGGINGFACE_API_KEY first.",
            500
        );
    }

    try {
        const chatbotClient = await getOrCreateHostChatbotClient(service.client, auth.user.id);
        const { data: existingFaq, error: existingFaqError } = await service.client
            .from("faq")
            .select("id, client_id, question, answer")
            .eq("id", context.params.id)
            .eq("client_id", chatbotClient.id)
            .maybeSingle();

        if (existingFaqError) {
            throw existingFaqError;
        }

        if (!existingFaq) {
            return jsonError("Chatbot FAQ not found.", 404);
        }

        const nextQuestion = parsed.data.question ?? existingFaq.question;
        const nextAnswer = parsed.data.answer ?? existingFaq.answer;
        const embedding = await generateChatbotFaqEmbedding(
            nextQuestion,
            nextAnswer,
            embeddingConfig
        );

        const { data, error } = await service.client
            .from("faq")
            .update({
                ...parsed.data,
                embedding: toVectorLiteral(embedding),
            })
            .eq("id", context.params.id)
            .eq("client_id", chatbotClient.id)
            .select(FAQ_ADMIN_SELECT_FIELDS)
            .single();

        if (error) {
            throw error;
        }

        return NextResponse.json({ faq: data });
    } catch (error) {
        return handleApiError("Failed to update chatbot FAQ.", error);
    }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
    const auth = await requireHostOrAdmin(request);
    if (!auth.ok) {
        return auth.response;
    }

    const service = requireSupabaseService();
    if (!service.ok) {
        return service.response;
    }

    try {
        const chatbotClient = await getOrCreateHostChatbotClient(service.client, auth.user.id);
        const { error } = await service.client
            .from("faq")
            .delete()
            .eq("id", context.params.id)
            .eq("client_id", chatbotClient.id);

        if (error) {
            throw error;
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        return handleApiError("Failed to delete chatbot FAQ.", error);
    }
}
