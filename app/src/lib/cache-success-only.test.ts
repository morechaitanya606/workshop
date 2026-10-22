import { describe, expect, it, vi } from "vitest";
import { NotCached, readThroughCache, withOneRetry } from "./cache-success-only";

describe("readThroughCache", () => {
    it("returns the cached read's value", async () => {
        expect(await readThroughCache(async () => "fresh")).toBe("fresh");
    });

    it("turns a NotCached failure into its fallback for this request", async () => {
        const fallback = { data: [], source: "error" as const };
        expect(
            await readThroughCache(async () => {
                throw new NotCached(fallback);
            })
        ).toBe(fallback);
    });

    it("still throws unrelated errors", async () => {
        await expect(
            readThroughCache(async () => {
                throw new Error("boom");
            })
        ).rejects.toThrow("boom");
    });

    it("does not let unstable_cache-style caching keep a failure", async () => {
        // A minimal stand-in for unstable_cache: stores only values that resolve.
        const store = new Map<string, string>();
        const cached = (fn: () => Promise<string>) => async () => {
            if (store.has("k")) return store.get("k")!;
            const value = await fn();
            store.set("k", value);
            return value;
        };
        let healthy = false;
        const read = cached(async () => {
            if (!healthy) throw new NotCached("error");
            return "ok";
        });

        expect(await readThroughCache(read)).toBe("error");
        healthy = true;
        expect(await readThroughCache(read)).toBe("ok");
    });
});

describe("withOneRetry", () => {
    it("retries once when the first attempt failed", async () => {
        const attempt = vi.fn().mockResolvedValueOnce("error").mockResolvedValueOnce("ok");
        expect(await withOneRetry(attempt, (r) => r === "error")).toBe("ok");
        expect(attempt).toHaveBeenCalledTimes(2);
    });

    it("does not retry a success", async () => {
        const attempt = vi.fn().mockResolvedValue("ok");
        expect(await withOneRetry(attempt, (r) => r === "error")).toBe("ok");
        expect(attempt).toHaveBeenCalledTimes(1);
    });
});
