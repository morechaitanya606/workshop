import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { requireSupabaseService } from "@/lib/api-helpers";
import { assertRateLimit } from "@/lib/rate-limit";
import { ensureWorkshopSeededFromMock } from "@/lib/workshop-utils";

vi.mock("@/lib/api-auth", () => ({
    requireAuthenticatedUser: vi.fn(),
    jsonError: vi.fn((message: string, status = 400, details?: unknown) =>
        NextResponse.json(
            {
                error: message,
                details: details ?? null,
            },
            { status }
        )
    ),
}));

vi.mock("@/lib/api-helpers", () => ({
    requireSupabaseService: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
    assertRateLimit: vi.fn(),
    getRateLimitKey: vi.fn(() => "bookings-hold-test"),
}));

vi.mock("@/lib/workshop-utils", () => ({
    ensureWorkshopSeededFromMock: vi.fn(),
}));

vi.mock("@/lib/booking-time", () => ({
    BOOKING_CUTOFF_HOURS: 3,
    isBookingClosedNow: vi.fn(() => false),
}));

vi.mock("@sentry/nextjs", () => ({
    captureException: vi.fn(),
    captureMessage: vi.fn(),
    setTag: vi.fn(),
}));

function createQueryBuilder<T>(result: T) {
    const builder = {
        eq: vi.fn(),
        gt: vi.fn(),
        lt: vi.fn(),
        single: vi.fn(),
        maybeSingle: vi.fn(),
    };

    builder.eq.mockImplementation(() => builder);
    builder.gt.mockImplementation(() => builder);
    builder.lt.mockImplementation(() => builder);
    builder.single.mockResolvedValue(result);
    builder.maybeSingle.mockResolvedValue(result);

    return builder;
}

function createUpdateBuilder() {
    const builder = {
        eq: vi.fn(),
    };

    builder.eq.mockImplementation(() => builder);

    return builder;
}

describe("POST /api/bookings/hold", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns the auth response when the user is unauthenticated", async () => {
        const unauthenticatedResponse = NextResponse.json(
            { error: "Unauthorized" },
            { status: 401 }
        );
        vi.mocked(requireAuthenticatedUser).mockResolvedValue({
            ok: false,
            response: unauthenticatedResponse,
        });

        const request = new NextRequest("http://localhost/api/bookings/hold", {
            method: "POST",
            body: JSON.stringify({
                workshopId: "workshop-1",
                guests: 2,
            }),
        });

        const response = await POST(request);

        expect(response).toBe(unauthenticatedResponse);
        expect(requireAuthenticatedUser).toHaveBeenCalledWith(request);
    });

    it("creates a seat hold and returns the hold payload", async () => {
        const holdId = "22222222-2222-4222-8222-222222222222";
        const holdRecord = {
            id: holdId,
            guests: 2,
            expires_at: "2026-05-10T12:15:00.000Z",
            workshop: {
                id: "workshop-1",
                title: "Intro to Wheel Throwing",
                price: 1500,
                date: "2026-05-10",
                time: "11:00",
                location: "Clay Studio",
                city: "Bengaluru",
                cover_image: "/images/wheel-throwing.jpg",
            },
        };

        const workshopTimingBuilder = createQueryBuilder({
            data: {
                id: "workshop-1",
                date: "2026-05-10",
                time: "11:00",
            },
            error: null,
        });
        const holdRecordBuilder = createQueryBuilder({
            data: holdRecord,
            error: null,
        });

        // No release call: create_booking_hold releases the caller own superseded hold under
        // the same lock as the seat check, so the route no longer commits one up front.
        const serviceClient = {
            from: vi
                .fn()
                .mockImplementationOnce(() => ({
                    select: vi.fn(() => workshopTimingBuilder),
                }))
                .mockImplementationOnce(() => ({
                    select: vi.fn(() => holdRecordBuilder),
                })),
            rpc: vi.fn().mockResolvedValue({
                data: holdId,
                error: null,
            }),
        };

        vi.mocked(requireAuthenticatedUser).mockResolvedValue({
            ok: true,
            user: { id: "user-1" } as any,
            accessToken: "token",
        });
        vi.mocked(assertRateLimit).mockResolvedValue({ ok: true } as any);
        vi.mocked(requireSupabaseService).mockReturnValue({
            ok: true,
            client: serviceClient as any,
        });
        vi.mocked(ensureWorkshopSeededFromMock).mockResolvedValue(true);

        const request = new NextRequest("http://localhost/api/bookings/hold", {
            method: "POST",
            body: JSON.stringify({
                workshopId: "workshop-1",
                guests: 2,
            }),
        });

        const response = await POST(request);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toEqual({
            hold: holdRecord,
            holdDurationMinutes: 15,
        });
        expect(serviceClient.rpc).toHaveBeenCalledWith("create_booking_hold", {
            p_user_id: "user-1",
            p_workshop_id: "workshop-1",
            p_guests: 2,
            p_hold_minutes: 15,
        });
    });

    /**
     * The RPC is the only atomic seat check. Routing its rejections into the
     * read-then-insert fallback meant that under the lock contention which produces
     * transient RPC errors, concurrent requests all read the same `seats_remaining` and
     * all inserted -- an oversell at exactly peak load.
     */
    it.each([
        {
            name: "honours INSUFFICIENT_SEATS from the RPC without falling back",
            rpcMessage: "new row violates ... INSUFFICIENT_SEATS",
            expectedStatus: 409,
            expectedCode: "INSUFFICIENT_SEATS",
        },
        {
            name: "returns a retryable error when the RPC fails transiently",
            rpcMessage: "canceling statement due to lock_timeout",
            expectedStatus: 503,
            expectedCode: "HOLD_UNAVAILABLE",
        },
    ])("$name", async ({ rpcMessage, expectedStatus, expectedCode }) => {
        const workshopTimingBuilder = createQueryBuilder({
            data: { id: "workshop-1", date: "2026-05-10", time: "11:00" },
            error: null,
        });
        const insert = vi.fn();

        const serviceClient = {
            from: vi
                .fn()
                .mockImplementationOnce(() => ({
                    select: vi.fn(() => workshopTimingBuilder),
                }))
                .mockImplementation(() => ({
                    insert,
                    select: vi.fn(() => createQueryBuilder({ data: null, error: null })),
                    update: vi.fn(() => createUpdateBuilder()),
                })),
            rpc: vi.fn().mockResolvedValue({
                data: null,
                error: { code: "P0001", message: rpcMessage },
            }),
        };

        vi.mocked(requireAuthenticatedUser).mockResolvedValue({
            ok: true,
            user: { id: "user-1" } as any,
            accessToken: "token",
        });
        vi.mocked(assertRateLimit).mockResolvedValue({ ok: true } as any);
        vi.mocked(requireSupabaseService).mockReturnValue({
            ok: true,
            client: serviceClient as any,
        });
        vi.mocked(ensureWorkshopSeededFromMock).mockResolvedValue(true);

        const response = await POST(
            new NextRequest("http://localhost/api/bookings/hold", {
                method: "POST",
                body: JSON.stringify({ workshopId: "workshop-1", guests: 2 }),
            })
        );
        const body = await response.json();

        expect(response.status).toBe(expectedStatus);
        expect(body.details?.code).toBe(expectedCode);
        // The decisive assertion: no unsynchronised insert behind the RPC's back.
        expect(insert).not.toHaveBeenCalled();
    });

    it("falls back to the non-atomic path only when the RPC is absent", async () => {
        // Chainable stub: every builder method returns the chain, and awaiting it yields
        // the configured result. Mirrors the shapes the fallback actually uses
        // (update/eq/lt, select/eq/single, select/eq/eq/gt).
        const createChain = (result: unknown) => {
            const chain: any = {};
            for (const method of ["select", "update", "insert", "eq", "lt", "gt", "in"]) {
                chain[method] = vi.fn(() => chain);
            }
            chain.single = vi.fn().mockResolvedValue(result);
            chain.maybeSingle = vi.fn().mockResolvedValue(result);
            chain.then = (resolve: (value: unknown) => unknown) => resolve(result);
            return chain;
        };

        const workshopTimingBuilder = createQueryBuilder({
            data: { id: "workshop-1", date: "2026-05-10", time: "11:00" },
            error: null,
        });

        const serviceClient = {
            from: vi
                .fn()
                .mockImplementationOnce(() => ({
                    select: vi.fn(() => workshopTimingBuilder),
                }))
                // release existing holds, then the expiry sweep
                .mockImplementationOnce(() => createChain({ data: null, error: null }))
                .mockImplementationOnce(() => createChain({ data: null, error: null }))
                // workshop seat lookup: sold out
                .mockImplementationOnce(() =>
                    createChain({
                        data: { id: "workshop-1", seats_remaining: 0 },
                        error: null,
                    })
                )
                // active holds sum
                .mockImplementation(() => createChain({ data: [], error: null })),
            rpc: vi.fn().mockResolvedValue({
                data: null,
                error: { code: "PGRST202", message: "Could not find the function" },
            }),
        };

        vi.mocked(requireAuthenticatedUser).mockResolvedValue({
            ok: true,
            user: { id: "user-1" } as any,
            accessToken: "token",
        });
        vi.mocked(assertRateLimit).mockResolvedValue({ ok: true } as any);
        vi.mocked(requireSupabaseService).mockReturnValue({
            ok: true,
            client: serviceClient as any,
        });
        vi.mocked(ensureWorkshopSeededFromMock).mockResolvedValue(true);

        const response = await POST(
            new NextRequest("http://localhost/api/bookings/hold", {
                method: "POST",
                body: JSON.stringify({ workshopId: "workshop-1", guests: 2 }),
            })
        );
        const body = await response.json();

        // Reached the fallback's own sold-out check rather than the RPC error mapping.
        expect(response.status).toBe(409);
        expect(body.details?.code).toBe("WORKSHOP_SOLD_OUT");
        expect(serviceClient.rpc).toHaveBeenCalledTimes(1);
    });

    /**
     * The fallback has no lock between the seat sum and the insert, so concurrent requests
     * all read the same seats_remaining and all succeed. An unmigrated production database
     * is a deploy to stop, not a reason to start overselling.
     */
    it("refuses the non-atomic fallback in production instead of overselling", async () => {
        vi.stubEnv("NODE_ENV", "production");

        const workshopTimingBuilder = createQueryBuilder({
            data: { id: "workshop-1", date: "2026-05-10", time: "11:00" },
            error: null,
        });
        const insert = vi.fn();

        const serviceClient = {
            from: vi
                .fn()
                .mockImplementationOnce(() => ({
                    select: vi.fn(() => workshopTimingBuilder),
                }))
                .mockImplementation(() => ({
                    insert,
                    select: vi.fn(() => createQueryBuilder({ data: null, error: null })),
                    update: vi.fn(() => createUpdateBuilder()),
                })),
            rpc: vi.fn().mockResolvedValue({
                data: null,
                error: { code: "PGRST202", message: "Could not find the function" },
            }),
        };

        vi.mocked(requireAuthenticatedUser).mockResolvedValue({
            ok: true,
            user: { id: "user-1" } as any,
            accessToken: "token",
        });
        vi.mocked(assertRateLimit).mockResolvedValue({ ok: true } as any);
        vi.mocked(requireSupabaseService).mockReturnValue({
            ok: true,
            client: serviceClient as any,
        });
        vi.mocked(ensureWorkshopSeededFromMock).mockResolvedValue(true);

        try {
            const response = await POST(
                new NextRequest("http://localhost/api/bookings/hold", {
                    method: "POST",
                    body: JSON.stringify({ workshopId: "workshop-1", guests: 2 }),
                })
            );
            const body = await response.json();

            expect(response.status).toBe(503);
            expect(body.details?.code).toBe("HOLD_UNAVAILABLE");
            // The decisive assertion: no unsynchronised insert behind the missing RPC.
            expect(insert).not.toHaveBeenCalled();
        } finally {
            vi.unstubAllEnvs();
        }
    });
});
