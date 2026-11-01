import * as Sentry from "@sentry/nextjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseServerClient } from "@/lib/supabase-server";
import { loadWorkshop, WorkshopReadError } from "./workshop-read";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({
    isSupabaseServiceConfigured: true,
    createSupabaseServiceClient: vi.fn(),
}));
vi.mock("@/lib/workshop-utils", () => ({
    mapWorkshopRowToWorkshop: (row: { id: string }) => ({ id: row.id, title: "Mapped" }),
}));

type Answer = { data: unknown; error: unknown } | Error;

/** A client whose maybeSingle() resolves (or rejects) with the next answer. */
function clientAnswering(answers: Answer[]) {
    const calls = { count: 0 };
    const createClient = () => {
        const builder = {
            select: () => builder,
            eq: () => builder,
            maybeSingle: () => {
                const answer = answers[Math.min(calls.count, answers.length - 1)];
                calls.count += 1;
                return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
            },
        };
        return { from: () => builder } as unknown as SupabaseServerClient;
    };
    return { createClient, calls };
}

describe("loadWorkshop", () => {
    it("returns the workshop when found", async () => {
        const { createClient } = clientAnswering([{ data: { id: "w1" }, error: null }]);
        await expect(loadWorkshop("w1", createClient)).resolves.toMatchObject({ id: "w1" });
    });

    it("returns null (a real 404) only for a successful empty result", async () => {
        const { createClient, calls } = clientAnswering([{ data: null, error: null }]);
        await expect(loadWorkshop("w1", createClient)).resolves.toBeNull();
        expect(calls.count).toBe(1);
    });

    it("retries a failed read once", async () => {
        const { createClient, calls } = clientAnswering([
            { data: null, error: { message: "timeout" } },
            { data: { id: "w1" }, error: null },
        ]);
        await expect(loadWorkshop("w1", createClient)).resolves.toMatchObject({ id: "w1" });
        expect(calls.count).toBe(2);
    });

    it("throws when both reads fail, so Next keeps the last good page", async () => {
        const { createClient, calls } = clientAnswering([new Error("network down")]);
        await expect(loadWorkshop("w1", createClient)).rejects.toBeInstanceOf(WorkshopReadError);
        expect(calls.count).toBe(2);
    });

    it("treats a database error answer as a failed read, never as a missing workshop", async () => {
        const { createClient } = clientAnswering([{ data: null, error: { message: "timeout" } }]);
        await expect(loadWorkshop("w1", createClient)).rejects.toBeInstanceOf(WorkshopReadError);
    });

    it("treats a client that cannot be created as a failed read, not a 404", async () => {
        await expect(
            loadWorkshop("w1", () => {
                throw new Error("missing service key");
            })
        ).rejects.toBeInstanceOf(WorkshopReadError);
    });

    it("reads without the approval filter while that column does not exist yet", async () => {
        const filters: string[] = [];
        const answers = [
            { data: null, error: { message: "column workshops.approval_status does not exist" } },
            { data: { id: "w1" }, error: null },
        ];
        let calls = 0;
        const createClient = () => {
            const builder = {
                select: () => builder,
                eq: (column: string) => {
                    filters.push(column);
                    return builder;
                },
                maybeSingle: () => Promise.resolve(answers[Math.min(calls++, answers.length - 1)]),
            };
            return { from: () => builder } as unknown as SupabaseServerClient;
        };
        await expect(loadWorkshop("w1", createClient)).resolves.toMatchObject({ id: "w1" });
        // The id and the approval filter first, then the id alone.
        expect(filters).toEqual(["id", "approval_status", "id"]);
    });

    it("keeps `next build` going when a read fails: the page renders on demand later", async () => {
        vi.stubEnv("NEXT_PHASE", "phase-production-build");
        const { createClient, calls } = clientAnswering([new Error("network down")]);
        await expect(loadWorkshop("w1", createClient)).resolves.toBeNull();
        expect(calls.count).toBe(2);
    });

    it("reports a failed read to Sentry; a missing workshop is not an error", async () => {
        const missing = clientAnswering([{ data: null, error: null }]);
        await loadWorkshop("w1", missing.createClient);
        expect(Sentry.captureException).not.toHaveBeenCalled();

        const failing = clientAnswering([new Error("network down")]);
        await expect(loadWorkshop("w1", failing.createClient)).rejects.toBeInstanceOf(
            WorkshopReadError
        );
        expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error), {
            tags: { layer: "web", route: "workshop_detail" },
        });
    });
});

afterEach(() => {
    vi.unstubAllEnvs();
});
