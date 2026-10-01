import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sentryMocks = vi.hoisted(() => ({
    captureException: vi.fn(),
    captureMessage: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => sentryMocks);

async function loadRateLimit(upstash: boolean) {
    vi.resetModules();
    if (upstash) {
        vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://upstash.example.test");
        vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token");
    } else {
        vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
        vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    }
    return import("./rate-limit");
}

describe("assertRateLimit", () => {
    beforeEach(() => {
        sentryMocks.captureException.mockClear();
        sentryMocks.captureMessage.mockClear();
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    it("limits per key with the in-memory store when Upstash is not configured", async () => {
        const { assertRateLimit } = await loadRateLimit(false);
        const input = { key: "t:a", limit: 2, windowMs: 60_000 };

        expect((await assertRateLimit(input)).ok).toBe(true);
        expect((await assertRateLimit(input)).ok).toBe(true);

        const blocked = await assertRateLimit(input);
        expect(blocked.ok).toBe(false);
        if (!blocked.ok) {
            expect(blocked.response.status).toBe(429);
        }
    });

    it("degrades to in-memory counters when Upstash errors and the key is not strict", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("upstash down")));
        const { assertRateLimit } = await loadRateLimit(true);

        const result = await assertRateLimit({ key: "t:b", limit: 5, windowMs: 60_000 });

        expect(result.ok).toBe(true);
        expect(sentryMocks.captureException).toHaveBeenCalledTimes(1);
    });

    it("fails closed with 503 when Upstash errors and the key is strict", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("upstash down")));
        const { assertRateLimit } = await loadRateLimit(true);

        const result = await assertRateLimit({
            key: "t:c",
            limit: 5,
            windowMs: 60_000,
            strict: true,
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.response.status).toBe(503);
            expect(result.response.headers.get("Retry-After")).toBe("30");
        }
    });

    it("reports Upstash failures to Sentry at most once per minute", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("upstash down")));
        const { assertRateLimit } = await loadRateLimit(true);

        await assertRateLimit({ key: "t:d1", limit: 5, windowMs: 60_000 });
        await assertRateLimit({ key: "t:d2", limit: 5, windowMs: 60_000 });
        await assertRateLimit({ key: "t:d3", limit: 5, windowMs: 60_000, strict: true });

        expect(sentryMocks.captureException).toHaveBeenCalledTimes(1);
    });
});

describe("assertQuota", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    it("charges the given amount and rejects once the budget is spent", async () => {
        const { assertQuota } = await loadRateLimit(false);
        const base = { key: "quota:u1", limit: 100, windowMs: 60_000 };

        expect((await assertQuota({ ...base, amount: 60 })).ok).toBe(true);
        expect((await assertQuota({ ...base, amount: 40 })).ok).toBe(true);
        expect((await assertQuota({ ...base, amount: 1 })).ok).toBe(false);
    });

    it("fails closed when the shared store errors", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("upstash down")));
        const { assertQuota } = await loadRateLimit(true);

        const result = await assertQuota({
            key: "quota:u2",
            amount: 10,
            limit: 100,
            windowMs: 60_000,
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.response.status).toBe(503);
        }
    });
});
