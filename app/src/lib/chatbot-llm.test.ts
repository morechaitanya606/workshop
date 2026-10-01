// @vitest-environment node
// The Anthropic SDK refuses to construct in a browser-like environment (jsdom), and this
// module only ever runs on the server.
import { describe, expect, it, vi } from "vitest";
import { requestChatbotCompletion, type ChatbotLlmProvider } from "@/lib/chatbot-llm";

const messages = [
    { role: "system" as const, content: "rules and context" },
    { role: "assistant" as const, content: "Hi! How can I help?" },
    { role: "user" as const, content: "What does pottery cost?" },
];

const groq: ChatbotLlmProvider = {
    name: "groq",
    apiKey: "groq-key",
    endpoint: "https://example.com/groq",
    models: ["groq-model"],
};
const openai: ChatbotLlmProvider = {
    name: "openai",
    apiKey: "openai-key",
    endpoint: "https://example.com/openai",
    models: ["gpt-4.1-mini"],
};
const anthropic: ChatbotLlmProvider = {
    name: "anthropic",
    apiKey: "anthropic-key",
    models: ["claude-opus-5-5"],
};
const huggingface: ChatbotLlmProvider = {
    name: "huggingface",
    apiKey: "hf-key",
    endpoint: "https://example.com/hf",
    models: ["meta-llama/Llama-3.1-8B-Instruct"],
};

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

function chatCompletion(content: string) {
    return json({ choices: [{ message: { content } }] });
}

function claudeMessage(text: string, stopReason = "end_turn") {
    return json({
        id: "msg_test",
        type: "message",
        role: "assistant",
        model: "claude-opus-5-5",
        content: text ? [{ type: "text", text }] : [],
        stop_reason: stopReason,
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 5 },
    });
}

function claudeError(status: number, type: string) {
    return json({ type: "error", error: { type, message: type } }, status);
}

/** Routes each request by URL so a test can describe each provider's behaviour separately. */
function routedFetch(routes: Record<string, Array<() => Response | Promise<Response>>>) {
    return vi.fn<typeof fetch>(async (input) => {
        const url =
            typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const key = Object.keys(routes).find((prefix) => url.startsWith(prefix));
        const next = key ? routes[key].shift() : undefined;
        if (!next) throw new Error(`unexpected request to ${url}`);
        return next();
    });
}

function callsTo(fetchMock: ReturnType<typeof routedFetch>, prefix: string) {
    return fetchMock.mock.calls.filter(([input]) =>
        String(input instanceof Request ? input.url : input).startsWith(prefix)
    );
}

function bodyOf(call: Parameters<typeof fetch>) {
    return JSON.parse(String(call[1]?.body));
}

describe("requestChatbotCompletion: provider failover", () => {
    it("moves to the next provider at once when a key is rejected", async () => {
        const fetchMock = routedFetch({
            "https://example.com/groq": [() => json({ error: "bad key" }, 401)],
            "https://example.com/openai": [() => chatCompletion("From OpenAI")],
        });

        const reply = await requestChatbotCompletion({
            messages,
            providers: [groq, openai],
            fetchImpl: fetchMock,
            retryDelayMs: 0,
        });

        expect(reply).toBe("From OpenAI");
        expect(callsTo(fetchMock, "https://example.com/groq")).toHaveLength(1);
    });

    it("falls through a failing Groq and OpenAI to Claude", async () => {
        const fetchMock = routedFetch({
            "https://example.com/groq": [() => json({}, 500), () => json({}, 500)],
            "https://example.com/openai": [() => json({}, 503), () => json({}, 503)],
            "https://api.anthropic.com": [() => claudeMessage("From Claude")],
        });

        const reply = await requestChatbotCompletion({
            messages,
            providers: [groq, { ...openai, models: ["gpt-4.1-mini"] }, anthropic],
            fetchImpl: fetchMock,
            retryDelayMs: 0,
        });

        expect(reply).toBe("From Claude");
    });

    it("sends Claude a valid Messages API request", async () => {
        const fetchMock = routedFetch({
            "https://api.anthropic.com": [() => claudeMessage("Pottery is ₹1,800.")],
        });

        await requestChatbotCompletion({
            messages,
            providers: [anthropic],
            fetchImpl: fetchMock,
            retryDelayMs: 0,
        });

        const [call] = callsTo(fetchMock, "https://api.anthropic.com");
        const headers = new Headers(call[1]?.headers);
        const body = bodyOf(call);

        expect(String(call[0])).toContain("/v1/messages");
        expect(headers.get("x-api-key")).toBe("anthropic-key");
        expect(headers.get("anthropic-version")).toBeTruthy();
        expect(headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
        expect(body).toMatchObject({
            model: "claude-opus-5-5",
            system: "rules and context",
            fallbacks: "default",
            output_config: { effort: "low" },
        });
        // Current Opus models reject sampling parameters.
        expect(body).not.toHaveProperty("temperature");
        // The opening assistant greeting is dropped: the conversation must start with the user.
        expect(body.messages).toEqual([{ role: "user", content: "What does pottery cost?" }]);
    });

    it("treats a Claude refusal or an overloaded Claude as a reason to move on", async () => {
        const refused = routedFetch({
            "https://api.anthropic.com": [() => claudeMessage("", "refusal")],
            "https://example.com/hf": [() => chatCompletion("From Hugging Face")],
        });
        expect(
            await requestChatbotCompletion({
                messages,
                providers: [anthropic, huggingface],
                fetchImpl: refused,
                retryDelayMs: 0,
            })
        ).toBe("From Hugging Face");

        const overloaded = routedFetch({
            "https://api.anthropic.com": [
                () => claudeError(529, "overloaded_error"),
                () => claudeError(529, "overloaded_error"),
            ],
            "https://example.com/hf": [() => chatCompletion("Still answered")],
        });
        expect(
            await requestChatbotCompletion({
                messages,
                providers: [anthropic, huggingface],
                fetchImpl: overloaded,
                retryDelayMs: 0,
            })
        ).toBe("Still answered");
        // Retried once (overload is transient), then handed over.
        expect(callsTo(overloaded, "https://api.anthropic.com")).toHaveLength(2);
    });

    it("skips Claude without retrying when its key is rejected", async () => {
        const fetchMock = routedFetch({
            "https://api.anthropic.com": [() => claudeError(401, "authentication_error")],
            "https://example.com/hf": [() => chatCompletion("Answered")],
        });

        expect(
            await requestChatbotCompletion({
                messages,
                providers: [anthropic, huggingface],
                fetchImpl: fetchMock,
                retryDelayMs: 0,
            })
        ).toBe("Answered");
        expect(callsTo(fetchMock, "https://api.anthropic.com")).toHaveLength(1);
    });

    it("gives a slow provider no second chance and spends the budget on the next one", async () => {
        const fetchMock = vi.fn<typeof fetch>((input, init) => {
            if (String(input).startsWith("https://example.com/groq")) {
                // Never answers; only the per-attempt timeout ends it.
                return new Promise<Response>((_resolve, reject) => {
                    init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
                });
            }
            return Promise.resolve(chatCompletion("From OpenAI"));
        });

        const reply = await requestChatbotCompletion({
            messages,
            providers: [{ ...groq, models: ["a", "b"] }, openai],
            fetchImpl: fetchMock,
            attemptTimeoutMs: 20,
            totalBudgetMs: 5000,
            retryDelayMs: 0,
        });

        expect(reply).toBe("From OpenAI");
        // One timed-out Groq attempt, no retry and no second Groq model.
        expect(
            fetchMock.mock.calls.filter(([input]) =>
                String(input).startsWith("https://example.com/groq")
            )
        ).toHaveLength(1);
    });

    it("sends OpenAI reasoning models no temperature and room to think", async () => {
        const fetchMock = routedFetch({
            "https://example.com/openai": [() => chatCompletion("ok")],
        });

        await requestChatbotCompletion({
            messages,
            providers: [{ ...openai, models: ["gpt-5-mini"] }],
            fetchImpl: fetchMock,
        });

        const body = bodyOf(callsTo(fetchMock, "https://example.com/openai")[0]);
        expect(body).not.toHaveProperty("temperature");
        expect(body).not.toHaveProperty("max_tokens");
        expect(body.reasoning_effort).toBe("low");
        expect(body.max_completion_tokens).toBeGreaterThan(1000);
    });

    it("sends Groq's gpt-oss models low effort, room to think and no reasoning text back", async () => {
        const fetchMock = routedFetch({
            "https://example.com/groq": [() => chatCompletion("ok")],
        });

        await requestChatbotCompletion({
            messages,
            providers: [{ ...groq, models: ["openai/gpt-oss-120b"] }],
            fetchImpl: fetchMock,
        });

        const body = bodyOf(callsTo(fetchMock, "https://example.com/groq")[0]);
        expect(body).toMatchObject({
            model: "openai/gpt-oss-120b",
            reasoning_effort: "low",
            include_reasoning: false,
        });
        expect(body.max_completion_tokens).toBeGreaterThan(1000);
        // max_tokens would let the thinking consume the whole budget and return an empty answer.
        expect(body).not.toHaveProperty("max_tokens");
    });

    it("returns null when no provider is configured", async () => {
        const fetchMock = vi.fn<typeof fetch>();
        expect(
            await requestChatbotCompletion({ messages, providers: [], fetchImpl: fetchMock })
        ).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
