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

/**
 * `x-forwarded-for` is a client-controlled list: the leftmost entry is whatever the caller
 * chose to send, so keying on it lets one attacker mint unlimited buckets. Prefer the
 * platform-supplied address, then the RIGHTMOST forwarded hop (the one our proxy appended).
 */
function getClientAddress(request: NextRequest) {
    const platformIp = request.headers.get("x-vercel-forwarded-for")?.trim();
    if (platformIp) return platformIp;

    const realIp = request.headers.get("x-real-ip")?.trim();
    if (realIp) return realIp;

    const forwardedFor = request.headers.get("x-forwarded-for");
    if (forwardedFor) {
        const hops = forwardedFor
            .split(",")
            .map((hop) => hop.trim())
            .filter(Boolean);
        const nearest = hops[hops.length - 1];
        if (nearest) return nearest;
    }

    // No usable address. Bucketing every such caller together would let one of them
    // exhaust the limit for all of them, so give each request its own throwaway bucket
    // and rely on the platform's own protections.
    return `unidentified:${request.headers.get("user-agent") || "none"}`;
}

/**
 * Amortised eviction. The previous version rescanned the whole Map on EVERY request once it
 * held MAX_STORE_SIZE live entries, which turns the fallback into a self-inflicted CPU DoS
 * exactly when traffic is highest. Sweep at most a bounded slice per call instead.
 */
const CLEANUP_INTERVAL_MS = 10_000;
const CLEANUP_SCAN_LIMIT = 512;
let lastCleanupAt = 0;

function cleanupStore(now: number) {
    if (rateLimitStore.size < MAX_STORE_SIZE / 2) return;
    if (now - lastCleanupAt < CLEANUP_INTERVAL_MS && rateLimitStore.size < MAX_STORE_SIZE) return;

    lastCleanupAt = now;

    let scanned = 0;
    for (const [key, entry] of rateLimitStore) {
        if (scanned >= CLEANUP_SCAN_LIMIT) break;
        scanned += 1;
        if (entry.resetAt <= now) {
            rateLimitStore.delete(key);
        }
    }

    // Hard ceiling: if the sweep cannot keep up, drop the oldest entries outright rather
    // than letting the Map grow without bound.
    if (rateLimitStore.size > MAX_STORE_SIZE) {
        let toDrop = rateLimitStore.size - MAX_STORE_SIZE;
        for (const key of rateLimitStore.keys()) {
            if (toDrop <= 0) break;
            rateLimitStore.delete(key);
            toDrop -= 1;
        }
    }
}

export { isUpstashRateLimitConfigured };

const PROBE_CACHE_MS = 10_000;
let lastProbe: { at: number; state: "ok" | "degraded" } | null = null;

/**
 * Liveness probe for the shared rate-limit store, for /healthcheck.
 *
 * "Configured" is not the same as "reachable": every guarded route silently degrades to
 * per-instance counters the moment Upstash starts failing, which on Vercel is indistinguishable
 * from having no rate limiting at all. That has to be visible from outside the process.
 */
export async function probeRateLimitStore(): Promise<"ok" | "degraded" | "skipped"> {
    if (!isUpstashRateLimitConfigured) return "skipped";

    // /healthcheck is public and uncached, so a naive probe turns one unauthenticated
    // request into one Upstash request -- a free amplifier against our own quota. Ten
    // seconds is well inside any load balancer's tolerance and removes the amplification.
    const now = Date.now();
    if (lastProbe && now - lastProbe.at < PROBE_CACHE_MS) {
        return lastProbe.state;
    }

    let state: "ok" | "degraded";
    try {
        const result = await runUpstashCommand(["PING"]);
        state = String(result || "").toUpperCase() === "PONG" ? "ok" : "degraded";
    } catch {
        state = "degraded";
    }

    lastProbe = { at: now, state };
    return state;
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

/**
 * Increment and expire in a single atomic server-side step.
 *
 * The previous implementation issued INCR, then PEXPIRE, then PTTL — two to three sequential
 * HTTPS round trips per guarded request, which at 833 req/s triples both latency and Upstash
 * cost. It was also non-atomic: a process dying between INCR and PEXPIRE left a key with no
 * TTL. This script does the whole thing in one call and always returns a live TTL.
 */
const RATE_LIMIT_LUA = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {current, ttl}
`.trim();

async function consumeRateLimitInUpstash(key: string, windowMs: number) {
    const namespacedKey = `${UPSTASH_RATE_LIMIT_PREFIX}:${key}`;
    const now = Date.now();

    const result = await runUpstashCommand([
        "EVAL",
        RATE_LIMIT_LUA,
        "1",
        namespacedKey,
        String(windowMs),
    ]);

    const [rawCount, rawTtl] = Array.isArray(result) ? result : [];
    const count = Number(rawCount);
    const ttlMs = Number(rawTtl);

    if (!Number.isFinite(count) || count <= 0) {
        throw new Error("Invalid Upstash EVAL response for rate limiting.");
    }

    return {
        count,
        resetAt: now + (Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : windowMs),
    };
}

const UPSTASH_FAILURE_REPORT_INTERVAL_MS = 60_000;
let lastUpstashFailureReportAt = 0;

function reportUpstashFailureOncePerWindow(error: unknown, key: string) {
    const now = Date.now();
    if (now - lastUpstashFailureReportAt < UPSTASH_FAILURE_REPORT_INTERVAL_MS) {
        return;
    }
    lastUpstashFailureReportAt = now;

    Sentry.captureException(error, {
        level: "warning",
        tags: {
            layer: "api",
            subsystem: "rate_limit",
            provider: "upstash",
        },
        extra: {
            key,
            note: "Rate limiting degraded to per-instance in-memory counters.",
        },
    });
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
            // Reporting every failure would turn an Upstash outage into a Sentry outage at
            // this request volume, so report at most once per window.
            reportUpstashFailureOncePerWindow(error, key);
            state = consumeRateLimitInMemory(key, windowMs);
        }
    } else {
        // Without shared state the effective limit becomes `limit x instanceCount`, which is
        // not rate limiting at all. Make that loud rather than silently under-enforcing.
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

/**
 * Named 1-minute policies. Routes opt into a tier rather than hand-rolling limits, so the
 * numbers stay consistent and auditable in one place.
 *
 * Identity is the authenticated user when known, falling back to client address — otherwise
 * everyone behind one NAT shares a bucket while a spoofer gets unlimited ones.
 */
export const RATE_LIMIT_WINDOW_MS = 60_000;

export const RATE_LIMIT_POLICIES = {
    /** Cacheable public reads. Generous: these should mostly be served by the CDN. */
    publicRead: { limit: 120, message: "Too many requests. Please slow down." },
    /** Anything that hits GoTrue or creates a session. */
    auth: { limit: 10, message: "Too many authentication attempts. Please wait a minute." },
    /** Ordinary authenticated writes. */
    write: { limit: 30, message: "Too many requests. Please try again shortly." },
    /** AI, uploads, image proxying, bulk reads — expensive per call. */
    expensive: { limit: 10, message: "Too many requests. Please wait a minute and try again." },
    /** Booking and payment paths. */
    money: { limit: 20, message: "Too many booking requests. Please try again shortly." },
} as const;

export type RateLimitPolicyName = keyof typeof RATE_LIMIT_POLICIES;

/**
 * Apply a named policy. Returns `{ok:false, response}` exactly like assertRateLimit, so call
 * sites stay a two-line guard:
 *
 *   const limited = await enforceRateLimit(request, "publicRead", "api-workshops");
 *   if (!limited.ok) return limited.response;
 */
export async function enforceRateLimit(
    request: NextRequest,
    policy: RateLimitPolicyName,
    scope: string,
    userId?: string
) {
    const { limit, message } = RATE_LIMIT_POLICIES[policy];

    return assertRateLimit({
        key: getRateLimitKey(request, scope, userId),
        limit,
        windowMs: RATE_LIMIT_WINDOW_MS,
        message,
    });
}
