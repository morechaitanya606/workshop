type IdempotencyEntry = {
    expiresAt: number;
};

const idempotencyStore = new Map<string, IdempotencyEntry>();
const MAX_KEYS = 50_000;

function cleanup(now: number) {
    if (idempotencyStore.size < MAX_KEYS) return;

    for (const [key, entry] of Array.from(idempotencyStore.entries())) {
        if (entry.expiresAt <= now) {
            idempotencyStore.delete(key);
        }
    }
}

export function claimIdempotencyKey(scope: string, key: string, ttlMs = 24 * 60 * 60 * 1000) {
    const now = Date.now();
    cleanup(now);

    const scopedKey = `${scope}:${key}`;
    const current = idempotencyStore.get(scopedKey);
    if (current && current.expiresAt > now) {
        return false;
    }

    idempotencyStore.set(scopedKey, {
        expiresAt: now + ttlMs,
    });
    return true;
}
