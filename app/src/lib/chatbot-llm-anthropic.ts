import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import {
    cleanModelReply,
    parseRetryAfterMs,
    type ChatbotAttemptInput,
    type ChatbotAttemptResult,
} from "@/lib/chatbot-llm-shared";

/**
 * One chatbot attempt against the Claude API, mapped onto the failover outcomes the chain in
 * chatbot-llm.ts understands (see chatbot-llm-shared.ts). Uses the official SDK; retries are left to the chain (maxRetries
 * 0) so a slow or rate-limited Claude cannot spend the whole request budget on its own.
 */

/**
 * Room for adaptive thinking plus a short answer. The system prompt asks for about 80 words,
 * and finalizeModelReply bounds what reaches the visitor either way.
 */
const ANTHROPIC_MAX_TOKENS = 4096;

/** Models that accept the server-side refusal fallback (`fallbacks: "default"`). */
const SERVER_FALLBACK_MODELS = new Set([
    "claude-fable-5-1",
    "claude-opus-5-5",
    "claude-opus-5",
    "claude-sonnet-5-5",
]);

function toClaudeRequest(messages: ChatbotAttemptInput["messages"]) {
    const system = messages
        .filter((message) => message.role === "system")
        .map((message) => message.content)
        .join("\n\n");

    const turns: Anthropic.Beta.BetaMessageParam[] = messages
        .filter((message) => message.role !== "system")
        .map((message) => ({
            role: message.role === "assistant" ? "assistant" : "user",
            content: message.content,
        }));

    // The Messages API requires the conversation to open with a user turn.
    while (turns.length > 0 && turns[0].role !== "user") {
        turns.shift();
    }

    return { system, turns };
}

export async function requestAnthropicAttempt(
    input: ChatbotAttemptInput
): Promise<ChatbotAttemptResult> {
    const { provider, model, fetchImpl, timeoutMs, defaultRetryDelayMs } = input;
    const { system, turns } = toClaudeRequest(input.messages);
    if (turns.length === 0) {
        return { ok: false, failure: "model" };
    }

    const client = new Anthropic({ apiKey: provider.apiKey, fetch: fetchImpl, maxRetries: 0 });
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const serverFallback = SERVER_FALLBACK_MODELS.has(model);

    try {
        const response = await client.beta.messages.create(
            {
                model,
                max_tokens: ANTHROPIC_MAX_TOKENS,
                system: system || undefined,
                messages: turns,
                // Short support answers do not need deep reasoning; low effort keeps the
                // fallback fast. Haiku models reject the effort parameter.
                ...(model.includes("haiku") ? {} : { output_config: { effort: "low" as const } }),
                // On a policy decline the API reruns the request on its default fallback
                // model inside the same call, instead of returning a refusal.
                ...(serverFallback
                    ? {
                          betas: ["server-side-fallback-2026-07-01"],
                          fallbacks: "default" as const,
                      }
                    : {}),
            },
            { signal: controller.signal, timeout: timeoutMs, maxRetries: 0 }
        );

        if (response.stop_reason === "refusal") {
            return { ok: false, failure: "model" };
        }

        const text = response.content
            .map((block) => (block.type === "text" ? block.text : ""))
            .join("");
        const reply = cleanModelReply(text);
        return reply ? { ok: true, reply } : { ok: false, failure: "model" };
    } catch (error) {
        // Most specific first: the timeout and abort classes extend the connection error.
        if (
            error instanceof Anthropic.APIConnectionTimeoutError ||
            error instanceof Anthropic.APIUserAbortError ||
            controller.signal.aborted
        ) {
            return { ok: false, failure: "timeout" };
        }
        if (
            error instanceof Anthropic.AuthenticationError ||
            error instanceof Anthropic.PermissionDeniedError
        ) {
            return { ok: false, failure: "provider" };
        }
        if (
            error instanceof Anthropic.RateLimitError ||
            error instanceof Anthropic.InternalServerError
        ) {
            // InternalServerError covers every 5xx, including 529 overloaded.
            return {
                ok: false,
                failure: "retryable",
                retryDelayMs: parseRetryAfterMs(
                    error.headers?.get("retry-after"),
                    defaultRetryDelayMs
                ),
            };
        }
        if (error instanceof Anthropic.APIConnectionError) {
            return { ok: false, failure: "retryable" };
        }

        // 400/404/413/422 and anything unexpected: this model cannot answer this request.
        return { ok: false, failure: "model" };
    } finally {
        clearTimeout(timeoutId);
    }
}
