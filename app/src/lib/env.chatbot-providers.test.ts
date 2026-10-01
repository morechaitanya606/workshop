import { afterEach, describe, expect, it, vi } from "vitest";

const PROVIDER_KEYS = [
    "GROQ_API_KEY",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "HUGGINGFACE_API_KEY",
    "CHATBOT_LLM_PROVIDERS",
];

/** env.ts reads process.env at import time, so each case loads it fresh. */
async function loadProviders(overrides: Record<string, string>) {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("SKIP_ENV_VALIDATION", "true");
    // Unset, not "": GROQ_API_KEY and HUGGINGFACE_API_KEY reject a blank value.
    for (const key of PROVIDER_KEYS) vi.stubEnv(key, undefined);
    for (const [key, value] of Object.entries(overrides)) vi.stubEnv(key, value);

    const { getChatbotLlmProviders } = await import("./env");
    return getChatbotLlmProviders().map((provider) => provider.name);
}

describe("getChatbotLlmProviders", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.resetModules();
    });

    it("puts Claude first when every key is set", async () => {
        expect(
            await loadProviders({
                GROQ_API_KEY: "gsk_test",
                OPENAI_API_KEY: "sk-test",
                ANTHROPIC_API_KEY: "sk-ant-test",
                HUGGINGFACE_API_KEY: "hf_test",
            })
        ).toEqual(["anthropic", "groq", "openai", "huggingface"]);
    });

    it("skips providers without a key, so Groq answers until the Claude key is added", async () => {
        expect(
            await loadProviders({ GROQ_API_KEY: "gsk_test", HUGGINGFACE_API_KEY: "hf_test" })
        ).toEqual(["groq", "huggingface"]);
    });

    it("lets CHATBOT_LLM_PROVIDERS reorder and limit the chain", async () => {
        expect(
            await loadProviders({
                GROQ_API_KEY: "gsk_test",
                ANTHROPIC_API_KEY: "sk-ant-test",
                CHATBOT_LLM_PROVIDERS: "groq, anthropic, nonsense",
            })
        ).toEqual(["groq", "anthropic"]);
    });

    it("returns no providers when no key is set; the chatbot then answers from FAQs", async () => {
        expect(await loadProviders({})).toEqual([]);
    });
});
