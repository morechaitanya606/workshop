// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-role-key" },
    getPublicSupabaseConfig: () => ({ url: "https://example.supabase.co", key: "anon-key" }),
    getServiceRoleKey: () => "service-role-key",
}));

const created = vi.hoisted(() => ({
    fetches: [] as Array<typeof fetch>,
}));

vi.mock("@supabase/supabase-js", () => ({
    createClient: (_url: string, _key: string, options?: { global?: { fetch?: typeof fetch } }) => {
        if (options?.global?.fetch) created.fetches.push(options.global.fetch);
        return {};
    },
}));

import {
    DEV_MIN_REQUEST_TIMEOUT_MS,
    createSupabaseServiceClient,
    effectiveRequestTimeoutMs,
} from "@/lib/supabase-server";

describe("effectiveRequestTimeoutMs", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("keeps the production timeouts exactly", () => {
        vi.stubEnv("NODE_ENV", "production");
        expect(effectiveRequestTimeoutMs(2500)).toBe(2500);
        expect(effectiveRequestTimeoutMs(5000)).toBe(5000);
    });

    it("keeps the timeouts under test", () => {
        vi.stubEnv("NODE_ENV", "test");
        expect(effectiveRequestTimeoutMs(2500)).toBe(2500);
    });

    it("gives next dev at least the development floor, and never shortens a longer one", () => {
        vi.stubEnv("NODE_ENV", "development");
        expect(effectiveRequestTimeoutMs(2500)).toBe(DEV_MIN_REQUEST_TIMEOUT_MS);
        expect(effectiveRequestTimeoutMs(120_000)).toBe(120_000);
    });
});

describe("the service client's request timeout", () => {
    const realFetch = globalThis.fetch;

    beforeEach(() => {
        vi.useFakeTimers();
        created.fetches.length = 0;
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllEnvs();
        globalThis.fetch = realFetch;
    });

    /** A fetch that never answers and reports whether its request was aborted. */
    function hangingFetch() {
        const state = { aborted: false };
        globalThis.fetch = vi.fn((_input: unknown, init?: RequestInit) => {
            init?.signal?.addEventListener("abort", () => {
                state.aborted = true;
            });
            return new Promise<Response>(() => {});
        }) as unknown as typeof fetch;
        return state;
    }

    it("aborts a request after the requested time in production", async () => {
        vi.stubEnv("NODE_ENV", "production");
        const state = hangingFetch();
        createSupabaseServiceClient({ requestTimeoutMs: 2500 });
        void created.fetches[0]("https://example.supabase.co/rest/v1/x");

        await vi.advanceTimersByTimeAsync(2499);
        expect(state.aborted).toBe(false);
        await vi.advanceTimersByTimeAsync(2);
        expect(state.aborted).toBe(true);
    });

    it("waits much longer under next dev, so a first compile does not time out healthy reads", async () => {
        vi.stubEnv("NODE_ENV", "development");
        const state = hangingFetch();
        createSupabaseServiceClient({ requestTimeoutMs: 2500 });
        void created.fetches[0]("https://example.supabase.co/rest/v1/x");

        await vi.advanceTimersByTimeAsync(29_000);
        expect(state.aborted).toBe(false);
        await vi.advanceTimersByTimeAsync(2000);
        expect(state.aborted).toBe(true);
    });
});
