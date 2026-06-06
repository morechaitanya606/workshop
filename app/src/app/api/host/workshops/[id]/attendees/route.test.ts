import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { requireHostOrAdmin } from "@/lib/api-auth";
import { requireSupabaseService } from "@/lib/api-helpers";

vi.mock("@/lib/api-auth", () => ({
    requireHostOrAdmin: vi.fn(),
}));

vi.mock("@/lib/api-helpers", () => ({
    requireSupabaseService: vi.fn(),
}));

vi.mock("@/lib/api-route", () => ({
    handleApiError: vi.fn((message: string, error: unknown, status = 500) =>
        NextResponse.json(
            {
                error: message,
                details: String(error),
            },
            { status }
        )
    ),
}));

function createWorkshopBuilder(result: unknown) {
    const builder = {
        eq: vi.fn(),
        maybeSingle: vi.fn(),
    };

    builder.eq.mockImplementation(() => builder);
    builder.maybeSingle.mockResolvedValue(result);

    return builder;
}

function createBookingsBuilder(result: unknown) {
    const builder = {
        eq: vi.fn(),
        order: vi.fn(),
    };

    builder.eq.mockImplementation(() => builder);
    builder.order.mockResolvedValue(result);

    return builder;
}

describe("GET /api/host/workshops/[id]/attendees", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("allows admins to load attendees for workshops they do not personally host", async () => {
        const workshopBuilder = createWorkshopBuilder({
            data: {
                id: "admin-owned-workshop",
                host_user_id: "host-123",
            },
            error: null,
        });
        const bookingsBuilder = createBookingsBuilder({
            data: [
                {
                    id: "booking-1",
                    first_name: "Asha",
                    last_name: "Rao",
                    email: "asha@example.com",
                    phone: "9999999999",
                    guests: 2,
                    status: "confirmed",
                    attended: false,
                    created_at: "2026-03-24T10:00:00.000Z",
                },
            ],
            error: null,
        });
        const serviceClient = {
            from: vi
                .fn()
                .mockImplementationOnce(() => ({
                    select: vi.fn(() => workshopBuilder),
                }))
                .mockImplementationOnce(() => ({
                    select: vi.fn(() => bookingsBuilder),
                })),
        };

        vi.mocked(requireHostOrAdmin).mockResolvedValue({
            ok: true,
            user: { id: "admin-1" } as any,
            accessToken: "token",
            role: "admin",
        });
        vi.mocked(requireSupabaseService).mockReturnValue({
            ok: true,
            client: serviceClient as any,
        });

        const response = await GET(
            new NextRequest("http://localhost/api/host/workshops/admin-owned-workshop/attendees"),
            {
                params: Promise.resolve({ id: "admin-owned-workshop" }),
            }
        );
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toEqual({
            success: true,
            attendees: [
                {
                    id: "booking-1",
                    first_name: "Asha",
                    last_name: "Rao",
                    email: "asha@example.com",
                    phone: "9999999999",
                    guests: 2,
                    status: "confirmed",
                    attended: false,
                    created_at: "2026-03-24T10:00:00.000Z",
                },
            ],
        });
    });
});
