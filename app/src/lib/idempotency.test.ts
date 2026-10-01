import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
    client: null as unknown,
}));

vi.mock("@sentry/nextjs", () => ({
    captureException: vi.fn(),
    captureMessage: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({
    isSupabaseServiceConfigured: true,
    createSupabaseServiceClient: vi.fn(() => state.client),
}));

import {
    claimIdempotencyKey,
    claimIdempotencyLease,
    markIdempotencyKeyProcessed,
    releaseIdempotencyKey,
} from "./idempotency";

const LEASE_MS = 5 * 60 * 1000;

type Existing = { received_at: string; processed_at: string | null } | null;

function createClient(options: {
    insertError?: { code?: string; message?: string } | null;
    existing?: Existing;
    readError?: { message: string } | null;
    takeover?: { data: Array<{ id: string }>; error: unknown };
    updateError?: { message: string } | null;
}) {
    const calls = {
        insert: vi.fn(),
        update: vi.fn(),
        updateEq: [] as Array<[string, unknown]>,
        updateIs: [] as Array<[string, unknown]>,
        remove: vi.fn(),
    };

    const table = {
        insert: vi.fn((row: unknown) => {
            calls.insert(row);
            return Promise.resolve({ error: options.insertError ?? null });
        }),
        select: vi.fn(() => {
            const chain = {
                eq: vi.fn(() => chain),
                maybeSingle: vi.fn().mockResolvedValue({
                    data: options.existing ?? null,
                    error: options.readError ?? null,
                }),
            };
            return chain;
        }),
        update: vi.fn((values: unknown) => {
            calls.update(values);
            const result = options.takeover ?? {
                data: [],
                error: options.updateError ?? null,
            };
            const chain: Record<string, unknown> = {
                eq: vi.fn((column: string, value: unknown) => {
                    calls.updateEq.push([column, value]);
                    return chain;
                }),
                is: vi.fn((column: string, value: unknown) => {
                    calls.updateIs.push([column, value]);
                    return chain;
                }),
                select: vi.fn(() => Promise.resolve(result)),
                then: (resolve: (value: unknown) => unknown) =>
                    resolve({ error: options.updateError ?? null }),
            };
            return chain;
        }),
        delete: vi.fn(() => {
            const chain = {
                eq: vi.fn(() => chain),
                then: (resolve: (value: unknown) => unknown) => {
                    calls.remove();
                    return resolve({ error: null });
                },
            };
            return chain;
        }),
    };

    const client = { from: vi.fn(() => table) };
    return { client, table, calls };
}

let counter = 0;
function uniqueKey(label: string) {
    counter += 1;
    return `${label}-${counter}-${Math.random().toString(36).slice(2)}`;
}

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

describe("claimIdempotencyKey (permanent claims)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("claims a fresh key", async () => {
        state.client = createClient({}).client;

        expect(await claimIdempotencyKey("scope", uniqueKey("fresh"))).toBe(true);
    });

    it("refuses a key that is already claimed, however old the claim is", async () => {
        const { client, table } = createClient({
            insertError: { code: "23505" },
            existing: { received_at: minutesAgo(600), processed_at: null },
        });
        state.client = client;

        expect(await claimIdempotencyKey("scope", uniqueKey("perm"))).toBe(false);
        // No lease semantics without opting in: nothing may read or take over the row.
        expect(table.select).not.toHaveBeenCalled();
        expect(table.update).not.toHaveBeenCalled();
    });

    it("fails closed on a database error instead of pretending the claim worked", async () => {
        state.client = createClient({
            insertError: { code: "57014", message: "statement timeout" },
        }).client;

        await expect(claimIdempotencyKey("scope", uniqueKey("closed"))).rejects.toMatchObject({
            code: "57014",
        });
    });
});

describe("claimIdempotencyLease", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("claims a fresh key", async () => {
        const { client, calls } = createClient({});
        state.client = client;

        const outcome = await claimIdempotencyLease("scope", uniqueKey("lease-new"), {
            leaseMs: LEASE_MS,
        });

        expect(outcome).toBe("claimed");
        expect(calls.insert).toHaveBeenCalledWith(
            expect.objectContaining({ provider: "idempotency", event_type: "idempotency_claim" })
        );
    });

    it("reports duplicate for an event that finished", async () => {
        state.client = createClient({
            insertError: { code: "23505" },
            existing: { received_at: minutesAgo(60), processed_at: minutesAgo(59) },
        }).client;

        expect(
            await claimIdempotencyLease("scope", uniqueKey("lease-done"), { leaseMs: LEASE_MS })
        ).toBe("duplicate");
    });

    it("reports in_progress while another delivery holds an unexpired lease", async () => {
        const { client, table } = createClient({
            insertError: { code: "23505" },
            existing: { received_at: minutesAgo(1), processed_at: null },
        });
        state.client = client;

        expect(
            await claimIdempotencyLease("scope", uniqueKey("lease-busy"), { leaseMs: LEASE_MS })
        ).toBe("in_progress");
        expect(table.update).not.toHaveBeenCalled();
    });

    /**
     * The point of the lease: a lambda that died mid-event left a permanent claim, so every
     * Razorpay retry was ACKed as a duplicate and the event was lost.
     */
    it("takes over a lease that expired without being marked processed", async () => {
        const staleReceivedAt = minutesAgo(10);
        const { client, calls } = createClient({
            insertError: { code: "23505" },
            existing: { received_at: staleReceivedAt, processed_at: null },
            takeover: { data: [{ id: "row-1" }], error: null },
        });
        state.client = client;

        const outcome = await claimIdempotencyLease("scope", uniqueKey("lease-stale"), {
            leaseMs: LEASE_MS,
        });

        expect(outcome).toBe("claimed");
        // Compare-and-swap on the stale timestamp, restricted to unprocessed rows, so two
        // retries racing for the same dead lease cannot both win.
        expect(calls.updateEq).toContainEqual(["received_at", staleReceivedAt]);
        expect(calls.updateIs).toContainEqual(["processed_at", null]);
    });

    it("reports in_progress when another retry won the takeover race", async () => {
        state.client = createClient({
            insertError: { code: "23505" },
            existing: { received_at: minutesAgo(10), processed_at: null },
            takeover: { data: [], error: null },
        }).client;

        expect(
            await claimIdempotencyLease("scope", uniqueKey("lease-race"), { leaseMs: LEASE_MS })
        ).toBe("in_progress");
    });

    it("fails closed when the claim row cannot be read", async () => {
        state.client = createClient({
            insertError: { code: "23505" },
            readError: { message: "connection reset" },
        }).client;

        await expect(
            claimIdempotencyLease("scope", uniqueKey("lease-read"), { leaseMs: LEASE_MS })
        ).rejects.toMatchObject({ message: "connection reset" });
    });

    it("fails closed on an insert error that is not a unique violation", async () => {
        state.client = createClient({
            insertError: { code: "57014", message: "statement timeout" },
        }).client;

        await expect(
            claimIdempotencyLease("scope", uniqueKey("lease-err"), { leaseMs: LEASE_MS })
        ).rejects.toMatchObject({ code: "57014" });
    });
});

describe("markIdempotencyKeyProcessed / releaseIdempotencyKey", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("stamps processed_at and makes the claim permanent in memory", async () => {
        const key = uniqueKey("mark");
        const { client, calls } = createClient({});
        state.client = client;

        await claimIdempotencyLease("scope", key, { leaseMs: LEASE_MS });
        await markIdempotencyKeyProcessed("scope", key);

        expect(calls.update).toHaveBeenCalledWith(
            expect.objectContaining({ processed_at: expect.any(String) })
        );

        // Same instance, DB says the row exists and is processed: duplicate, not in_progress.
        state.client = createClient({
            insertError: { code: "23505" },
            existing: { received_at: minutesAgo(1), processed_at: minutesAgo(0) },
        }).client;
        expect(await claimIdempotencyLease("scope", key, { leaseMs: LEASE_MS })).toBe("duplicate");
    });

    it("never throws when stamping processed_at fails", async () => {
        state.client = createClient({ updateError: { message: "boom" } }).client;

        await expect(
            markIdempotencyKeyProcessed("scope", uniqueKey("mark-fail"))
        ).resolves.toBeUndefined();
    });

    it("lets a released key be claimed again", async () => {
        const key = uniqueKey("release");
        const { client, calls } = createClient({});
        state.client = client;

        expect(await claimIdempotencyKey("scope", key)).toBe(true);
        await releaseIdempotencyKey("scope", key);

        expect(calls.remove).toHaveBeenCalled();
        expect(await claimIdempotencyKey("scope", key)).toBe(true);
    });
});
