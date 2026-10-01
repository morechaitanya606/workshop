import type { ChatbotLlmMessage } from "@/lib/chatbot-prompt";

/** Types and helpers shared by the failover chain (chatbot-llm.ts) and each provider client. */

export type ChatbotLlmProviderName = "groq" | "openai" | "anthropic" | "huggingface";

export type ChatbotLlmProvider = {
    name: ChatbotLlmProviderName;
    apiKey: string;
    /** Tried in order. A later model is the fallback for an earlier one. */
    models: string[];
    /** Chat-completions URL for the OpenAI-compatible providers; unused for Anthropic. */
    endpoint?: string;
};

/**
 * - `retryable`: 429, 5xx or a network error; the same model is retried once.
 * - `model`: this model cannot answer (gone, bad request, empty reply, refusal); try the next.
 * - `provider`: the key is rejected; every model of this provider would fail the same way.
 * - `timeout`: the provider is too slow right now; spend the remaining budget elsewhere.
 */
export type ChatbotAttemptResult =
    | { ok: true; reply: string }
    | {
          ok: false;
          failure: "retryable" | "model" | "provider" | "timeout";
          retryDelayMs?: number;
      };

export type ChatbotAttemptInput = {
    provider: ChatbotLlmProvider;
    model: string;
    messages: ChatbotLlmMessage[];
    fetchImpl: typeof fetch;
    timeoutMs: number;
    defaultRetryDelayMs: number;
};

const MAX_RETRY_DELAY_MS = 1500;

/** Seconds from a `retry-after` header, capped so one provider cannot eat the budget. */
export function parseRetryAfterMs(header: string | null | undefined, fallbackMs: number) {
    const seconds = header ? Number(header) : NaN;
    if (Number.isFinite(seconds) && seconds >= 0) {
        return Math.min(seconds * 1000, MAX_RETRY_DELAY_MS);
    }

    return fallbackMs;
}

/** Some models wrap reasoning in <think> tags; users must never see it. */
export function cleanModelReply(value: string) {
    return value.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}
