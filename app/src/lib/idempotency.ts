import * as Sentry from "@sentry/nextjs";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase-server";

/**
 * In-memory fallback store for environments where Supabase is not configured.
 * On serverless (Vercel), this resets on cold starts — the DB path is preferred.
 */
type IdempotencyEntry = { expiresAt: number; processed: boolean };
const memoryStore = new Map<string, IdempotencyEntry>();
const MAX_KEYS = 50_000;

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

function cleanupMemory(now: number) {
    if (memoryStore.size < MAX_KEYS) return;
    for (const [key, entry] of Array.from(memoryStore.entries())) {
        if (entry.expiresAt <= now) {
            memoryStore.delete(key);
        }
    }
}

type ClaimOutcome = "claimed" | "duplicate" | "in_progress";

function claimInMemory(scopedKey: string, ttlMs: number): ClaimOutcome {
    const now = Date.now();
    cleanupMemory(now);
    const current = memoryStore.get(scopedKey);
    if (current && current.expiresAt > now) {
        return current.processed ? "duplicate" : "in_progress";
    }
    memoryStore.set(scopedKey, { expiresAt: now + ttlMs, processed: false });
    return "claimed";
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
 *
 * Without `leaseMs` a claim is permanent, exactly as before. With it, a claim is a LEASE: the
 * row carries `processed_at = null` until the caller reports success, and a lease older than
 * `leaseMs` may be taken over, so a lambda that died (or timed out) mid-event cannot burn the
 * event forever.
 */
async function claimInDatabase(
    scopedKey: string,
    leaseMs?: number
): Promise<ClaimOutcome | "no-durable-store"> {
    if (!isSupabaseServiceConfigured) return "no-durable-store";

    const serviceClient = createSupabaseServiceClient({ requestTimeoutMs: 3000 });

    // Two passes: the row can be released between the failed insert and the read below, in
    // which case the second insert simply wins.
    for (let attempt = 0; attempt < 2; attempt += 1) {
        const { error } = await serviceClient.from("payment_webhook_events").insert({
            provider: "idempotency",
            event_key: scopedKey,
            event_type: "idempotency_claim",
            payload: { claimedAt: new Date().toISOString() },
        });

        if (!error) return "claimed";

        if (isMissingIdempotencyTableError(error)) {
            Sentry.captureMessage("Idempotency table missing; falling back to in-memory dedup.", {
                level: "warning",
                tags: { layer: "idempotency", subsystem: "db_claim" },
                extra: { scopedKey },
            });
            return "no-durable-store";
        }

        // Anything but a unique violation is a real failure: fail closed.
        if (error.code !== "23505") throw error;

        // Unique constraint violation = already claimed by someone else.
        if (!leaseMs) return "duplicate";

        const { data: existing, error: readError } = await serviceClient
            .from("payment_webhook_events")
            .select("received_at, processed_at")
            .eq("provider", "idempotency")
            .eq("event_key", scopedKey)
            .maybeSingle();

        if (readError) throw readError;
        if (!existing) continue;
        if (existing.processed_at) return "duplicate";

        const claimedAtMs = new Date(existing.received_at).getTime();
        if (Number.isFinite(claimedAtMs) && Date.now() - claimedAtMs < leaseMs) {
            return "in_progress";
        }

        // Lease expired and never marked processed: take it over. The compare-and-swap on
        // received_at means two retries racing for the same stale lease cannot both win.
        const { data: taken, error: takeoverError } = await serviceClient
            .from("payment_webhook_events")
            .update({
                received_at: new Date().toISOString(),
                payload: { claimedAt: new Date().toISOString(), reclaimed: true },
            })
            .eq("provider", "idempotency")
            .eq("event_key", scopedKey)
            .eq("received_at", existing.received_at)
            .is("processed_at", null)
            .select("id");

        if (takeoverError) throw takeoverError;

        if (taken && taken.length > 0) {
            Sentry.captureMessage("Re-claimed an idempotency lease that expired unprocessed.", {
                level: "warning",
                tags: { layer: "idempotency", subsystem: "lease_takeover" },
                extra: { scopedKey },
            });
            return "claimed";
        }

        return "in_progress";
    }

    return "in_progress";
}

/**
 * Claim a key as a lease and say WHY a claim was refused.
 *
 * `in_progress` means another delivery holds an unexpired, unprocessed lease: the caller
 * should answer with a retryable status rather than ACK, because if that holder dies nobody
 * else will ever do the work. `duplicate` means the work finished.
 */
export async function claimIdempotencyLease(
    scope: string,
    key: string,
    options: { leaseMs: number; ttlMs?: number }
): Promise<ClaimOutcome> {
    const scopedKey = `${scope}:${key}`;

    const dbOutcome = await claimInDatabase(scopedKey, options.leaseMs);
    if (dbOutcome === "duplicate" || dbOutcome === "in_progress") return dbOutcome;

    // The in-memory entry only needs to cover the lease; markIdempotencyKeyProcessed extends
    // it to the full retention once the work is done.
    return claimInMemory(scopedKey, options.leaseMs);
}

/** Record that the work behind a leased claim finished, making the claim permanent. */
export async function markIdempotencyKeyProcessed(
    scope: string,
    key: string,
    ttlMs = DEFAULT_TTL_MS
) {
    const scopedKey = `${scope}:${key}`;
    memoryStore.set(scopedKey, { expiresAt: Date.now() + ttlMs, processed: true });

    if (!isSupabaseServiceConfigured) return;

    try {
        const serviceClient = createSupabaseServiceClient({ requestTimeoutMs: 3000 });
        const { error } = await serviceClient
            .from("payment_webhook_events")
            .update({ processed_at: new Date().toISOString() })
            .eq("provider", "idempotency")
            .eq("event_key", scopedKey);

        if (error && !isMissingIdempotencyTableError(error)) throw error;
    } catch (error) {
        // The work is already done; failing here must not turn a success into a retry. The
        // worst case is the lease expiring and the event being reprocessed, which every
        // handler is written to tolerate.
        Sentry.captureException(error, {
            level: "warning",
            tags: { layer: "idempotency", subsystem: "db_mark_processed" },
            extra: { scopedKey },
        });
    }
}

export async function claimIdempotencyKey(scope: string, key: string, ttlMs = DEFAULT_TTL_MS) {
    const scopedKey = `${scope}:${key}`;

    // Durable store first, so the claim survives cold starts.
    const dbOutcome = await claimInDatabase(scopedKey);
    if (dbOutcome === "duplicate" || dbOutcome === "in_progress") return false;

    // Same-instance dedup on top (and the only dedup when there is no durable store).
    return claimInMemory(scopedKey, ttlMs) === "claimed";
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
