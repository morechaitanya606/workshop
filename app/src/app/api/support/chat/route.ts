import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { handleApiError, parseBody } from "@/lib/api-route";
import { loadSupportChatWorkshops, resolveSupportChatReply } from "@/lib/support-chat";
import { supportChatRequestSchema } from "@/lib/validators";

export async function POST(request: NextRequest) {
    const parsed = await parseBody(
        request,
        supportChatRequestSchema,
        "Invalid chat payload.",
        "Support chat request is invalid."
    );
    if (!parsed.ok) {
        return parsed.response;
    }

    try {
        const workshops = await loadSupportChatWorkshops();
        const result = resolveSupportChatReply(parsed.data.message, workshops, {
            contextWorkshopId: parsed.data.contextWorkshopId || null,
            userDisplayName: parsed.data.userDisplayName || null,
        });

        return NextResponse.json(
            {
                reply: result.reply,
                contextWorkshopId: result.contextWorkshopId,
                showIssueForm: result.showIssueForm,
                outcome: result.outcome,
                intent: result.intent,
                confidence: result.confidence,
            },
            {
                headers: {
                    "Cache-Control": "no-store",
                },
            }
        );
    } catch (error) {
        return handleApiError("Failed to generate support chat reply.", error);
    }
}
