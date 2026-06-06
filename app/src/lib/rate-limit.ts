import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

type RateLimitEntry = {
    count: number;
    resetAt: number;
};

const rateLimitStore = new Map<string, RateLimitEntry>();
const MAX_STORE_SIZE = 20_000;
const UPSTASH_RATE_LIMIT_PREFIX = "rate-limit";
const upstashRedisRestUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
const upstashRedisRestToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
const isUpstashRateLimitConfigured = Boolean(upstashRedisRestUrl && upstashRedisRestToken);
let hasWarnedAboutRateLimitFallback = false;

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

function createRateLimitExceededResponse(message: string, retryAfterSeconds: number) {
    return NextResponse.json(
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
    );
}

function consumeRateLimitInMemory(key: string, windowMs: number) {
    const now = Date.now();
    cleanupStore(now);

    const current = rateLimitStore.get(key);
    if (!current || current.resetAt <= now) {
        const freshEntry = {
            count: 1,
            resetAt: now + windowMs,
        };
        rateLimitStore.set(key, freshEntry);
        return freshEntry;
    }

    current.count += 1;
    rateLimitStore.set(key, current);
    return current;
}

async function runUpstashCommand(args: string[]) {
    if (!upstashRedisRestUrl || !upstashRedisRestToken) {
        throw new Error("Upstash rate-limit configuration is missing.");
    }

    const encodedPath = args.map((arg) => encodeURIComponent(arg)).join("/");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    try {
        const response = await fetch(`${upstashRedisRestUrl}/${encodedPath}`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${upstashRedisRestToken}`,
            },
            cache: "no-store",
            signal: controller.signal,
        });

        clearTimeout(timeout);

        const payload = (await response.json().catch(() => null)) as {
            result?: unknown;
            error?: string;
        } | null;

        if (!response.ok || payload?.error) {
            throw new Error(
                payload?.error ||
                    `Upstash rate-limit command failed with status ${response.status}.`
            );
        }

        return payload?.result;
    } catch (error) {
        clearTimeout(timeout);
        throw error;
    }
}

async function consumeRateLimitInUpstash(key: string, windowMs: number) {
    const namespacedKey = `${UPSTASH_RATE_LIMIT_PREFIX}:${key}`;
    const now = Date.now();
    const countResult = await runUpstashCommand(["INCR", namespacedKey]);
    const count = Number(countResult);
    if (!Number.isFinite(count) || count <= 0) {
        throw new Error("Invalid Upstash INCR response for rate limiting.");
    }

    if (count === 1) {
        await runUpstashCommand(["PEXPIRE", namespacedKey, String(windowMs)]);
    }

    let ttlMs = Number(await runUpstashCommand(["PTTL", namespacedKey]));
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
        await runUpstashCommand(["PEXPIRE", namespacedKey, String(windowMs)]);
        ttlMs = windowMs;
    }

    return {
        count,
        resetAt: now + ttlMs,
    };
}

type AssertRateLimitInput = {
    key: string;
    limit: number;
    windowMs: number;
    message?: string;
};

export async function assertRateLimit({
    key,
    limit,
    windowMs,
    message = "Too many requests. Please try again shortly.",
}: AssertRateLimitInput) {
    let state: RateLimitEntry;
    if (isUpstashRateLimitConfigured) {
        try {
            state = await consumeRateLimitInUpstash(key, windowMs);
        } catch (error) {
            Sentry.captureException(error, {
                level: "warning",
                tags: {
                    layer: "api",
                    subsystem: "rate_limit",
                    provider: "upstash",
                },
                extra: {
                    key,
                },
            });
            state = consumeRateLimitInMemory(key, windowMs);
        }
    } else {
        if (process.env.NODE_ENV === "production" && !hasWarnedAboutRateLimitFallback) {
            hasWarnedAboutRateLimitFallback = true;
            Sentry.captureMessage(
                "Upstash rate limiting is not configured. Falling back to per-instance in-memory limits.",
                {
                    level: "warning",
                    tags: {
                        layer: "api",
                        subsystem: "rate_limit",
                    },
                }
            );
            console.warn(
                "Upstash rate limiting is not configured. Production requests will fall back to per-instance in-memory limits."
            );
        }
        state = consumeRateLimitInMemory(key, windowMs);
    }

    if (state.count > limit) {
        const retryAfterSeconds = Math.max(1, Math.ceil((state.resetAt - Date.now()) / 1000));
        return {
            ok: false as const,
            response: createRateLimitExceededResponse(message, retryAfterSeconds),
        };
    }
    return { ok: true as const };
}
