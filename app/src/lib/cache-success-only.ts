/**
 * `unstable_cache` stores whatever its function returns, including a fallback the function
 * returned after a failed query, and then serves that fallback for the whole revalidate window.
 * One slow database moment became minutes of "Unable to load live workshops" (and an hour of
 * empty platform settings), and "Try again" just read the cached failure back.
 *
 * Inside a cached function, throw `new NotCached(fallback)` instead of returning the fallback:
 * Next does not store a thrown result. Wrap the cached call in `readThroughCache`, which hands
 * that fallback to this request only, so the next request queries again.
 */
export class NotCached<T> extends Error {
    readonly value: T;

    constructor(value: T) {
        super("Result not cached");
        this.name = "NotCached";
        this.value = value;
    }
}

function isNotCached(error: unknown): error is NotCached<unknown> {
    return (
        error instanceof NotCached ||
        (error instanceof Error && error.name === "NotCached" && "value" in error)
    );
}

export async function readThroughCache<T>(read: () => Promise<T>): Promise<T> {
    try {
        return await read();
    } catch (error) {
        if (isNotCached(error)) return error.value as T;
        throw error;
    }
}

/** Runs `attempt` once more when it reports failure: most failures here are one-off timeouts. */
export async function withOneRetry<T>(attempt: () => Promise<T>, failed: (result: T) => boolean) {
    const first = await attempt();
    return failed(first) ? attempt() : first;
}
