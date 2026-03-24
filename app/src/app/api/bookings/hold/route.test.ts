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
        const releaseBuilder = createUpdateBuilder();
        const holdRecordBuilder = createQueryBuilder({
            data: holdRecord,
            error: null,
        });

        const serviceClient = {
            from: vi
                .fn()
                .mockImplementationOnce(() => ({
                    select: vi.fn(() => workshopTimingBuilder),
                }))
                .mockImplementationOnce(() => ({
                    update: vi.fn(() => releaseBuilder),
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
});
