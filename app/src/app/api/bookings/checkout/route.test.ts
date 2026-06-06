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

vi.mock("@sentry/nextjs", () => ({
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

    it("increments coupon usage through the atomic RPC after confirmed payment", async () => {
        const holdId = "11111111-1111-4111-8111-111111111111";
        const couponId = "33333333-3333-4333-8333-333333333333";
        const bookingId = "booking-1";

        const holdBuilder = createQueryBuilder({
            data: {
                id: holdId,
                workshop_id: "workshop-1",
                user_id: "user-1",
                guests: 2,
                status: "active",
                expires_at: "2099-05-10T12:15:00.000Z",
                workshop: {
                    id: "workshop-1",
                    title: "Intro to Wheel Throwing",
                    category: "Pottery",
                    price: 1000,
                    seats_remaining: 8,
                    approval_status: "approved",
                    date: "2099-05-10",
                    time: "11:00",
                },
            },
            error: null,
        });
        const couponBuilder = createQueryBuilder({
            data: {
                id: couponId,
                discount_type: "percentage",
                discount_value: 10,
                max_uses: 5,
                used_count: 0,
                valid_from: null,
                valid_until: null,
            },
            error: null,
        });
        const settingsBuilder = createQueryBuilder({
            data: { setting_value: 99 },
            error: null,
        });
        const existingBookingBuilder = createQueryBuilder({
            data: null,
            error: null,
        });
        const confirmedBookingBuilder = createQueryBuilder({
            data: {
                id: bookingId,
                user_id: "user-1",
                guests: 2,
                total: 1899,
                status: "confirmed",
                payment_intent_id: "pay_123",
                first_name: "Chait",
                last_name: "Tester",
                email: "chait@example.com",
                phone: "9876543210",
                created_at: "2099-05-10T12:15:00.000Z",
                workshop: null,
            },
            error: null,
        });

        const serviceClient = {
            from: vi.fn((table: string) => {
                if (table === "booking_holds") {
                    return { select: vi.fn(() => holdBuilder) };
                }
                if (table === "coupons") {
                    return { select: vi.fn(() => couponBuilder) };
                }
                if (table === "platform_settings") {
                    return { select: vi.fn(() => settingsBuilder) };
                }
                if (table === "bookings") {
                    return {
                        select: vi.fn((fields?: string) =>
                            String(fields || "").trim() === "id"
                                ? existingBookingBuilder
                                : confirmedBookingBuilder
                        ),
                    };
                }
                throw new Error(`Unexpected table ${table}`);
            }),
            rpc: vi.fn((name: string) => {
                if (name === "confirm_booking_from_hold") {
                    return Promise.resolve({ data: bookingId, error: null });
                }
                throw new Error(`Unexpected rpc ${name}`);
            }),
        };

        const razorpay = {
            orders: {
                fetch: vi.fn().mockResolvedValue({
                    id: "order_123",
                    amount: 189900,
                    currency: "INR",
                    receipt: holdId,
                }),
            },
            payments: {
                fetch: vi.fn().mockResolvedValue({
                    id: "pay_123",
                    order_id: "order_123",
                    amount: 189900,
                    currency: "INR",
                    status: "captured",
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

        const response = await POST(
            new NextRequest("http://localhost/api/bookings/checkout", {
                method: "POST",
                body: JSON.stringify({
                    holdId,
                    workshopId: "workshop-1",
                    firstName: "Chait",
                    lastName: "Tester",
                    email: "chait@example.com",
                    phone: "9876543210",
                    couponCode: "SAVE10",
                    razorpayOrderId: "order_123",
                    razorpayPaymentId: "pay_123",
                    razorpaySignature: "sig",
                }),
            })
        );
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.mode).toBe("confirmed");
        expect(serviceClient.rpc).toHaveBeenCalledWith("confirm_booking_from_hold", {
            p_hold_id: holdId,
            p_user_id: "user-1",
            p_workshop_id: "workshop-1",
            p_payment_provider: "razorpay",
            p_payment_intent_id: "pay_123",
            p_first_name: "Chait",
            p_last_name: "Tester",
            p_email: "chait@example.com",
            p_phone: "9876543210",
            p_notes: "",
            p_service_fee: 99,
            p_subtotal: 1800,
            p_total: 1899,
            p_coupon_id: couponId,
            p_discount_applied: 200,
        });
        expect(serviceClient.rpc).not.toHaveBeenCalledWith("increment_coupon_usage", expect.anything());
    });

    it("does not confirm discounted payments when the atomic RPC fails", async () => {
        const holdId = "11111111-1111-4111-8111-111111111111";
        const couponId = "33333333-3333-4333-8333-333333333333";

        const holdBuilder = createQueryBuilder({
            data: {
                id: holdId,
                workshop_id: "workshop-1",
                user_id: "user-1",
                guests: 2,
                status: "active",
                expires_at: "2099-05-10T12:15:00.000Z",
                workshop: {
                    id: "workshop-1",
                    title: "Intro to Wheel Throwing",
                    category: "Pottery",
                    price: 1000,
                    seats_remaining: 8,
                    approval_status: "approved",
                    date: "2099-05-10",
                    time: "11:00",
                },
            },
            error: null,
        });
        const couponBuilder = createQueryBuilder({
            data: {
                id: couponId,
                discount_type: "percentage",
                discount_value: 10,
                max_uses: 5,
                used_count: 0,
                valid_from: null,
                valid_until: null,
            },
            error: null,
        });
        const settingsBuilder = createQueryBuilder({
            data: { setting_value: 99 },
            error: null,
        });
        const existingBookingBuilder = createQueryBuilder({
            data: null,
            error: null,
        });

        const bookingsTable = {
            select: vi.fn(() => existingBookingBuilder),
            insert: vi.fn(),
            update: vi.fn(),
        };
        const serviceClient = {
            from: vi.fn((table: string) => {
                if (table === "booking_holds") {
                    return { select: vi.fn(() => holdBuilder) };
                }
                if (table === "coupons") {
                    return { select: vi.fn(() => couponBuilder) };
                }
                if (table === "platform_settings") {
                    return { select: vi.fn(() => settingsBuilder) };
                }
                if (table === "bookings") {
                    return bookingsTable;
                }
                throw new Error(`Unexpected table ${table}`);
            }),
            rpc: vi.fn((name: string) => {
                if (name === "confirm_booking_from_hold") {
                    return Promise.resolve({
                        data: null,
                        error: { message: "RPC missing" },
                    });
                }
                throw new Error(`Unexpected rpc ${name}`);
            }),
        };

        const razorpay = {
            orders: {
                fetch: vi.fn().mockResolvedValue({
                    id: "order_123",
                    amount: 189900,
                    currency: "INR",
                    receipt: holdId,
                }),
            },
            payments: {
                fetch: vi.fn().mockResolvedValue({
                    id: "pay_123",
                    order_id: "order_123",
                    amount: 189900,
                    currency: "INR",
                    status: "captured",
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

        const response = await POST(
            new NextRequest("http://localhost/api/bookings/checkout", {
                method: "POST",
                body: JSON.stringify({
                    holdId,
                    workshopId: "workshop-1",
                    firstName: "Chait",
                    lastName: "Tester",
                    email: "chait@example.com",
                    phone: "9876543210",
                    couponCode: "SAVE10",
                    razorpayOrderId: "order_123",
                    razorpayPaymentId: "pay_123",
                    razorpaySignature: "sig",
                }),
            })
        );
        const body = await response.json();

        expect(response.status).toBe(500);
        expect(body.error).toContain("atomic booking confirmation failed");
        expect(body.couponId).toBe(couponId);
        expect(bookingsTable.insert).not.toHaveBeenCalled();
        expect(bookingsTable.update).not.toHaveBeenCalled();
        expect(serviceClient.rpc).toHaveBeenCalledTimes(1);
    });
});
