import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { handleApiError, parseBody } from "@/lib/api-route";
import { jsonError, requireAdminUser } from "@/lib/api-auth";
import { requireSupabaseService } from "@/lib/api-helpers";
import { getPlatformChatbotClient } from "@/lib/chatbot-clients";
import { generateChatbotFaqEmbedding, toVectorLiteral } from "@/lib/chatbot-vector-search";
import { getHuggingFaceEmbeddingConfig } from "@/lib/env";
import { FAQ_ADMIN_SELECT_FIELDS, getDefaultFaqRows, isMissingFaqTableError } from "@/lib/faqs";
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
        const platformClient = await getPlatformChatbotClient(service.client);
        if (!platformClient) {
            return jsonError("Platform chatbot client is unavailable.", 500);
        }

        const { data, error } = await service.client
            .from("faq")
            .select(FAQ_ADMIN_SELECT_FIELDS)
            .eq("client_id", platformClient.id)
            .order("updated_at", { ascending: false });

        if (error) {
            if (isMissingFaqTableError(error)) {
                return NextResponse.json({ faqs: getDefaultFaqRows() });
            }

            throw error;
        }

        return NextResponse.json({
            faqs: Array.isArray(data) ? data : [],
        });
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
