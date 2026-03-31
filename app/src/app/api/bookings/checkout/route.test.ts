import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { requireSupabaseService } from "@/lib/api-helpers";
import { assertRateLimit } from "@/lib/rate-limit";
import { ensureWorkshopSeededFromMock } from "@/lib/workshop-utils";
import { getRazorpayServerClient } from "@/lib/razorpay-server";

vi.mock("@/lib/api-auth", () => ({
    requireAuthenticatedUser: vi.fn(),
}));

vi.mock("@/lib/api-helpers", () => ({
    requireSupabaseService: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
    assertRateLimit: vi.fn(),
    getRateLimitKey: vi.fn(() => "bookings-checkout-test"),
}));

vi.mock("@/lib/workshop-utils", () => ({
    ensureWorkshopSeededFromMock: vi.fn(),
}));

vi.mock("@/lib/booking-time", () => ({
    BOOKING_CUTOFF_HOURS: 3,
    isBookingClosedNow: vi.fn(() => false),
}));

vi.mock("@/lib/payment-notifications", () => ({
    sendPaymentNotification: vi.fn(),
}));

vi.mock("@sentry/core", () => ({
    captureException: vi.fn(),
    captureMessage: vi.fn(),
}));

vi.mock("@/lib/razorpay-server", () => ({
    getRazorpayKeyId: vi.fn(() => "rzp_test_123"),
    getRazorpayServerClient: vi.fn(),
    isRazorpayConfigured: true,
    verifyRazorpayOrderSignature: vi.fn(() => true),
}));

function createQueryBuilder<T>(result: T) {
    const builder = {
        eq: vi.fn(),
        single: vi.fn(),
        maybeSingle: vi.fn(),
    };

    builder.eq.mockImplementation(() => builder);
    builder.single.mockResolvedValue(result);
    builder.maybeSingle.mockResolvedValue(result);

    return builder;
}

describe("POST /api/bookings/checkout", () => {
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

        const request = new NextRequest("http://localhost/api/bookings/checkout", {
            method: "POST",
            body: JSON.stringify({
                holdId: "11111111-1111-4111-8111-111111111111",
                workshopId: "workshop-1",
                firstName: "Chait",
                lastName: "Tester",
                email: "chait@example.com",
                phone: "9876543210",
            }),
        });

        const response = await POST(request);

        expect(response).toBe(unauthenticatedResponse);
        expect(requireAuthenticatedUser).toHaveBeenCalledWith(request);
    });

    it("creates a Razorpay order for a valid seat hold", async () => {
        const serviceClient = {
            from: vi
                .fn()
                .mockImplementationOnce(() => ({
                    select: vi.fn(() =>
                        createQueryBuilder({
                            data: {
                                id: "11111111-1111-4111-8111-111111111111",
                                workshop_id: "workshop-1",
                                user_id: "user-1",
                                guests: 2,
                                status: "active",
                                expires_at: "2099-05-10T12:15:00.000Z",
                                workshop: {
                                    id: "workshop-1",
                                    title: "Intro to Wheel Throwing",
                                    price: 1500,
                                    seats_remaining: 8,
                                    date: "2099-05-10",
                                    time: "11:00",
                                },
                            },
                            error: null,
                        })
                    ),
                }))
                .mockImplementationOnce(() => ({
                    select: vi.fn(() =>
                        createQueryBuilder({
                            data: null,
                            error: null,
                        })
                    ),
                }))
                .mockImplementationOnce(() => ({
                    select: vi.fn(() =>
                        createQueryBuilder({
                            data: {
                                setting_value: 149,
                            },
                            error: null,
                        })
                    ),
                })),
        };

        const razorpay = {
            orders: {
                create: vi.fn().mockResolvedValue({
                    id: "order_123",
                    amount: 309900,
                    currency: "INR",
                }),
            },
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
        vi.mocked(getRazorpayServerClient).mockReturnValue(razorpay as any);

        const request = new NextRequest("http://localhost/api/bookings/checkout", {
            method: "POST",
            body: JSON.stringify({
                holdId: "11111111-1111-4111-8111-111111111111",
                workshopId: "workshop-1",
                firstName: "Chait",
                lastName: "Tester",
                email: "chait@example.com",
                phone: "9876543210",
                notes: "Window seat if possible",
            }),
        });

        const response = await POST(request);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toEqual({
            mode: "order_created",
            order: {
                id: "order_123",
                amount: 309900,
                currency: "INR",
                keyId: "rzp_test_123",
                name: "Only Workshops",
                description: "Intro to Wheel Throwing",
                prefill: {
                    name: "Chait Tester",
                    email: "chait@example.com",
                    contact: "9876543210",
                },
            },
            hold: {
                id: "11111111-1111-4111-8111-111111111111",
                guests: 2,
                expiresAt: "2099-05-10T12:15:00.000Z",
            },
        });
        expect(razorpay.orders.create).toHaveBeenCalledWith({
            amount: 309900,
            currency: "INR",
            receipt: "11111111-1111-4111-8111-111111111111",
            notes: {
                holdId: "11111111-1111-4111-8111-111111111111",
                workshopId: "workshop-1",
                userId: "user-1",
            },
        });
    });
});
