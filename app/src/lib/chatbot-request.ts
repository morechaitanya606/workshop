import { z } from "zod";
import { chatbotRequestSchema } from "@/lib/validators";

/**
 * Conversation context sent with each chat message. Bounded here and again when the prompt
 * is built; `bot` is accepted as an alias of `assistant` because the widget's own message
 * role is `bot`.
 */
export const chatbotHistoryTurnSchema = z.object({
    role: z
        .enum(["user", "assistant", "bot"])
        .transform((role) => (role === "bot" ? "assistant" : role)),
    content: z.string().max(2000),
});

/** `/api/chat` payload: the base chatbot schema plus history and a language hint. */
export const chatbotChatRequestSchema = chatbotRequestSchema.extend({
    history: z.array(chatbotHistoryTurnSchema).max(20).optional().default([]),
    // A locale ("hi", "mr-Latn") or a BCP-47 tag ("hi-IN"); only a hint, never trusted.
    language: z.string().trim().max(16).optional(),
});

export type ChatbotChatRequestInput = z.infer<typeof chatbotChatRequestSchema>;
