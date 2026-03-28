import * as Sentry from "@sentry/core";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase-server";

/**
 * In-memory fallback store for environments where Supabase is not configured.
 * On serverless (Vercel), this resets on cold starts — the DB path is preferred.
 */
type IdempotencyEntry = { expiresAt: number };
const memoryStore = new Map<string, IdempotencyEntry>();
const MAX_KEYS = 50_000;

function cleanupMemory(now: number) {
    if (memoryStore.size < MAX_KEYS) return;
    for (const [key, entry] of Array.from(memoryStore.entries())) {
        if (entry.expiresAt <= now) {
            memoryStore.delete(key);
        }
    }
}

function claimInMemory(scopedKey: string, ttlMs: number): boolean {
    const now = Date.now();
    cleanupMemory(now);
    const current = memoryStore.get(scopedKey);
    if (current && current.expiresAt > now) return false;
    memoryStore.set(scopedKey, { expiresAt: now + ttlMs });
    return true;
}

/**
 * BUG-3 fix: Use the `payment_webhook_events` table as a durable idempotency
 * store so that serverless cold starts can't cause duplicate processing.
 *
 * Falls back to in-memory store only when Supabase service role is not available.
 */
async function claimInDatabase(scopedKey: string): Promise<boolean> {
    if (!isSupabaseServiceConfigured) return true; // let caller use memory fallback

    try {
        const serviceClient = createSupabaseServiceClient();
        const { error } = await serviceClient.from("payment_webhook_events").insert({
            provider: "idempotency",
            event_key: scopedKey,
            event_type: "idempotency_claim",
            payload: { claimedAt: new Date().toISOString() },
        });

        if (error) {
            // Unique constraint violation = already claimed
            if (error.code === "23505") return false;
            // Table doesn't exist or other error — fall through to memory
            throw error;
        }
        return true;
    } catch (err) {
        Sentry.captureException(err, {
            level: "warning",
            tags: { layer: "idempotency", subsystem: "db_claim" },
            extra: { scopedKey },
        });
        // Return true so the caller can fall back to in-memory
        return true;
    }
}

export async function claimIdempotencyKey(scope: string, key: string, ttlMs = 24 * 60 * 60 * 1000) {
    const scopedKey = `${scope}:${key}`;

    // Try DB first (durable across cold starts)
    const dbClaimed = await claimInDatabase(scopedKey);
    if (!dbClaimed) return false;

    // Also check in-memory for same-instance dedup (belt-and-suspenders)
    return claimInMemory(scopedKey, ttlMs);
}
