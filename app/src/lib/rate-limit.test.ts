import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import * as Sentry from "@sentry/core";
import { NextRequest } from "next/server";
import { getRateLimitKey } from "./rate-limit";
import type { assertRateLimit as AssertRateLimitType } from "./rate-limit";

vi.mock("@sentry/core", () => ({
    captureException: vi.fn(),
}));

const fetchMock = vi.fn<typeof fetch>();

describe("assertRateLimit", () => {
    let assertRateLimit: typeof AssertRateLimitType;

    beforeEach(async () => {
        fetchMock.mockReset();
        vi.stubGlobal("fetch", fetchMock);
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2024-01-01T12:00:00Z"));
        vi.mocked(Sentry.captureException).mockReset();

        vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://fake-upstash");
        vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "fake-token");

        vi.resetModules();
        const mod = await import("./rate-limit");
        assertRateLimit = mod.assertRateLimit;
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    const key = "test-key";
    const windowMs = 60000;

    it("allows requests under the limit", async () => {
        // Mock successful Upstash INCR and PTTL
        fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ result: 1 }))); // INCR
        fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ result: 1 }))); // PEXPIRE
        fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ result: windowMs }))); // PTTL

        const result = await assertRateLimit({ key, limit: 5, windowMs });

        expect(result.ok).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("blocks requests over the limit", async () => {
        // Mock successful Upstash INCR and PTTL indicating limit exceeded
        fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ result: 6 }))); // INCR
        fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ result: windowMs }))); // PTTL

        const result = await assertRateLimit({
            key,
            limit: 5,
            windowMs,
            message: "Custom message",
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.response.status).toBe(429);
            const data = await result.response.json();
            expect(data.error).toBe("Custom message");
            expect(data.retryAfterSeconds).toBe(60); // windowMs / 1000
            expect(result.response.headers.get("Retry-After")).toBe("60");
        }
    });

    it("falls back to in-memory store and captures exception on Upstash failure", async () => {
        // Simulate Upstash network failure
        const error = new Error("Network error");
        fetchMock.mockRejectedValueOnce(error);

        const result1 = await assertRateLimit({ key, limit: 2, windowMs });
        expect(result1.ok).toBe(true);

        // Verify Sentry captured the exception
        expect(Sentry.captureException).toHaveBeenCalledWith(
            error,
            expect.objectContaining({
                level: "warning",
                tags: expect.objectContaining({
                    layer: "api",
                    subsystem: "rate_limit",
                    provider: "upstash",
                }),
                extra: expect.objectContaining({
                    key,
                }),
            })
        );

        // Try second request, should still be ok.
        // The in-memory store should be used.
        fetchMock.mockRejectedValueOnce(new Error("Network error"));
        const result2 = await assertRateLimit({ key, limit: 2, windowMs });
        expect(result2.ok).toBe(true);

        // Try third request, should be rate limited by in-memory store
        fetchMock.mockRejectedValueOnce(new Error("Network error"));
        const result3 = await assertRateLimit({ key, limit: 2, windowMs });
        expect(result3.ok).toBe(false);
        if (!result3.ok) {
            expect(result3.response.status).toBe(429);
            expect(result3.response.headers.get("Retry-After")).toBe("60");
        }
    });
});

describe("getRateLimitKey", () => {
    const scope = "test-scope";

    it("uses userId when provided", () => {
        const request = new NextRequest("https://example.com");
        const userId = "user-123";
        const result = getRateLimitKey(request, scope, userId);
        expect(result).toBe(`${scope}:${userId}`);
    });

    it("extracts first IP from x-forwarded-for header", () => {
        const request = new NextRequest("https://example.com", {
            headers: {
                "x-forwarded-for": "192.168.1.1, 10.0.0.1",
            },
        });
        const result = getRateLimitKey(request, scope);
        expect(result).toBe(`${scope}:192.168.1.1`);
    });

    it("extracts IP from x-real-ip header when x-forwarded-for is missing", () => {
        const request = new NextRequest("https://example.com", {
            headers: {
                "x-real-ip": "172.16.0.1",
            },
        });
        const result = getRateLimitKey(request, scope);
        expect(result).toBe(`${scope}:172.16.0.1`);
    });

    it("prefers x-forwarded-for over x-real-ip", () => {
        const request = new NextRequest("https://example.com", {
            headers: {
                "x-forwarded-for": "192.168.1.1",
                "x-real-ip": "172.16.0.1",
            },
        });
        const result = getRateLimitKey(request, scope);
        expect(result).toBe(`${scope}:192.168.1.1`);
    });

    it("returns 'unknown' when no IP headers are present", () => {
        const request = new NextRequest("https://example.com");
        const result = getRateLimitKey(request, scope);
        expect(result).toBe(`${scope}:unknown`);
    });

    it("handles whitespace in x-forwarded-for header", () => {
        const request = new NextRequest("https://example.com", {
            headers: {
                "x-forwarded-for": "  192.168.1.1  , 10.0.0.1 ",
            },
        });
        const result = getRateLimitKey(request, scope);
        expect(result).toBe(`${scope}:192.168.1.1`);
    });
});
