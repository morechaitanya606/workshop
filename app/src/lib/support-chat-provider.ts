import type { Workshop } from "@/lib/data";
import {
    SUPPORT_CHAT_POLICY,
    SUPPORT_CHAT_PROVIDER_WORKSHOP_LIMIT,
} from "@/lib/support-chat-config";

export type SupportChatProviderPolicySnippet = {
    topic: "booking" | "cancellation" | "payment";
    text: string;
};

export type SupportChatProviderWorkshopSnippet = {
    id: string;
    title: string;
    category: string;
    date: string;
    time: string;
    location: string;
    city: string;
    price: number;
    seatsRemaining: number;
    hostName: string;
    whatYouLearn: string[];
    materialsProvided: string[];
};

export type SupportChatProviderContext = {
    message: string;
    userDisplayName?: string | null;
    contextWorkshopId?: string | null;
    workshops: SupportChatProviderWorkshopSnippet[];
    policies: SupportChatProviderPolicySnippet[];
};

export interface SupportChatProviderAdapter {
    readonly name: string;
    readonly enabled: boolean;
    generateReply(context: SupportChatProviderContext): Promise<string | null>;
}

class DisabledSupportChatProviderAdapter implements SupportChatProviderAdapter {
    readonly name = "disabled";
    readonly enabled = false;

    async generateReply(_context: SupportChatProviderContext) {
        return null;
    }
}

export const supportChatProviderAdapter: SupportChatProviderAdapter =
    new DisabledSupportChatProviderAdapter();

export function buildSupportChatProviderContext(input: {
    message: string;
    workshops: Workshop[];
    userDisplayName?: string | null;
    contextWorkshopId?: string | null;
}): SupportChatProviderContext {
    return {
        message: input.message,
        userDisplayName: input.userDisplayName ?? null,
        contextWorkshopId: input.contextWorkshopId ?? null,
        workshops: input.workshops
            .slice(0, SUPPORT_CHAT_PROVIDER_WORKSHOP_LIMIT)
            .map((workshop) => ({
                id: workshop.id,
                title: workshop.title,
                category: workshop.category,
                date: workshop.date,
                time: workshop.time,
                location: workshop.location,
                city: workshop.city,
                price: workshop.price,
                seatsRemaining: workshop.seatsRemaining,
                hostName: workshop.hostName,
                whatYouLearn: workshop.whatYouLearn.slice(0, 4),
                materialsProvided: workshop.materialsProvided.slice(0, 4),
            })),
        policies: [
            {
                topic: "booking",
                text: `Use the "${SUPPORT_CHAT_POLICY.booking.callToAction}" CTA and complete payment within ${SUPPORT_CHAT_POLICY.booking.holdWindowMinutes} minutes. ${SUPPORT_CHAT_POLICY.booking.confirmationText}`,
            },
            {
                topic: "cancellation",
                text: `Full refund is available up to ${SUPPORT_CHAT_POLICY.cancellation.fullRefundWindowHours} hours before the workshop. Refunds usually take ${SUPPORT_CHAT_POLICY.cancellation.refundProcessingWindow}.`,
            },
            {
                topic: "payment",
                text: `${SUPPORT_CHAT_POLICY.payment.providerName} handles payments. If money is deducted without a confirmed booking, refunds are typically processed within ${SUPPORT_CHAT_POLICY.payment.autoRefundWindow}.`,
            },
        ],
    };
}
