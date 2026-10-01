import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { requireSupabaseService } from "@/lib/api-helpers";
import { assertRateLimit } from "@/lib/rate-limit";

vi.mock("@/lib/api-auth", () => ({
    requireAuthenticatedUser: vi.fn(),
    jsonError: vi.fn((message: string, status = 400, details?: unknown) =>
        NextResponse.json({ error: message, details: details ?? null }, { status })
    ),
}));

vi.mock("@/lib/api-helpers", () => ({
    requireSupabaseService: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
    assertRateLimit: vi.fn(),
    getRateLimitKey: vi.fn(() => "workshop-feedback-test"),
}));

/** Chainable query stub: every builder method returns the chain, awaiting yields `result`. */
function createChain(result: unknown) {
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "limit", "upsert"]) {
        chain[method] = vi.fn(() => chain);
    }
    chain.single = vi.fn().mockResolvedValue(result);
    chain.maybeSingle = vi.fn().mockResolvedValue(result);
    chain.then = (resolve: (value: unknown) => unknown) => resolve(result);
    return chain as Record<string, ReturnType<typeof vi.fn>>;
}

const SAVED_ROW = {
    rating: 5,
    comment: "Loved it",
    photos: [],
    video_url: null,
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
};

function setup(options: {
    workshop: { date: string; time: string | null };
    existing?: Record<string, unknown> | null;
}) {
    const feedback = createChain({ data: SAVED_ROW, error: null });
    // The first read on this table is the "existing review" lookup; the upsert chain shares
    // the object, so route the lookup through its own maybeSingle result.
    feedback.maybeSingle = vi.fn().mockResolvedValue({
        data: options.existing ?? null,
        error: null,
    });

    const serviceClient = {
        from: vi.fn((table: string) => {
            if (table === "workshops") return createChain({ data: options.workshop, error: null });
            if (table === "bookings") {
                return createChain({ data: [{ id: "booking-1" }], error: null });
            }
            if (table === "workshop_feedback") return feedback;
            throw new Error(`Unexpected table ${table}`);
        }),
    };

    vi.mocked(requireAuthenticatedUser).mockResolvedValue({
        ok: true,
        user: { id: "user-1" },
        accessToken: "token",
    } as never);
    vi.mocked(assertRateLimit).mockResolvedValue({ ok: true } as never);
    vi.mocked(requireSupabaseService).mockReturnValue({
        ok: true,
        client: serviceClient as never,
    });

    return { feedback };
}

function feedbackRequest(body: Record<string, unknown> = { rating: 5, comment: "Loved it" }) {
    return new NextRequest("http://localhost/api/workshops/workshop-1/feedback", {
        method: "POST",
        body: JSON.stringify(body),
    });
}

const params = { params: Promise.resolve({ id: "workshop-1" }) };

describe("POST /api/workshops/[id]/feedback", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    /**
     * 10:00 UTC is 15:30 IST. A 15:00 workshop has started in India, but parsed with no zone
     * on a UTC server it read as 15:00 UTC -- five hours away -- and feedback stayed locked.
     */
    it("reads the workshop start as IST, not as the server's zone", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-10-01T10:00:00Z"));
        const { feedback } = setup({ workshop: { date: "2026-10-01", time: "15:00" } });

        const response = await POST(feedbackRequest(), params);

        expect(response.status).toBe(200);
        expect(feedback.upsert).toHaveBeenCalledTimes(1);
    });

    it("still rejects feedback before the workshop has started in IST", async () => {
        vi.useFakeTimers();
        // 04:00 UTC = 09:30 IST; the workshop starts at 15:00 IST.
        vi.setSystemTime(new Date("2026-10-01T04:00:00Z"));
        const { feedback } = setup({ workshop: { date: "2026-10-01", time: "15:00" } });

        const response = await POST(feedbackRequest(), params);

        expect(response.status).toBe(409);
        expect(feedback.upsert).not.toHaveBeenCalled();
    });

    it("accepts a Postgres time with seconds", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-10-01T10:00:00Z"));
        const { feedback } = setup({ workshop: { date: "2026-10-01", time: "15:00:00" } });

        const response = await POST(feedbackRequest(), params);

        expect(response.status).toBe(200);
        expect(feedback.upsert).toHaveBeenCalledTimes(1);
    });

    /**
     * An edit to an approved review used to leave is_published untouched, so a harmless
     * review could be rewritten to anything while it stayed live.
     */
    it("sends an edited review back to moderation", async () => {
        const { feedback } = setup({
            workshop: { date: "2020-01-01", time: "10:00" },
            existing: { rating: 5, comment: "Loved it", photos: [], video_url: null },
        });

        const response = await POST(
            feedbackRequest({ rating: 5, comment: "Actually, buy my product at spam.example" }),
            params
        );

        expect(response.status).toBe(200);
        expect(feedback.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                comment: "Actually, buy my product at spam.example",
                is_published: false,
            }),
            { onConflict: "user_id,workshop_id" }
        );
    });

    it("queues a brand new review as unpublished", async () => {
        const { feedback } = setup({ workshop: { date: "2020-01-01", time: "10:00" } });

        await POST(feedbackRequest(), params);

        expect(feedback.upsert).toHaveBeenCalledWith(
            expect.objectContaining({ is_published: false }),
            expect.anything()
        );
    });

    it("does not unpublish an approved review that was re-saved unchanged", async () => {
        const { feedback } = setup({
            workshop: { date: "2020-01-01", time: "10:00" },
            existing: { rating: 5, comment: "Loved it", photos: [], video_url: null },
        });

        const response = await POST(feedbackRequest(), params);

        expect(response.status).toBe(200);
        const row = feedback.upsert.mock.calls[0][0] as Record<string, unknown>;
        expect(row).not.toHaveProperty("is_published");
    });
});
