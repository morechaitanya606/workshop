import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

type RateLimitEntry = {
    count: number;
    resetAt: number;
};

const rateLimitStore = new Map<string, RateLimitEntry>();
const MAX_STORE_SIZE = 20_000;

function getClientAddress(request: NextRequest) {
    const forwardedFor = request.headers.get("x-forwarded-for");
    if (forwardedFor) {
        const first = forwardedFor.split(",")[0]?.trim();
        if (first) return first;
    }

    const realIp = request.headers.get("x-real-ip");
    if (realIp) return realIp;

    return "unknown";
}

function cleanupStore(now: number) {
    if (rateLimitStore.size < MAX_STORE_SIZE) return;

    for (const [key, entry] of Array.from(rateLimitStore.entries())) {
        if (entry.resetAt <= now) {
            rateLimitStore.delete(key);
        }
    }
}

export function getRateLimitKey(request: NextRequest, scope: string, userId?: string) {
    const identity = userId || getClientAddress(request);
    return `${scope}:${identity}`;
}

type AssertRateLimitInput = {
    key: string;
    limit: number;
    windowMs: number;
    message?: string;
};

export function assertRateLimit({
    key,
    limit,
    windowMs,
    message = "Too many requests. Please try again shortly.",
}: AssertRateLimitInput) {
    const now = Date.now();
    cleanupStore(now);

    const current = rateLimitStore.get(key);
    if (!current || current.resetAt <= now) {
        rateLimitStore.set(key, {
            count: 1,
            resetAt: now + windowMs,
        });
        return { ok: true as const };
    }

    if (current.count >= limit) {
        const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
        return {
            ok: false as const,
            response: NextResponse.json(
                {
                    error: message,
                    retryAfterSeconds,
                },
                {
                    status: 429,
                    headers: {
                        "Retry-After": String(retryAfterSeconds),
                    },
                }
            ),
        };
    }

    current.count += 1;
    rateLimitStore.set(key, current);
    return { ok: true as const };
}
