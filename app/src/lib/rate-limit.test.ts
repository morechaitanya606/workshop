import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { getRateLimitKey } from "./rate-limit";

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
