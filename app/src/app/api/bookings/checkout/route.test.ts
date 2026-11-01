import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { requireSupabaseService } from "@/lib/api-helpers";
import { assertRateLimit } from "@/lib/rate-limit";
import { ensureWorkshopSeededFromMock } from "@/lib/workshop-utils";
import { getRazorpayServerClient } from "@/lib/razorpay-server";
import { isBookingClosedNow } from "@/lib/booking-time";
import { sendPaymentNotification } from "@/lib/payment-notifications";

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
    // These fixtures carry no early-bird configuration, so the discount is zero. The helper
    // itself is covered by its own unit tests.
    computeEarlyBirdDiscount: vi.fn(() => 0),
}));

vi.mock("@/lib/payment-notifications", () => ({
    sendPaymentNotification: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
    captureException: vi.fn(),
    captureMessage: vi.fn(),
    setTag: vi.fn(),
}));

vi.mock("@/lib/razorpay-server", () => ({
    getRazorpayKeyId: vi.fn(() => "rzp_test_123"),
    getRazorpayServerClient: vi.fn(),
    isRazorpayConfigured: true,
    verifyRazorpayOrderSignature: vi.fn(() => true),
    RAZORPAY_TIMEOUT_MS: 8000,
    // Pass-through: the timeout guard is transport concern, not checkout logic.
    withRazorpayTimeout: vi.fn(<T>(operation: () => Promise<T>) => operation()),
}));

// The offer and "Bookings closed" reads (offers-server.ts, workshop-availability-server.ts) run
// for real against each test's service client. These stubs only keep those modules from
// building a real Supabase client or a Next.js cache.
vi.mock("next/cache", () => ({
    unstable_cache: (fn: unknown) => fn,
    revalidatePath: vi.fn(),
    revalidateTag: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({
    isSupabaseServiceConfigured: false,
    createSupabaseServiceClient: () => {
        throw new Error("No real Supabase client in tests.");
    },
}));

vi.mock("@/lib/cached-reads", () => ({
    OFFERS_TAG: "public-offers",
    PLATFORM_SETTINGS_TAG: "platform-settings",
    getCachedPlatformSettings: vi.fn(async () => ({})),
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

/**
 * A table that honours `eq` / `in` filters over `rows`: `maybeSingle` / `single` answer the first
 * match, awaiting the chain answers every match, and `error` fails every read. For
 * platform_settings, `failingKeys` fails only the read of those setting keys and `hangingKeys`
 * never answers it (a database too slow to matter).
 */
function tableChain(
    rows: Array<Record<string, unknown>>,
    error: unknown = null,
    keyed: { failingKeys?: string[]; hangingKeys?: string[] } = {}
) {
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    let settingKey = "";
    const matches = () => rows.filter((row) => filters.every((keep) => keep(row)));
    const failure = () =>
        error ?? (keyed.failingKeys?.includes(settingKey) ? { message: "boom" } : null);
    const hangs = () => Boolean(keyed.hangingKeys?.includes(settingKey));
    const chain: Record<string, unknown> = {
        select: vi.fn(() => chain),
        eq: vi.fn((column: string, value: unknown) => {
            if (column === "setting_key") settingKey = String(value);
            filters.push((row) => row[column] === value);
            return chain;
        }),
        in: vi.fn((column: string, values: unknown[]) => {
            filters.push((row) => values.includes(row[column]));
            return chain;
        }),
        maybeSingle: vi.fn(async () => {
            if (hangs()) return new Promise(() => {});
            const failed = failure();
            return failed
                ? { data: null, error: failed }
                : { data: matches()[0] ?? null, error: null };
        }),
        single: vi.fn(async () => {
            if (hangs()) return new Promise(() => {});
            const failed = failure();
            if (failed) return { data: null, error: failed };
            const row = matches()[0];
            return row ? { data: row, error: null } : { data: null, error: { code: "PGRST116" } };
        }),
        then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
            const failed = failure();
            return Promise.resolve(
                failed ? { data: null, error: failed } : { data: matches(), error: null }
            ).then(resolve, reject);
        },
    };
    return chain;
}

const AUTO_ID = "44444444-4444-4444-8444-444444444444";
const TYPED_ID = "55555555-5555-4555-8555-555555555555";
const BETTER_ID = "66666666-6666-4666-8666-666666666666";
const GROUP_ID = "77777777-7777-4777-8777-777777777777";

function couponRow(overrides: Record<string, unknown> = {}) {
    return {
        id: AUTO_ID,
        code: "AUTO10",
        discount_type: "percentage",
        discount_value: 10,
        is_active: true,
        valid_from: null,
        valid_until: null,
        max_uses: null,
        used_count: 0,
        min_order_amount: null,
        applicable_workshop_ids: null,
        applicable_categories: null,
        ...overrides,
    };
}

function setting(key: string, value: unknown) {
    return { setting_key: key, setting_value: value };
}

function minutesFromNow(minutes: number) {
    return new Date(Date.now() + minutes * 60 * 1000).toISOString();
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
        const holdBuilder = createQueryBuilder({
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
        });
        // No service fee row, no offer settings, nothing closed: today's behaviour.
        const serviceClient = {
            from: vi.fn((table: string) => {
                if (table === "booking_holds") return { select: vi.fn(() => holdBuilder) };
                if (table === "platform_settings" || table === "coupons") return tableChain([]);
                throw new Error(`Unexpected table ${table}`);
            }),
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
            quote: {
                listSubtotal: 3000,
                earlyBirdDiscount: 0,
                couponDiscount: 0,
                couponId: null,
                couponLabel: null,
                subtotal: 3000,
                serviceFee: 99,
                total: 3099,
                savings: 0,
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
                // Snapshot of the quote the amount was built from; honoured at confirmation.
                serviceFee: "99",
                listSubtotal: "3000",
                earlyBirdDiscount: "0",
                couponDiscount: "0",
                subtotal: "3000",
                total: "3099",
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
                code: "SAVE10",
                is_active: true,
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
            p_early_bird_discount: 0,
        });
        expect(serviceClient.rpc).not.toHaveBeenCalledWith(
            "increment_coupon_usage",
            expect.anything()
        );
    });

    it("refunds the captured payment when the atomic confirmation RPC fails", async () => {
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
                code: "SAVE10",
                is_active: true,
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
                refund: vi.fn().mockResolvedValue({ id: "rfnd_1", status: "processed" }),
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

        // The payment was captured before confirmation, so a failed confirmation must
        // give the money back rather than leaving the customer charged for nothing.
        expect(response.status).toBe(409);
        expect(body.error).toContain("refunded");
        expect(razorpay.payments.refund).toHaveBeenCalledWith("pay_123", {
            amount: 189900,
            speed: "normal",
            notes: { reason: "booking_confirmation_failed" },
        });
        expect(bookingsTable.insert).not.toHaveBeenCalled();
        expect(bookingsTable.update).not.toHaveBeenCalled();
        expect(serviceClient.rpc).toHaveBeenCalledTimes(1);

        // The Sentry context behind this response names the user, the hold, the payment and
        // the raw RPC text. None of it belongs in a body any caller can read back.
        expect(body).not.toHaveProperty("userId");
        expect(body).not.toHaveProperty("holdId");
        expect(body).not.toHaveProperty("paymentId");
        expect(body).not.toHaveProperty("couponId");
        expect(body).not.toHaveProperty("details");
        expect(body).not.toHaveProperty("refunded");
    });

    /**
     * confirm_booking_from_hold takes the hold FOR UPDATE, so a double-submitted confirmation
     * -- the UI's own "Retry confirmation" button, a double click, a retried fetch -- has the
     * winner insert the booking and the loser raise HOLD_NOT_ACTIVE. Treating that as "the
     * booking failed, refund it" handed the money back for a booking that exists and is still
     * holding a seat.
     */
    it("returns the existing booking instead of refunding when a concurrent confirm won the race", async () => {
        const holdId = "11111111-1111-4111-8111-111111111111";
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
        const settingsBuilder = createQueryBuilder({ data: { setting_value: 99 }, error: null });
        const confirmedBooking = {
            id: bookingId,
            user_id: "user-1",
            guests: 2,
            total: 2099,
            status: "confirmed",
            payment_intent_id: "pay_123",
            first_name: "Chait",
            last_name: "Tester",
            email: "chait@example.com",
            phone: "9876543210",
            created_at: "2099-05-10T12:15:00.000Z",
            workshop: null,
        };

        // The winner's row is invisible on the first lookup (it had not committed yet) and
        // visible on the re-check after the RPC raises -- exactly the real ordering, because
        // the hold's row lock is only released at the winner's commit.
        let idLookups = 0;
        const bookingsTable = {
            select: vi.fn((fields?: string) => {
                if (String(fields || "").trim() === "id") {
                    idLookups += 1;
                    return createQueryBuilder({
                        data: idLookups === 1 ? null : { id: bookingId },
                        error: null,
                    });
                }
                return createQueryBuilder({ data: confirmedBooking, error: null });
            }),
            insert: vi.fn(),
            update: vi.fn(),
        };

        const serviceClient = {
            from: vi.fn((table: string) => {
                if (table === "booking_holds") return { select: vi.fn(() => holdBuilder) };
                if (table === "platform_settings") return { select: vi.fn(() => settingsBuilder) };
                if (table === "bookings") return bookingsTable;
                throw new Error(`Unexpected table ${table}`);
            }),
            rpc: vi.fn(() =>
                Promise.resolve({
                    data: null,
                    error: { message: 'raise exception "HOLD_NOT_ACTIVE"' },
                })
            ),
        };

        const razorpay = {
            orders: {
                fetch: vi.fn().mockResolvedValue({
                    id: "order_123",
                    amount: 209900,
                    currency: "INR",
                    receipt: holdId,
                }),
            },
            payments: {
                fetch: vi.fn().mockResolvedValue({
                    id: "pay_123",
                    order_id: "order_123",
                    amount: 209900,
                    currency: "INR",
                    status: "captured",
                }),
                refund: vi.fn(),
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
                    razorpayOrderId: "order_123",
                    razorpayPaymentId: "pay_123",
                    razorpaySignature: "sig",
                }),
            })
        );
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.mode).toBe("already_confirmed");
        expect(body.booking.id).toBe(bookingId);
        // The decisive assertion: the winner's booking keeps its money.
        expect(razorpay.payments.refund).not.toHaveBeenCalled();
    });

    /**
     * withRazorpayTimeout bounds the await but cannot abort the in-flight request, so a
     * capture that "timed out" may well have succeeded. Returning "Checkout failed." without
     * asking Razorpay left the customer charged with no booking and no refund.
     */
    it("refunds a capture that succeeded after the confirmation path threw", async () => {
        const holdId = "11111111-1111-4111-8111-111111111111";

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
        const settingsBuilder = createQueryBuilder({ data: { setting_value: 99 }, error: null });

        const serviceClient = {
            from: vi.fn((table: string) => {
                if (table === "booking_holds") return { select: vi.fn(() => holdBuilder) };
                if (table === "platform_settings") return { select: vi.fn(() => settingsBuilder) };
                if (table === "bookings") {
                    return { select: vi.fn(() => createQueryBuilder({ data: null, error: null })) };
                }
                throw new Error(`Unexpected table ${table}`);
            }),
            rpc: vi.fn(() => {
                throw new Error("Razorpay request timed out after 8000ms.");
            }),
        };

        const razorpay = {
            orders: {
                fetch: vi.fn().mockResolvedValue({
                    id: "order_123",
                    amount: 209900,
                    currency: "INR",
                    receipt: holdId,
                }),
            },
            payments: {
                fetch: vi.fn().mockResolvedValue({
                    id: "pay_123",
                    order_id: "order_123",
                    amount: 209900,
                    currency: "INR",
                    status: "captured",
                    amount_refunded: 0,
                }),
                refund: vi.fn().mockResolvedValue({ id: "rfnd_1", status: "processed" }),
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
                    razorpayOrderId: "order_123",
                    razorpayPaymentId: "pay_123",
                    razorpaySignature: "sig",
                }),
            })
        );
        const body = await response.json();

        expect(response.status).toBe(409);
        expect(body.error).toContain("refunded");
        expect(razorpay.payments.refund).toHaveBeenCalledWith("pay_123", {
            amount: 209900,
            speed: "normal",
            notes: { reason: "booking_confirmation_failed" },
        });
    });

    /**
     * Fixture for the confirmation leg: a verified payment against a hold, with every
     * collaborator overridable so each early-return path can be driven on its own.
     */
    const HOLD_ID = "11111111-1111-4111-8111-111111111111";

    function confirmationFixture(
        options: {
            hold?: Record<string, unknown>;
            workshop?: Record<string, unknown>;
            order?: Record<string, unknown>;
            payment?: Record<string, unknown>;
            refund?: ReturnType<typeof vi.fn>;
            serviceFeeSetting?: number;
            anyBookingForPayment?: { id: string; status: string } | null;
            confirmRpc?: { data: unknown; error: unknown };
            /** Rows of `coupons`, read by id (order snapshot) or by typed code (old orders). */
            coupons?: Array<Record<string, unknown>>;
            /** Extra platform_settings rows besides the service fee. */
            settings?: Array<Record<string, unknown>>;
        } = {}
    ) {
        const holdBuilder = createQueryBuilder({
            data: {
                id: HOLD_ID,
                workshop_id: "workshop-1",
                user_id: "user-1",
                guests: 2,
                status: "active",
                expires_at: "2099-05-10T12:15:00.000Z",
                ...options.hold,
                workshop: {
                    id: "workshop-1",
                    title: "Intro to Wheel Throwing",
                    category: "Pottery",
                    price: 1000,
                    seats_remaining: 8,
                    approval_status: "approved",
                    date: "2099-05-10",
                    time: "11:00",
                    ...options.workshop,
                },
            },
            error: null,
        });
        const settingRows = [
            setting("service_fee", options.serviceFeeSetting ?? 99),
            ...(options.settings ?? []),
        ];
        const confirmedBooking = {
            id: "booking-1",
            user_id: "user-1",
            guests: 2,
            total: 2099,
            status: "confirmed",
            payment_intent_id: "pay_123",
            first_name: "Chait",
            last_name: "Tester",
            email: "chait@example.com",
            phone: "9876543210",
            created_at: "2099-05-10T12:15:00.000Z",
            workshop: null,
        };
        const holdUpdate = vi.fn(() => ({ eq: vi.fn() }));

        const serviceClient = {
            from: vi.fn((table: string) => {
                if (table === "booking_holds") {
                    return { select: vi.fn(() => holdBuilder), update: holdUpdate };
                }
                if (table === "platform_settings") return tableChain(settingRows);
                if (table === "coupons") return tableChain(options.coupons ?? []);
                if (table === "bookings") {
                    return {
                        select: vi.fn((fields?: string) => {
                            const normalized = String(fields || "").trim();
                            if (normalized === "id") {
                                return createQueryBuilder({ data: null, error: null });
                            }
                            if (normalized === "id, status") {
                                return createQueryBuilder({
                                    data: options.anyBookingForPayment ?? null,
                                    error: null,
                                });
                            }
                            return createQueryBuilder({ data: confirmedBooking, error: null });
                        }),
                        insert: vi.fn(),
                        update: vi.fn(),
                    };
                }
                throw new Error(`Unexpected table ${table}`);
            }),
            rpc: vi.fn(() =>
                Promise.resolve(options.confirmRpc ?? { data: "booking-1", error: null })
            ),
        };

        const refund = options.refund ?? vi.fn().mockResolvedValue({ id: "rfnd_1" });
        const razorpay = {
            orders: {
                fetch: vi.fn().mockResolvedValue({
                    id: "order_123",
                    amount: 209900,
                    currency: "INR",
                    receipt: HOLD_ID,
                    ...options.order,
                }),
            },
            payments: {
                fetch: vi.fn().mockResolvedValue({
                    id: "pay_123",
                    order_id: "order_123",
                    amount: 209900,
                    currency: "INR",
                    status: "captured",
                    amount_refunded: 0,
                    ...options.payment,
                }),
                refund,
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
        vi.mocked(isBookingClosedNow).mockReturnValue(false);

        return { serviceClient, razorpay, refund, holdUpdate };
    }

    function confirmationRequest(extra: Record<string, unknown> = {}) {
        return new NextRequest("http://localhost/api/bookings/checkout", {
            method: "POST",
            body: JSON.stringify({
                holdId: HOLD_ID,
                workshopId: "workshop-1",
                firstName: "Chait",
                lastName: "Tester",
                email: "chait@example.com",
                phone: "9876543210",
                razorpayOrderId: "order_123",
                razorpayPaymentId: "pay_123",
                razorpaySignature: "sig",
                ...extra,
            }),
        });
    }

    const REFUND_ARGS = [
        "pay_123",
        { amount: 209900, speed: "normal", notes: { reason: "booking_confirmation_failed" } },
    ] as const;

    /**
     * Every early return below sits AFTER the signature check, i.e. after the customer has
     * paid. Each used to answer with a bare 4xx and leave the card charged with no booking.
     */
    it.each([
        {
            name: "the hold is active but already past its expiry",
            options: { hold: { expires_at: "2000-01-01T00:00:00.000Z" } },
            code: "HOLD_EXPIRED_REFUNDED",
        },
        {
            name: "the workshop is no longer approved",
            options: { workshop: { approval_status: "pending" } },
            code: "WORKSHOP_PENDING_APPROVAL_REFUNDED",
        },
        {
            name: "the order amount no longer matches the price",
            options: { order: { amount: 123400 } },
            code: "ORDER_AMOUNT_MISMATCH_REFUNDED",
        },
        {
            name: "the captured payment amount does not match the price",
            options: { payment: { amount: 123400 } },
            code: "PAYMENT_AMOUNT_MISMATCH_REFUNDED",
        },
        {
            name: "the order belongs to a different hold",
            options: { order: { receipt: "another-hold" } },
            code: "ORDER_HOLD_MISMATCH_REFUNDED",
        },
    ])("refunds a verified payment when $name", async ({ options, code }) => {
        const { refund } = confirmationFixture(options as never);

        const response = await POST(confirmationRequest());
        const body = await response.json();

        expect(response.status).toBe(409);
        expect(body.code).toBe(code);
        expect(body.error).toContain("refunded");
        expect(refund).toHaveBeenCalledTimes(1);
        expect(refund.mock.calls[0][0]).toBe("pay_123");
    });

    it("refunds the captured remainder when bookings closed after payment", async () => {
        const { refund, serviceClient } = confirmationFixture();
        vi.mocked(isBookingClosedNow).mockReturnValue(true);

        const response = await POST(confirmationRequest());
        const body = await response.json();

        expect(response.status).toBe(409);
        expect(body.code).toBe("BOOKING_CLOSED_REFUNDED");
        expect(refund).toHaveBeenCalledWith(...REFUND_ARGS);
        expect(serviceClient.rpc).not.toHaveBeenCalled();
    });

    it("does not refund when Razorpay reports nothing was captured", async () => {
        const { refund } = confirmationFixture({
            hold: { expires_at: "2000-01-01T00:00:00.000Z" },
            payment: { status: "created" },
        });

        const response = await POST(confirmationRequest());
        const body = await response.json();

        // No money moved, so the plain error stands and there is nothing to give back.
        expect(response.status).toBe(409);
        expect(body.error).toBe("Seat hold expired. Please reserve seats again.");
        expect(refund).not.toHaveBeenCalled();
    });

    it("tells the customer to contact support when the compensating refund itself fails", async () => {
        const { refund } = confirmationFixture({
            hold: { expires_at: "2000-01-01T00:00:00.000Z" },
            refund: vi.fn().mockRejectedValue(new Error("razorpay refused")),
        });

        const response = await POST(confirmationRequest());
        const body = await response.json();

        expect(refund).toHaveBeenCalledTimes(1);
        expect(response.status).toBe(500);
        expect(body.code).toBe("REFUND_FAILED");
        expect(body.error).toMatch(/contact support/i);
    });

    /**
     * A caller replaying a valid order/payment/signature triple against another hold of
     * their own must not get the money back for a booking that exists.
     */
    it("never refunds a payment that already bought a booking under a different hold", async () => {
        const { refund } = confirmationFixture({
            hold: { status: "released" },
            anyBookingForPayment: { id: "booking-9", status: "confirmed" },
        });

        const response = await POST(confirmationRequest());
        const body = await response.json();

        expect(response.status).toBe(409);
        expect(body.code).toBe("HOLD_NOT_ACTIVE");
        expect(refund).not.toHaveBeenCalled();
    });

    /**
     * The fee is snapshotted into the order notes, so an admin changing the service fee
     * between order creation and payment no longer strands a correctly priced payment.
     */
    it("honours the service fee quoted on the order when the live fee has changed", async () => {
        const { refund, serviceClient } = confirmationFixture({
            serviceFeeSetting: 149,
            order: { notes: { serviceFee: "99" } },
        });

        const response = await POST(confirmationRequest());
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.mode).toBe("confirmed");
        expect(refund).not.toHaveBeenCalled();
        expect(serviceClient.rpc).toHaveBeenCalledWith(
            "confirm_booking_from_hold",
            expect.objectContaining({ p_service_fee: 99, p_subtotal: 2000, p_total: 2099 })
        );
    });

    it("refunds an in-flight order with no fee snapshot when the live fee has changed", async () => {
        const { refund } = confirmationFixture({ serviceFeeSetting: 149 });

        const response = await POST(confirmationRequest());
        const body = await response.json();

        expect(response.status).toBe(409);
        expect(body.code).toBe("ORDER_AMOUNT_MISMATCH_REFUNDED");
        expect(refund).toHaveBeenCalledTimes(1);
    });

    it("ignores a malformed fee snapshot instead of trusting it", async () => {
        const { refund } = confirmationFixture({
            serviceFeeSetting: 149,
            order: { notes: { serviceFee: "-5" } },
        });

        const response = await POST(confirmationRequest());

        expect(response.status).toBe(409);
        expect(refund).toHaveBeenCalledTimes(1);
    });

    it("explains an un-approved workshop when confirmation raises WORKSHOP_NOT_APPROVED", async () => {
        const { refund } = confirmationFixture({
            confirmRpc: { data: null, error: { message: "WORKSHOP_NOT_APPROVED" } },
        });

        const response = await POST(confirmationRequest());
        const body = await response.json();

        expect(response.status).toBe(409);
        expect(body.code).toBe("WORKSHOP_PENDING_APPROVAL");
        expect(body.error).toContain("refunded");
        expect(refund).toHaveBeenCalledWith(...REFUND_ARGS);
    });

    /**
     * The notification runs after the booking exists. A claim failure there used to escape
     * to the route's catch and answer "Checkout failed." to a customer who was booked.
     */
    it("still confirms the booking when the notification step throws", async () => {
        const { refund } = confirmationFixture();
        vi.mocked(sendPaymentNotification).mockRejectedValue(new Error("idempotency store down"));

        const response = await POST(confirmationRequest());
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.mode).toBe("confirmed");
        expect(refund).not.toHaveBeenCalled();
    });

    /**
     * Order creation: a hold of `guests` seats on a ₹1000 workshop, a ₹99 service fee, and
     * whatever offer settings, closed list and coupons a test supplies.
     */
    function orderFixture(
        options: {
            guests?: number;
            settings?: Array<Record<string, unknown>>;
            settingsError?: unknown;
            /** platform_settings keys whose read fails (every other key reads fine). */
            failingSettingKeys?: string[];
            /** platform_settings keys whose read never answers. */
            hangingSettingKeys?: string[];
            coupons?: Array<Record<string, unknown>>;
            couponsError?: unknown;
            /** Columns merged into the held workshop's row (for example Early Bird settings). */
            workshop?: Record<string, unknown>;
        } = {}
    ) {
        const holdBuilder = createQueryBuilder({
            data: {
                id: HOLD_ID,
                workshop_id: "workshop-1",
                user_id: "user-1",
                guests: options.guests ?? 2,
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
                    ...options.workshop,
                },
            },
            error: null,
        });
        const settingRows = [setting("service_fee", 99), ...(options.settings ?? [])];

        const serviceClient = {
            from: vi.fn((table: string) => {
                if (table === "booking_holds") return { select: vi.fn(() => holdBuilder) };
                if (table === "platform_settings") {
                    return tableChain(settingRows, options.settingsError ?? null, {
                        failingKeys: options.failingSettingKeys,
                        hangingKeys: options.hangingSettingKeys,
                    });
                }
                if (table === "coupons") {
                    return tableChain(options.coupons ?? [], options.couponsError ?? null);
                }
                throw new Error(`Unexpected table ${table}`);
            }),
            rpc: vi.fn(),
        };
        const razorpay = {
            orders: {
                create: vi.fn(async (args: { amount: number }) => ({
                    id: "order_new",
                    amount: args.amount,
                    currency: "INR",
                })),
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
        vi.mocked(getRazorpayServerClient).mockReturnValue(razorpay as any);
        vi.mocked(isBookingClosedNow).mockReturnValue(false);

        return { serviceClient, razorpay };
    }

    function orderRequest(extra: Record<string, unknown> = {}) {
        return new NextRequest("http://localhost/api/bookings/checkout", {
            method: "POST",
            body: JSON.stringify({
                holdId: HOLD_ID,
                workshopId: "workshop-1",
                firstName: "Chait",
                lastName: "Tester",
                email: "chait@example.com",
                phone: "9876543210",
                ...extra,
            }),
        });
    }

    function offersSetting(entries: Record<string, Record<string, unknown>>) {
        return setting("coupon_offers", entries);
    }

    it("applies an automatic offer without a code and snapshots it in the order notes", async () => {
        const { razorpay } = orderFixture({
            settings: [offersSetting({ [AUTO_ID]: { visibility: "auto" } })],
            coupons: [couponRow()],
        });

        const response = await POST(orderRequest());
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.quote).toMatchObject({
            listSubtotal: 2000,
            couponDiscount: 200,
            couponId: AUTO_ID,
            subtotal: 1800,
            total: 1899,
            savings: 200,
        });
        // The automatic offer's label, never its code.
        expect(typeof body.quote.couponLabel).toBe("string");
        expect(JSON.stringify(body)).not.toContain("AUTO10");

        const notes = razorpay.orders.create.mock.calls[0][0].notes;
        expect(razorpay.orders.create.mock.calls[0][0].amount).toBe(189900);
        expect(notes).toMatchObject({
            couponId: AUTO_ID,
            couponDiscount: "200",
            listSubtotal: "2000",
            total: "1899",
            serviceFee: "99",
        });
        // Razorpay allows 15 keys of at most 256 characters.
        expect(Object.keys(notes).length).toBeLessThanOrEqual(15);
        for (const value of Object.values(notes)) {
            expect(String(value).length).toBeLessThanOrEqual(256);
        }
    });

    it("prefers a typed code that saves more than the automatic offer", async () => {
        const { razorpay } = orderFixture({
            settings: [offersSetting({ [AUTO_ID]: { visibility: "auto" } })],
            coupons: [
                couponRow(),
                couponRow({ id: TYPED_ID, code: "SECRET15", discount_value: 15 }),
            ],
        });

        const response = await POST(orderRequest({ couponCode: "secret15" }));
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.quote).toMatchObject({ couponId: TYPED_ID, couponDiscount: 300, total: 1799 });
        // A hidden code is shown as the code the customer typed.
        expect(body.quote.couponLabel).toBe("SECRET15");
        expect(razorpay.orders.create.mock.calls[0][0].notes.couponId).toBe(TYPED_ID);
    });

    it("keeps the automatic offer when a valid typed code saves less", async () => {
        orderFixture({
            settings: [offersSetting({ [AUTO_ID]: { visibility: "auto" } })],
            coupons: [couponRow(), couponRow({ id: TYPED_ID, code: "SMALL5", discount_value: 5 })],
        });

        const response = await POST(orderRequest({ couponCode: "SMALL5" }));
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.quote).toMatchObject({ couponId: AUTO_ID, couponDiscount: 200 });
    });

    it("refuses an unknown typed code with COUPON_NO_LONGER_VALID instead of charging full price", async () => {
        const { razorpay } = orderFixture();

        const response = await POST(orderRequest({ couponCode: "NOPE" }));
        const body = await response.json();

        expect(response.status).toBe(409);
        expect(body.code).toBe("COUPON_NO_LONGER_VALID");
        expect(body.message).toMatch(/not valid/i);
        expect(razorpay.orders.create).not.toHaveBeenCalled();
    });

    it("names an ended advertised offer when its typed code is refused", async () => {
        const { razorpay } = orderFixture({
            settings: [offersSetting({ [TYPED_ID]: { visibility: "listed" } })],
            // valid_until is 10 minutes away: past the advertised end (30 minutes earlier).
            coupons: [
                couponRow({ id: TYPED_ID, code: "LISTED10", valid_until: minutesFromNow(10) }),
            ],
        });

        const response = await POST(orderRequest({ couponCode: "LISTED10" }));
        const body = await response.json();

        expect(response.status).toBe(409);
        expect(body.code).toBe("COUPON_NO_LONGER_VALID");
        expect(body.message).toMatch(/ended/i);
        expect(razorpay.orders.create).not.toHaveBeenCalled();
    });

    it("keeps a hidden typed code valid until valid_until itself", async () => {
        orderFixture({
            coupons: [
                couponRow({ id: TYPED_ID, code: "HIDDEN10", valid_until: minutesFromNow(10) }),
            ],
        });

        const response = await POST(orderRequest({ couponCode: "HIDDEN10" }));
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.quote).toMatchObject({ couponId: TYPED_ID, couponDiscount: 200 });
    });

    it("stops auto-applying an offer at its advertised end, before valid_until", async () => {
        orderFixture({
            settings: [offersSetting({ [AUTO_ID]: { visibility: "auto" } })],
            coupons: [couponRow({ valid_until: minutesFromNow(10) })],
        });

        const response = await POST(orderRequest());
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.quote).toMatchObject({ couponId: null, couponDiscount: 0, total: 2099 });
    });

    it("checks a group offer's seat minimum against the hold's seats", async () => {
        const groupSettings = [
            offersSetting({ [GROUP_ID]: { visibility: "auto", min_guests: 3 } }),
        ];
        const groupCoupon = couponRow({ id: GROUP_ID, code: "GROUP3" });

        orderFixture({ guests: 2, settings: groupSettings, coupons: [groupCoupon] });
        const tooFew = await (await POST(orderRequest())).json();
        expect(tooFew.quote).toMatchObject({ couponId: null, couponDiscount: 0 });

        orderFixture({ guests: 3, settings: groupSettings, coupons: [groupCoupon] });
        const enough = await (await POST(orderRequest())).json();
        expect(enough.quote).toMatchObject({ couponId: GROUP_ID, couponDiscount: 300 });
    });

    it("tells a customer who typed a group code how many seats it needs", async () => {
        const { razorpay } = orderFixture({
            guests: 2,
            settings: [offersSetting({ [GROUP_ID]: { visibility: "community", min_guests: 3 } })],
            coupons: [couponRow({ id: GROUP_ID, code: "GROUP3" })],
        });

        const response = await POST(orderRequest({ couponCode: "GROUP3" }));
        const body = await response.json();

        expect(response.status).toBe(409);
        expect(body.code).toBe("COUPON_NO_LONGER_VALID");
        expect(body.message).toContain("3 or more seats");
        expect(razorpay.orders.create).not.toHaveBeenCalled();
    });

    it("refuses a new order with BOOKINGS_CLOSED when the admin closed the workshop", async () => {
        const { razorpay } = orderFixture({
            settings: [setting("closed_workshop_ids", ["workshop-1"])],
        });

        const response = await POST(orderRequest());
        const body = await response.json();

        expect(response.status).toBe(409);
        expect(body.code).toBe("BOOKINGS_CLOSED");
        expect(body.message).toBe("Bookings for this workshop are closed.");
        expect(razorpay.orders.create).not.toHaveBeenCalled();
    });

    it("treats malformed settings as no offers and nothing closed", async () => {
        const { razorpay } = orderFixture({
            settings: [
                setting("coupon_offers", "{not json"),
                setting("closed_workshop_ids", "workshop-1"),
            ],
            coupons: [couponRow()],
        });

        const response = await POST(orderRequest());
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.quote).toMatchObject({ couponId: null, total: 2099 });
        expect(razorpay.orders.create).toHaveBeenCalledTimes(1);
    });

    it("prices at the plain price when no offers are configured at all", async () => {
        // A missing setting is an answer ("no offers"), not a failed read.
        const { razorpay } = orderFixture({ coupons: [couponRow()] });

        const response = await POST(orderRequest());
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.quote).toMatchObject({ couponId: null, subtotal: 2000, total: 2099 });
        expect(razorpay.orders.create).toHaveBeenCalledTimes(1);
    });

    it("still takes the order when only the closed list cannot be read", async () => {
        // A failed read of the Bookings-closed list counts as nothing closed, as at hold creation.
        const { razorpay } = orderFixture({
            settings: [offersSetting({ [AUTO_ID]: { visibility: "auto" } })],
            coupons: [couponRow()],
            failingSettingKeys: ["closed_workshop_ids"],
        });

        const response = await POST(orderRequest());
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.quote).toMatchObject({ couponId: AUTO_ID, total: 1899 });
        expect(razorpay.orders.create).toHaveBeenCalledTimes(1);
    });

    /**
     * A failed (or too slow) read of what the price is built from must not become a different
     * price: before, the order silently went through at the plain price, so a customer shown an
     * automatic offer paid more than they agreed to.
     */
    describe("when a price input cannot be read", () => {
        const autoOffer = () => [offersSetting({ [AUTO_ID]: { visibility: "auto" } })];

        /** A retryable 503 the booking page turns into "try again", with nothing ordered. */
        async function expectPriceCheckRefused(
            response: Response,
            razorpay: { orders: { create: unknown } }
        ) {
            const body = await response.json();

            expect(response.status).toBe(503);
            expect(body.code).toBe("PRICE_CHECK_FAILED");
            expect(body.details).toEqual({ code: "PRICE_CHECK_FAILED" });
            expect(body.message).toMatch(/try again/i);
            // The database's own words never reach the browser.
            expect(JSON.stringify(body)).not.toContain("boom");
            expect(razorpay.orders.create).not.toHaveBeenCalled();
        }

        it("refuses the order when the offers setting cannot be read", async () => {
            const { razorpay } = orderFixture({
                settings: autoOffer(),
                coupons: [couponRow()],
                failingSettingKeys: ["coupon_offers"],
            });

            await expectPriceCheckRefused(await POST(orderRequest()), razorpay);
        });

        it("refuses the order when the offer coupons cannot be read", async () => {
            const { razorpay } = orderFixture({
                settings: autoOffer(),
                coupons: [couponRow()],
                couponsError: { message: "boom" },
            });

            await expectPriceCheckRefused(await POST(orderRequest()), razorpay);
        });

        it("still prices the order when the coupons read fails but no automatic offer exists", async () => {
            // The offers setting WAS read and lists only a listed offer: nothing can apply
            // without a typed code, so there is no price the page could have shown that the
            // order skips.
            const { razorpay } = orderFixture({
                settings: [offersSetting({ [TYPED_ID]: { visibility: "listed" } })],
                coupons: [couponRow({ id: TYPED_ID, code: "LISTED10" })],
                couponsError: { message: "boom" },
            });

            const response = await POST(orderRequest());
            const body = await response.json();

            expect(response.status).toBe(200);
            expect(body.quote).toMatchObject({
                couponId: null,
                couponDiscount: 0,
                subtotal: 2000,
                total: 2099,
            });
            expect(razorpay.orders.create).toHaveBeenCalledTimes(1);
            expect(razorpay.orders.create.mock.calls[0][0].amount).toBe(209900);
        });

        it("still applies Early Bird when the coupons read fails and no automatic offer exists", async () => {
            // Early Bird comes from the workshop row, not from the offers read.
            const { razorpay } = orderFixture({
                settings: [offersSetting({ [TYPED_ID]: { visibility: "community" } })],
                coupons: [couponRow({ id: TYPED_ID, code: "WHATSAPP10" })],
                couponsError: { message: "boom" },
                workshop: {
                    created_at: new Date().toISOString(),
                    early_bird_enabled: true,
                    early_bird_discount_type: "percentage",
                    early_bird_discount_value: 10,
                    early_bird_days_after_listing: 7,
                },
            });

            const response = await POST(orderRequest());
            const body = await response.json();

            expect(response.status).toBe(200);
            expect(body.quote).toMatchObject({
                listSubtotal: 2000,
                earlyBirdDiscount: 200,
                couponId: null,
                subtotal: 1800,
                total: 1899,
            });
            expect(razorpay.orders.create.mock.calls[0][0].amount).toBe(189900);
        });

        it("still refuses a typed code it cannot read, even without automatic offers", async () => {
            const { razorpay } = orderFixture({
                settings: [offersSetting({ [TYPED_ID]: { visibility: "listed" } })],
                coupons: [couponRow({ id: TYPED_ID, code: "LISTED10" })],
                couponsError: { message: "boom" },
            });

            const response = await POST(orderRequest({ couponCode: "LISTED10" }));
            const body = await response.json();

            expect(response.status).toBe(503);
            expect(body.code).toBe("COUPON_CHECK_FAILED");
            expect(JSON.stringify(body)).not.toContain("boom");
            expect(razorpay.orders.create).not.toHaveBeenCalled();
        });

        it("refuses the order when no setting can be read at all", async () => {
            const { razorpay } = orderFixture({
                settings: autoOffer(),
                coupons: [couponRow()],
                settingsError: { message: "boom" },
            });

            await expectPriceCheckRefused(await POST(orderRequest()), razorpay);
        });

        it("does not price a typed offer code as a hidden code without the offers", async () => {
            // Without the offers setting a listed code would lose its seat minimum and its
            // advertised end, and price differently from the booking page.
            const { razorpay } = orderFixture({
                settings: [offersSetting({ [TYPED_ID]: { visibility: "listed" } })],
                coupons: [couponRow({ id: TYPED_ID, code: "LISTED10" })],
                failingSettingKeys: ["coupon_offers"],
            });

            await expectPriceCheckRefused(
                await POST(orderRequest({ couponCode: "LISTED10" })),
                razorpay
            );
        });

        it("refuses the order when the service fee cannot be read, instead of charging the default", async () => {
            const { razorpay } = orderFixture({ failingSettingKeys: ["service_fee"] });

            await expectPriceCheckRefused(await POST(orderRequest()), razorpay);
            expect(Sentry.captureException).toHaveBeenCalledWith(
                expect.objectContaining({ message: "boom" }),
                expect.objectContaining({
                    tags: expect.objectContaining({ action: "service_fee_read" }),
                })
            );
        });

        it("refuses the order when the offers read outlives its deadline", async () => {
            // Only the timers are faked: the request body is still read for real.
            vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
            try {
                const { razorpay } = orderFixture({
                    settings: autoOffer(),
                    coupons: [couponRow()],
                    hangingSettingKeys: ["coupon_offers"],
                });

                let settled = false;
                const pending = POST(orderRequest()).finally(() => {
                    settled = true;
                });
                for (let step = 0; step < 40 && !settled; step += 1) {
                    await vi.advanceTimersByTimeAsync(500);
                }

                expect(settled).toBe(true);
                await expectPriceCheckRefused(await pending, razorpay);
                expect(Sentry.captureMessage).toHaveBeenCalledWith(
                    expect.stringContaining("offers read"),
                    expect.objectContaining({
                        tags: expect.objectContaining({ action: "offers_read_deadline" }),
                    })
                );
            } finally {
                vi.useRealTimers();
            }
        });

        it("still tells a customer on a closed workshop that bookings are closed", async () => {
            const { razorpay } = orderFixture({
                settings: [setting("closed_workshop_ids", ["workshop-1"])],
                failingSettingKeys: ["coupon_offers"],
            });

            const response = await POST(orderRequest());
            const body = await response.json();

            expect(response.status).toBe(409);
            expect(body.code).toBe("BOOKINGS_CLOSED");
            expect(razorpay.orders.create).not.toHaveBeenCalled();
        });

        it("keeps the hold: nothing is written when the order is refused", async () => {
            const { serviceClient } = orderFixture({
                settings: autoOffer(),
                coupons: [couponRow()],
                failingSettingKeys: ["coupon_offers"],
            });

            await POST(orderRequest());

            const tables = serviceClient.from.mock.calls.map(([table]) => table);
            expect(tables).not.toContain("bookings");
            expect(serviceClient.rpc).not.toHaveBeenCalled();
        });
    });

    /** Notes as order creation writes them for a ₹1000 x 2 order with a 10% coupon. */
    function couponOrderNotes(couponId: string) {
        return {
            holdId: HOLD_ID,
            workshopId: "workshop-1",
            userId: "user-1",
            serviceFee: "99",
            listSubtotal: "2000",
            earlyBirdDiscount: "0",
            couponDiscount: "200",
            subtotal: "1800",
            total: "1899",
            couponId,
        };
    }

    it("confirms with the automatic offer the order was priced with, even after it ended or a better one appeared", async () => {
        const { serviceClient, refund } = confirmationFixture({
            order: { amount: 189900, notes: couponOrderNotes(AUTO_ID) },
            payment: { amount: 189900 },
            settings: [
                offersSetting({
                    [AUTO_ID]: { visibility: "auto" },
                    [BETTER_ID]: { visibility: "auto" },
                }),
            ],
            coupons: [
                // Past its advertised end, still before valid_until: the RPC's rule.
                couponRow({ valid_until: minutesFromNow(10) }),
                couponRow({ id: BETTER_ID, code: "BETTER20", discount_value: 20 }),
            ],
        });

        const response = await POST(confirmationRequest());
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.mode).toBe("confirmed");
        expect(refund).not.toHaveBeenCalled();
        // The unchanged 16-argument RPC, with the coupon from the order notes.
        expect(serviceClient.rpc).toHaveBeenCalledWith("confirm_booking_from_hold", {
            p_hold_id: HOLD_ID,
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
            p_coupon_id: AUTO_ID,
            p_discount_applied: 200,
            p_early_bird_discount: 0,
        });
    });

    it("does not re-check a group offer's seat minimum at confirmation", async () => {
        const { serviceClient } = confirmationFixture({
            hold: { guests: 2 },
            order: { amount: 189900, notes: couponOrderNotes(GROUP_ID) },
            payment: { amount: 189900 },
            settings: [offersSetting({ [GROUP_ID]: { visibility: "auto", min_guests: 3 } })],
            coupons: [couponRow({ id: GROUP_ID, code: "GROUP3" })],
        });

        const response = await POST(confirmationRequest());

        expect(response.status).toBe(200);
        expect(serviceClient.rpc).toHaveBeenCalledWith(
            "confirm_booking_from_hold",
            expect.objectContaining({ p_coupon_id: GROUP_ID, p_discount_applied: 200 })
        );
    });

    it("ignores a typed code when the order snapshot says it was priced without a coupon", async () => {
        const { serviceClient } = confirmationFixture({
            order: {
                notes: {
                    serviceFee: "99",
                    listSubtotal: "2000",
                    earlyBirdDiscount: "0",
                    couponDiscount: "0",
                    subtotal: "2000",
                    total: "2099",
                },
            },
            coupons: [couponRow({ id: TYPED_ID, code: "SAVE10" })],
        });

        const response = await POST(confirmationRequest({ couponCode: "SAVE10" }));

        expect(response.status).toBe(200);
        expect(serviceClient.rpc).toHaveBeenCalledWith(
            "confirm_booking_from_hold",
            expect.objectContaining({ p_coupon_id: null, p_discount_applied: 0, p_total: 2099 })
        );
    });

    it("falls back to the typed code for an order created before the snapshot", async () => {
        const { serviceClient } = confirmationFixture({
            order: { amount: 189900, notes: { serviceFee: "99" } },
            payment: { amount: 189900 },
            coupons: [couponRow({ id: TYPED_ID, code: "SAVE10" })],
        });

        const response = await POST(confirmationRequest({ couponCode: "save10" }));

        expect(response.status).toBe(200);
        expect(serviceClient.rpc).toHaveBeenCalledWith(
            "confirm_booking_from_hold",
            expect.objectContaining({ p_coupon_id: TYPED_ID, p_total: 1899 })
        );
    });

    it("still confirms an order created before the admin closed bookings", async () => {
        const { serviceClient, refund } = confirmationFixture({
            settings: [setting("closed_workshop_ids", ["workshop-1"])],
        });

        const response = await POST(confirmationRequest());
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.mode).toBe("confirmed");
        expect(refund).not.toHaveBeenCalled();
        expect(serviceClient.rpc).toHaveBeenCalledWith(
            "confirm_booking_from_hold",
            expect.anything()
        );
    });
});
