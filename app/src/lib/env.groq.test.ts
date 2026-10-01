import { afterEach, describe, expect, it, vi } from "vitest";

/** env.ts reads process.env at import time, so each case loads it fresh. */
async function loadGroqConfig(overrides: Record<string, string | undefined>) {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("SKIP_ENV_VALIDATION", "true");
    vi.stubEnv("GROQ_API_KEY", "gsk_test");
    vi.stubEnv("GROQ_MODEL", "");
    vi.stubEnv("GROQ_FALLBACK_MODEL", "");

    for (const [key, value] of Object.entries(overrides)) {
        vi.stubEnv(key, value as string);
    }

    const { getGroqConfig } = await import("./env");
    return getGroqConfig();
}

describe("getGroqConfig", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.resetModules();
    });

    it("defaults to a current production model with a fast fallback", async () => {
        const config = await loadGroqConfig({});

        expect(config).toEqual({
            apiKey: "gsk_test",
            endpoint: "https://api.groq.com/openai/v1/chat/completions",
            model: "openai/gpt-oss-120b",
            fallbackModel: "openai/gpt-oss-20b",
        });
        // All retired by Groq: each answered 404 model_not_found, failing every Groq call.
        for (const retired of [
            "llama3-8b-8192",
            "llama-3.3-70b-versatile",
            "llama-3.1-8b-instant",
        ]) {
            expect([config?.model, config?.fallbackModel]).not.toContain(retired);
        }
    });

    it("lets GROQ_MODEL and GROQ_FALLBACK_MODEL override the defaults", async () => {
        const config = await loadGroqConfig({
            GROQ_MODEL: "qwen/qwen3.8-27b",
            GROQ_FALLBACK_MODEL: "openai/gpt-oss-120b",
        });

        expect(config?.model).toBe("qwen/qwen3.8-27b");
        expect(config?.fallbackModel).toBe("openai/gpt-oss-120b");
    });

    it("drops a fallback identical to the primary model", async () => {
        const config = await loadGroqConfig({ GROQ_MODEL: "openai/gpt-oss-20b" });

        expect(config?.model).toBe("openai/gpt-oss-20b");
        expect(config?.fallbackModel).toBeNull();
    });

    it("returns null without an API key", async () => {
        vi.resetModules();
        vi.stubEnv("SKIP_ENV_VALIDATION", "true");
        // undefined removes the variable; "" would fail the schema, a different failure.
        vi.stubEnv("GROQ_API_KEY", undefined);
        const { getGroqConfig } = await import("./env");
        expect(getGroqConfig()).toBeNull();
    });
});
