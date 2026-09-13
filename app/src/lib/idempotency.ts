import * as Sentry from "@sentry/nextjs";
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
/** True only when the durable store is genuinely absent, not merely erroring. */
function isMissingIdempotencyTableError(error: { code?: string } | null) {
    return error?.code === "42P01" || error?.code === "PGRST205";
}

/**
 * Claim the key in the durable store.
 *
 * This used to return `true` on ANY database error, which meant a transient Supabase blip
 * silently downgraded webhook dedup to a per-lambda Map -- i.e. no dedup at all on Vercel,
 * and duplicate payment processing. It now fails CLOSED: only a genuinely missing table (or
 * an unconfigured service role) falls back to memory; anything else propagates so the caller
 * can decline to process and let the provider retry.
 */
async function claimInDatabase(scopedKey: string): Promise<boolean | "no-durable-store"> {
    if (!isSupabaseServiceConfigured) return "no-durable-store";

    const serviceClient = createSupabaseServiceClient({ requestTimeoutMs: 3000 });
    const { error } = await serviceClient.from("payment_webhook_events").insert({
        provider: "idempotency",
        event_key: scopedKey,
        event_type: "idempotency_claim",
        payload: { claimedAt: new Date().toISOString() },
    });

    if (!error) return true;

    // Unique constraint violation = already claimed by someone else.
    if (error.code === "23505") return false;

    if (isMissingIdempotencyTableError(error)) {
        Sentry.captureMessage("Idempotency table missing; falling back to in-memory dedup.", {
            level: "warning",
            tags: { layer: "idempotency", subsystem: "db_claim" },
            extra: { scopedKey },
        });
        return "no-durable-store";
    }

    throw error;
}

export async function claimIdempotencyKey(scope: string, key: string, ttlMs = 24 * 60 * 60 * 1000) {
    const scopedKey = `${scope}:${key}`;

    // Durable store first, so the claim survives cold starts.
    const dbClaimed = await claimInDatabase(scopedKey);
    if (dbClaimed === false) return false;

    // Same-instance dedup on top (and the only dedup when there is no durable store).
    return claimInMemory(scopedKey, ttlMs);
}

/**
 * Release a claim so the provider's retry can be processed.
 *
 * Without this, claiming before doing the work meant a single transient failure discarded the
 * event permanently: the key stayed burned and every retry short-circuited as a duplicate.
 */
export async function releaseIdempotencyKey(scope: string, key: string) {
    const scopedKey = `${scope}:${key}`;
    memoryStore.delete(scopedKey);

    if (!isSupabaseServiceConfigured) return;

    try {
        const serviceClient = createSupabaseServiceClient({ requestTimeoutMs: 3000 });
        await serviceClient
            .from("payment_webhook_events")
            .delete()
            .eq("provider", "idempotency")
            .eq("event_key", scopedKey);
    } catch (error) {
        // Best effort: a stuck claim expires with the row's own retention, and the alternative
        // (throwing here) would mask the original failure the caller is already handling.
        Sentry.captureException(error, {
            level: "warning",
            tags: { layer: "idempotency", subsystem: "db_release" },
            extra: { scopedKey },
        });
    }
}
