import type { ChatbotLlmMessage } from "@/lib/chatbot-prompt";
import { requestAnthropicAttempt } from "@/lib/chatbot-llm-anthropic";
import {
    cleanModelReply,
    parseRetryAfterMs,
    type ChatbotAttemptInput,
    type ChatbotAttemptResult,
    type ChatbotLlmProvider,
} from "@/lib/chatbot-llm-shared";

export type { ChatbotLlmProvider, ChatbotLlmProviderName } from "@/lib/chatbot-llm-shared";
export { cleanModelReply } from "@/lib/chatbot-llm-shared";

/**
 * Chat-completions client for the chatbot with provider failover: Groq, OpenAI, Anthropic and
 * Hugging Face, tried in the configured order, each with its own model list. A provider is
 * skipped when it rejects the key or times out; a model is skipped when it is gone or erroring.
 * Everything runs inside one total time budget so a slow upstream cannot outlive the
 * serverless function, and a null result sends the caller to its no-model answer path.
 */

/** Legacy single-provider shape, still accepted so a Groq-only caller keeps working. */
export type ChatbotGroqConfig = {
    apiKey: string;
    endpoint: string;
    model: string;
    /** Tried when the primary model is gone, rate limited or erroring. */
    fallbackModel?: string | null;
};

type OpenAiCompatibleResponse = {
    choices?: Array<{
        message?: {
            content?: string | null;
        };
    }>;
};

export const CHATBOT_LLM_TEMPERATURE = 0.3;
export const CHATBOT_LLM_MAX_TOKENS = 500;
/** Reasoning models spend completion tokens on thinking first; leave room for the answer. */
const REASONING_MAX_COMPLETION_TOKENS = 4000;
const ATTEMPT_TIMEOUT_MS = 9000;
const TOTAL_BUDGET_MS = 22000;
const MIN_ATTEMPT_MS = 1500;
const DEFAULT_RETRY_DELAY_MS = 400;

export type ChatbotLlmOptions = {
    messages: ChatbotLlmMessage[];
    providers?: ChatbotLlmProvider[];
    /** @deprecated pass `providers`; kept for single-provider callers and tests. */
    groq?: ChatbotGroqConfig | null;
    fetchImpl?: typeof fetch;
    totalBudgetMs?: number;
    attemptTimeoutMs?: number;
    retryDelayMs?: number;
};

function sleep(ms: number) {
    return ms > 0 ? new Promise<void>((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

/** OpenAI's reasoning families reject a custom temperature and count thinking as output. */
function isOpenAiReasoningModel(model: string) {
    return /^(o\d|gpt-5)/i.test(model);
}

/** Groq's reasoning models (gpt-oss, qwen3) also spend completion tokens on thinking first. */
function isGroqReasoningModel(model: string) {
    return /gpt-oss|qwen3/i.test(model);
}

function buildOpenAiCompatibleBody(input: ChatbotAttemptInput) {
    const { provider, model, messages } = input;

    if (provider.name === "groq" && isGroqReasoningModel(model)) {
        // Low effort keeps short support answers fast; include_reasoning: false leaves the
        // thinking out of the response, so only the answer reaches the visitor.
        return {
            model,
            reasoning_effort: "low",
            max_completion_tokens: REASONING_MAX_COMPLETION_TOKENS,
            include_reasoning: false,
            messages,
        };
    }

    if (provider.name === "openai") {
        // OpenAI deprecated max_tokens for chat completions; max_completion_tokens works on
        // every current model.
        return isOpenAiReasoningModel(model)
            ? {
                  model,
                  reasoning_effort: "low",
                  max_completion_tokens: REASONING_MAX_COMPLETION_TOKENS,
                  messages,
              }
            : {
                  model,
                  temperature: CHATBOT_LLM_TEMPERATURE,
                  max_completion_tokens: CHATBOT_LLM_MAX_TOKENS,
                  messages,
              };
    }

    return {
        model,
        temperature: CHATBOT_LLM_TEMPERATURE,
        max_tokens: CHATBOT_LLM_MAX_TOKENS,
        messages,
    };
}

async function requestOpenAiCompatibleAttempt(
    input: ChatbotAttemptInput
): Promise<ChatbotAttemptResult> {
    const { provider, fetchImpl, timeoutMs, defaultRetryDelayMs } = input;
    if (!provider.endpoint) {
        return { ok: false, failure: "provider" };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetchImpl(provider.endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${provider.apiKey}`,
            },
            body: JSON.stringify(buildOpenAiCompatibleBody(input)),
            cache: "no-store",
            signal: controller.signal,
        });

        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                return { ok: false, failure: "provider" };
            }

            if (response.status === 429 || response.status >= 500) {
                return {
                    ok: false,
                    failure: "retryable",
                    retryDelayMs: parseRetryAfterMs(
                        response.headers?.get?.("retry-after"),
                        defaultRetryDelayMs
                    ),
                };
            }

            return { ok: false, failure: "model" };
        }

        const payload = (await response.json()) as OpenAiCompatibleResponse;
        const reply = cleanModelReply(payload.choices?.[0]?.message?.content ?? "");
        return reply ? { ok: true, reply } : { ok: false, failure: "model" };
    } catch {
        return { ok: false, failure: controller.signal.aborted ? "timeout" : "retryable" };
    } finally {
        clearTimeout(timeoutId);
    }
}

function attemptProvider(input: ChatbotAttemptInput) {
    return input.provider.name === "anthropic"
        ? requestAnthropicAttempt(input)
        : requestOpenAiCompatibleAttempt(input);
}

function groqConfigToProvider(groq: ChatbotGroqConfig): ChatbotLlmProvider {
    return {
        name: "groq",
        apiKey: groq.apiKey,
        endpoint: groq.endpoint,
        models: [groq.model, groq.fallbackModel].filter((m): m is string => !!m),
    };
}

function resolveProviders(options: ChatbotLlmOptions): ChatbotLlmProvider[] {
    const providers = options.providers?.length
        ? options.providers
        : options.groq?.apiKey
          ? [groqConfigToProvider(options.groq)]
          : [];

    return providers
        .filter((provider) => provider.apiKey)
        .map((provider) => ({ ...provider, models: Array.from(new Set(provider.models)) }))
        .filter((provider) => provider.models.length > 0);
}

/** Returns the first reply any provider gives, or null when all failed (callers degrade). */
export async function requestChatbotCompletion(options: ChatbotLlmOptions): Promise<string | null> {
    const fetchImpl = options.fetchImpl ?? fetch;
    const startedAt = Date.now();
    const budgetMs = options.totalBudgetMs ?? TOTAL_BUDGET_MS;
    const attemptTimeoutMs = options.attemptTimeoutMs ?? ATTEMPT_TIMEOUT_MS;
    const defaultRetryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

    for (const provider of resolveProviders(options)) {
        let skipProvider = false;

        for (const model of provider.models) {
            for (let tryIndex = 0; tryIndex < 2; tryIndex += 1) {
                const remaining = budgetMs - (Date.now() - startedAt);
                if (remaining < MIN_ATTEMPT_MS) {
                    return null;
                }

                const result = await attemptProvider({
                    provider,
                    model,
                    messages: options.messages,
                    fetchImpl,
                    timeoutMs: Math.min(attemptTimeoutMs, remaining),
                    defaultRetryDelayMs,
                });

                if (result.ok) {
                    return result.reply;
                }

                if (result.failure === "provider" || result.failure === "timeout") {
                    skipProvider = true;
                    break;
                }

                if (result.failure === "retryable" && tryIndex === 0) {
                    await sleep(result.retryDelayMs ?? defaultRetryDelayMs);
                    continue;
                }

                break;
            }

            if (skipProvider) {
                break;
            }
        }
    }

    return null;
}
