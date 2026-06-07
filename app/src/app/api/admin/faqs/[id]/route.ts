import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { handleApiError, parseBody } from "@/lib/api-route";
import { jsonError, requireAdminUser } from "@/lib/api-auth";
import { requireSupabaseService } from "@/lib/api-helpers";
import { generateChatbotFaqEmbedding, toVectorLiteral } from "@/lib/chatbot-vector-search";
import { getHuggingFaceEmbeddingConfig } from "@/lib/env";
import {
    FAQ_ADMIN_SELECT_FIELDS,
    FAQ_LEGACY_SELECT_FIELDS,
    getOptionalPlatformChatbotClient,
    isFaqClientScopeUnavailableError,
    isMissingFaqTableError,
} from "@/lib/faqs";
import { faqEntryUpdateSchema } from "@/lib/validators";

type RouteContext = {
    params: Promise<{
        id: string;
    }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
    const { id } = await context.params;
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

    try {
        const platformClient = await getOptionalPlatformChatbotClient(service.client);

        if (platformClient) {
            const embeddingConfig = getHuggingFaceEmbeddingConfig();
            if (!embeddingConfig) {
                return jsonError(
                    "Embedding service is not configured. Add HUGGINGFACE_API_KEY first.",
                    500
                );
            }

            const { data: existingFaq, error: existingFaqError } = await service.client
                .from("faq")
                .select("id, client_id, question, answer")
                .eq("id", id)
                .eq("client_id", platformClient.id)
                .maybeSingle();

            if (existingFaqError) {
                if (!isFaqClientScopeUnavailableError(existingFaqError)) {
                    throw existingFaqError;
                }
            } else if (!existingFaq) {
                return jsonError("FAQ not found.", 404);
            } else {
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
                    .eq("id", id)
                    .eq("client_id", platformClient.id)
                    .select(FAQ_ADMIN_SELECT_FIELDS)
                    .single();

                if (!error) {
                    return NextResponse.json({ faq: data });
                }

                if (isMissingFaqTableError(error)) {
                    return jsonError(
                        "FAQ table is unavailable. Run the latest Supabase migration first.",
                        500
                    );
                }

                if (!isFaqClientScopeUnavailableError(error)) {
                    throw error;
                }
            }
        }

        const { data, error } = await service.client
            .from("faq")
            .update(parsed.data)
            .eq("id", id)
            .select(FAQ_LEGACY_SELECT_FIELDS)
            .maybeSingle();

        if (error) {
            if (isMissingFaqTableError(error)) {
                return jsonError(
                    "FAQ table is unavailable. Run the latest Supabase migration first.",
                    500
                );
            }

            throw error;
        }

        if (!data) {
            return jsonError("FAQ not found.", 404);
        }

        return NextResponse.json({ faq: data });
    } catch (error) {
        return handleApiError("Failed to update FAQ.", error);
    }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
    const { id } = await context.params;
    const auth = await requireAdminUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    const service = requireSupabaseService();
    if (!service.ok) {
        return service.response;
    }

    try {
        const platformClient = await getOptionalPlatformChatbotClient(service.client);

        if (platformClient) {
            const { error } = await service.client
                .from("faq")
                .delete()
                .eq("id", id)
                .eq("client_id", platformClient.id);

            if (!error) {
                return NextResponse.json({ success: true });
            }

            if (isMissingFaqTableError(error)) {
                return jsonError(
                    "FAQ table is unavailable. Run the latest Supabase migration first.",
                    500
                );
            }

            if (!isFaqClientScopeUnavailableError(error)) {
                throw error;
            }
        }

        const { error } = await service.client.from("faq").delete().eq("id", id);

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
