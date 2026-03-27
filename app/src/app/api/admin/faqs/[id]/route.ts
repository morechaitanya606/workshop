import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { handleApiError, parseBody } from "@/lib/api-route";
import { jsonError, requireAdminUser } from "@/lib/api-auth";
import { requireSupabaseService } from "@/lib/api-helpers";
import { getPlatformChatbotClient } from "@/lib/chatbot-clients";
import { generateChatbotFaqEmbedding, toVectorLiteral } from "@/lib/chatbot-vector-search";
import { getHuggingFaceEmbeddingConfig } from "@/lib/env";
import { FAQ_ADMIN_SELECT_FIELDS, isMissingFaqTableError } from "@/lib/faqs";
import { faqEntryUpdateSchema } from "@/lib/validators";

type RouteContext = {
    params: {
        id: string;
    };
};

export async function PATCH(request: NextRequest, context: RouteContext) {
    const auth = await requireAdminUser(request);
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
        const platformClient = await getPlatformChatbotClient(service.client);
        if (!platformClient) {
            return jsonError("Platform chatbot client is unavailable.", 500);
        }

        const { data: existingFaq, error: existingFaqError } = await service.client
            .from("faq")
            .select("id, client_id, question, answer")
            .eq("id", context.params.id)
            .eq("client_id", platformClient.id)
            .maybeSingle();

        if (existingFaqError) {
            throw existingFaqError;
        }

        if (!existingFaq) {
            return jsonError("FAQ not found.", 404);
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
            .eq("client_id", platformClient.id)
            .select(FAQ_ADMIN_SELECT_FIELDS)
            .single();

        if (error) {
            if (isMissingFaqTableError(error)) {
                return jsonError(
                    "FAQ table is unavailable. Run the latest Supabase migration first.",
                    500
                );
            }

            throw error;
        }

        return NextResponse.json({ faq: data });
    } catch (error) {
        return handleApiError("Failed to update FAQ.", error);
    }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
    const auth = await requireAdminUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    const service = requireSupabaseService();
    if (!service.ok) {
        return service.response;
    }

    try {
        const platformClient = await getPlatformChatbotClient(service.client);
        if (!platformClient) {
            return jsonError("Platform chatbot client is unavailable.", 500);
        }

        const { error } = await service.client
            .from("faq")
            .delete()
            .eq("id", context.params.id)
            .eq("client_id", platformClient.id);

        if (error) {
            if (isMissingFaqTableError(error)) {
                return jsonError(
                    "FAQ table is unavailable. Run the latest Supabase migration first.",
                    500
                );
            }

            throw error;
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        return handleApiError("Failed to delete FAQ.", error);
    }
}
