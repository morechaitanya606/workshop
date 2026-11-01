import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireSupabaseService } from "@/lib/api-helpers";
import { enforceRateLimit } from "@/lib/rate-limit";

import { GET } from "./route";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

vi.mock("@/lib/rate-limit", () => ({
    enforceRateLimit: vi.fn(),
}));

vi.mock("@/lib/api-helpers", () => ({
    requireSupabaseService: vi.fn(),
}));

vi.mock("@/lib/workshop-utils", () => ({
    mapWorkshopRowToWorkshop: (row: { id: string }) => ({ id: row.id }),
}));

type Result = { data: unknown; error: { code?: string; message?: string } | null };

/** A Supabase client whose queries resolve to the given results, in call order. */
function clientReturning(...results: Result[]) {
    const queue = [...results];
    const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => queue.shift() ?? { data: null, error: null },
    };
    return { from: () => query };
}

function call(id = "pottery-1") {
    return GET(new NextRequest(`http://localhost/api/workshops/${id}`), {
        params: Promise.resolve({ id }),
    });
}

describe("GET /api/workshops/[id]", () => {
    beforeEach(() => {
        vi.mocked(enforceRateLimit).mockResolvedValue({ ok: true } as never);
    });

    it("returns the workshop with CDN cache headers", async () => {
        vi.mocked(requireSupabaseService).mockReturnValue({
            ok: true,
            client: clientReturning({ data: { id: "pottery-1" }, error: null }),
        } as never);

        const response = await call();

        expect(response.status).toBe(200);
        expect(response.headers.get("Cache-Control")).toContain("s-maxage=60");
        expect((await response.json()).workshop).toEqual({ id: "pottery-1" });
    });

    it("answers 404 only for a workshop that does not exist", async () => {
        vi.mocked(requireSupabaseService).mockReturnValue({
            ok: true,
            client: clientReturning({ data: null, error: null }),
        } as never);

        const response = await call("gone");

        expect(response.status).toBe(404);
    });

    it("answers a retryable 503, not 404, when the database read fails", async () => {
        vi.mocked(requireSupabaseService).mockReturnValue({
            ok: true,
            client: clientReturning({
                data: null,
                error: { code: "57014", message: "canceling statement due to statement timeout" },
            }),
        } as never);

        const response = await call();

        expect(response.status).toBe(503);
        expect(response.headers.get("Cache-Control")).toBe("no-store");
        expect((await response.json()).error).toMatch(/try again/i);
    });
});
