import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-route";
import { requireHostOrAdmin } from "@/lib/api-auth";
import { requireSupabaseService } from "@/lib/api-helpers";
import { getOrCreateHostChatbotClient } from "@/lib/chatbot-clients";

export async function GET(request: NextRequest) {
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
        const { data, error } = await service.client
            .from("unanswered_questions")
            .select("id, client_id, question, created_at")
            .eq("client_id", chatbotClient.id)
            .order("created_at", { ascending: false });

        if (error) {
            throw error;
        }

        return NextResponse.json({
            unansweredQuestions: Array.isArray(data) ? data : [],
        });
    } catch (error) {
        return handleApiError("Failed to load unanswered questions.", error);
    }
}
