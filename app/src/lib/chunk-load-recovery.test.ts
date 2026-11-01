// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHUNK_RELOAD_STORAGE_KEY, chunkLoadRecoveryScript } from "./chunk-load-recovery";

type Listener = (event: unknown) => void;

/**
 * Runs the inline script against stand-ins for the browser globals it uses, so each test controls
 * the connection, the tab's sessionStorage and the clock.
 */
function runScript({
    onLine = true,
    storage = new Map<string, string>(),
    storageThrows = false,
}: {
    onLine?: boolean;
    storage?: Map<string, string>;
    storageThrows?: boolean;
} = {}) {
    const listeners = new Map<string, Array<{ listener: Listener; once: boolean }>>();
    const fakeWindow = {
        addEventListener(type: string, listener: Listener, options?: { once?: boolean }) {
            const list = listeners.get(type) ?? [];
            list.push({ listener, once: Boolean(options?.once) });
            listeners.set(type, list);
        },
    };
    const fakeNavigator = { onLine };
    const reload = vi.fn();
    const fakeSessionStorage = {
        getItem(key: string) {
            if (storageThrows) throw new Error("SecurityError");
            return storage.get(key) ?? null;
        },
        setItem(key: string, value: string) {
            if (storageThrows) throw new Error("SecurityError");
            storage.set(key, value);
        },
    };

    new Function("window", "location", "navigator", "sessionStorage", chunkLoadRecoveryScript)(
        fakeWindow,
        { reload },
        fakeNavigator,
        fakeSessionStorage
    );

    const emit = (type: string, event: unknown) => {
        const list = listeners.get(type) ?? [];
        listeners.set(
            type,
            list.filter((entry) => !entry.once)
        );
        list.forEach((entry) => entry.listener(event));
    };

    return {
        reload,
        storage,
        navigator: fakeNavigator,
        listenerCount: (type: string) => listeners.get(type)?.length ?? 0,
        chunkError: () =>
            emit("error", {
                error: { name: "ChunkLoadError", message: "Loading chunk 77 failed." },
            }),
        chunkRejection: () =>
            emit("unhandledrejection", {
                reason: new Error(
                    "Failed to fetch dynamically imported module: /_next/static/chunks/1.js"
                ),
            }),
        otherError: () => emit("error", { error: new TypeError("x is undefined") }),
        goOnline: () => emit("online", {}),
    };
}

describe("chunk-load recovery script", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-10-23T10:00:00Z"));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("reloads once when a chunk fails to load", () => {
        const page = runScript();

        page.chunkError();

        expect(page.reload).toHaveBeenCalledTimes(1);
        expect(JSON.parse(page.storage.get(CHUNK_RELOAD_STORAGE_KEY)!)).toEqual([Date.now()]);
    });

    it("also recovers from a failed dynamic import", () => {
        const page = runScript();
        page.chunkRejection();
        expect(page.reload).toHaveBeenCalledTimes(1);
    });

    it("ignores every other error", () => {
        const page = runScript();
        page.otherError();
        expect(page.reload).not.toHaveBeenCalled();
    });

    it("never reloads twice within ten seconds", () => {
        const storage = new Map<string, string>();
        runScript({ storage }).chunkError();

        vi.advanceTimersByTime(9_999);
        const reloaded = runScript({ storage });
        reloaded.chunkError();
        expect(reloaded.reload).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1);
        reloaded.chunkError();
        expect(reloaded.reload).toHaveBeenCalledTimes(1);
    });

    it("reloads at most twice in five minutes, then again once the window has passed", () => {
        const storage = new Map<string, string>();
        const first = runScript({ storage });
        first.chunkError();

        vi.advanceTimersByTime(60_000);
        const second = runScript({ storage });
        second.chunkError();
        expect(second.reload).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(60_000);
        const third = runScript({ storage });
        third.chunkError();
        expect(third.reload).not.toHaveBeenCalled();

        // Five minutes after the first reload, one slot is free again.
        vi.advanceTimersByTime(3 * 60_000);
        third.chunkError();
        expect(third.reload).toHaveBeenCalledTimes(1);
    });

    it("counts the marker an older build left in the tab", () => {
        const storage = new Map([
            [CHUNK_RELOAD_STORAGE_KEY, `/explore|?q=pottery|${Date.now() - 5_000}`],
        ]);
        const page = runScript({ storage });

        page.chunkError();
        expect(page.reload).not.toHaveBeenCalled();
    });

    it("waits for the connection instead of reloading into the offline page", () => {
        const page = runScript({ onLine: false });

        page.chunkError();
        page.chunkRejection();
        expect(page.reload).not.toHaveBeenCalled();
        expect(page.listenerCount("online")).toBe(1);

        page.navigator.onLine = true;
        page.goOnline();
        expect(page.reload).toHaveBeenCalledTimes(1);
        expect(page.listenerCount("online")).toBe(0);
    });

    it("keeps the cap when the connection comes back", () => {
        const now = Date.now();
        const storage = new Map([
            [CHUNK_RELOAD_STORAGE_KEY, JSON.stringify([now - 120_000, now - 60_000])],
        ]);
        const page = runScript({ onLine: false, storage });

        page.chunkError();
        page.navigator.onLine = true;
        page.goOnline();

        expect(page.reload).not.toHaveBeenCalled();
    });

    it("does not reload where sessionStorage is unavailable, since it could loop", () => {
        const page = runScript({ storageThrows: true });
        page.chunkError();
        expect(page.reload).not.toHaveBeenCalled();
    });
});
