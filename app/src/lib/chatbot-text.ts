/**
 * Pure chat text helpers, safe to import from client components.
 *
 * These used to live in `chatbot.ts`, which also imports `support-chat.ts` and through it
 * the server-only Supabase client. `SupportChatbot.tsx` is a client component and needed
 * only a phone-number normaliser and a stage type, but the static import pulled the whole
 * server chain into the browser bundle. Nothing here may import a server module.
 */

export type ChatbotStage = "idle" | "asking_name" | "asking_phone" | "completed";

export function normalizeChatText(value: string) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

export function normalizeName(value: string) {
    return value.replace(/\s+/g, " ").trim();
}

export function normalizePhoneNumber(value: string) {
    return value.replace(/\D/g, "");
}

export function isValidPhoneNumber(value: string) {
    return /^\d{10}$/.test(normalizePhoneNumber(value));
}

export function isValidLeadName(value: string) {
    const normalized = normalizeName(value);
    return normalized.length >= 2;
}
