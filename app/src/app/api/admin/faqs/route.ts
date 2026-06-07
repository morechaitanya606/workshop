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
    loadAdminFaqRows,
} from "@/lib/faqs";
import { faqEntrySchema } from "@/lib/validators";

export async function GET(request: NextRequest) {
    const auth = await requireAdminUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    const service = requireSupabaseService();
    if (!service.ok) {
        return service.response;
    }

    try {
        return NextResponse.json({ faqs: await loadAdminFaqRows(service.client) });
    } catch (error) {
        return handleApiError("Failed to load FAQs.", error);
    }
}

export async function POST(request: NextRequest) {
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
        faqEntrySchema,
        "Invalid FAQ payload.",
        "FAQ request is invalid."
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

            const embedding = await generateChatbotFaqEmbedding(
                parsed.data.question,
                parsed.data.answer,
                embeddingConfig
            );

            const { data, error } = await service.client
                .from("faq")
                .insert({
                    client_id: platformClient.id,
                    question: parsed.data.question,
                    answer: parsed.data.answer,
                    embedding: toVectorLiteral(embedding),
                })
                .select(FAQ_ADMIN_SELECT_FIELDS)
                .single();

            if (!error) {
                return NextResponse.json({ faq: data }, { status: 201 });
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

        const { data, error } = await service.client
            .from("faq")
            .insert({
                question: parsed.data.question,
                answer: parsed.data.answer,
            } as never)
            .select(FAQ_LEGACY_SELECT_FIELDS)
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

        return NextResponse.json({ faq: data }, { status: 201 });
    } catch (error) {
        return handleApiError("Failed to create FAQ.", error);
    }
}
