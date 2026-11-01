import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useBookingWorkflow } from "./useBookingWorkflow";
import * as apiClient from "@/lib/api-client";
import { ApiClientError, type PlatformSettings } from "@/lib/api-client";
import type { Workshop } from "@/lib/data";
import { findConfirmedBooking, findPaymentRecovery, savePaymentRecovery } from "./payment-recovery";
import type { PendingConfirmationPayload, RazorpayOptions } from "./types";

// Mock dependencies
let mockSearchParams = "?workshop=w1&hold=h1&guests=2";
let mockSettings: PlatformSettings = { service_fee: 99 };
const bookingTestWorkshop: Workshop = {
    id: "w1",
    title: "Booking Test Workshop",
    description: "A realistic workshop fixture for checkout workflow tests.",
    category: "Pottery",
    price: 1800,
    location: "Studio One",
    city: "Pune",
    duration: "2 hours",
    date: "2026-04-05",
    time: "11:00",
    maxSeats: 16,
    seatsRemaining: 6,
    coverImage: "/images/og-default.jpg",
    galleryImages: ["/images/og-default.jpg"],
    rating: 0,
    reviewCount: 0,
    hostName: "Workshop Host",
    hostAvatar: "/images/icon.png",
    hostBio: "Experienced workshop host.",
    whatYouLearn: ["Core technique"],
    materialsProvided: ["Materials"],
};

const routerMocks = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: routerMocks.push, refresh: vi.fn(), replace: routerMocks.replace }),
    useSearchParams: () => new URLSearchParams(mockSearchParams),
}));

const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));

vi.mock("@/components/ToastProvider", () => ({ useToast: () => toastMocks }));

const mockUser = {
    id: "user-1",
    email: "test@example.com",
    user_metadata: { full_name: "John Doe" },
};

let mockSession: { access_token: string } | null = { access_token: "mock-token" };

vi.mock("@/lib/auth-context", () => ({
    useAuth: () => ({ user: mockUser, session: mockSession, loading: false }),
}));

// The confirm retries wait 2, 5 and 10 s in production; the tests do not.
vi.mock("./booking-network", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./booking-network")>();
    return { ...actual, sleep: async () => true };
});

vi.mock("@/lib/platform-settings-context", () => ({
    usePlatformSettings: () => ({ settings: mockSettings, loading: false, mergeSettings: vi.fn() }),
}));

vi.mock("@/lib/analytics", () => ({
    trackEvent: vi.fn(),
}));

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return {
        ...actual,
        createBookingHold: vi.fn(),
        createCheckoutOrder: vi.fn(),
        confirmCheckoutPayment: vi.fn(),
        getWorkshopById: vi.fn(),
    };
});

let lastRazorpayOptions: RazorpayOptions | null = null;

type FetchRoutes = {
    offers?: unknown[];
    validate?: (body: Record<string, unknown>) => { status: number; json: unknown };
};

function mockFetch(routes: FetchRoutes = {}) {
    global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.startsWith("/api/offers")) {
            return { ok: true, status: 200, json: async () => ({ offers: routes.offers ?? [] }) };
        }
        if (url.startsWith("/api/coupons/validate") && routes.validate) {
            const body = JSON.parse(String(init?.body || "{}"));
            const answer = routes.validate(body);
            return {
                ok: answer.status < 400,
                status: answer.status,
                json: async () => answer.json,
            };
        }
        return { ok: false, status: 404, json: async () => ({}) };
    }) as unknown as typeof fetch;
}

function fillForm(result: { current: ReturnType<typeof useBookingWorkflow> }) {
    act(() => {
        result.current.handleFormFieldChange("phone", "9876543210");
        result.current.handleFormFieldChange("firstName", "John");
        result.current.handleFormFieldChange("lastName", "Doe");
        result.current.handleFormFieldChange("email", "john@test.com");
    });
}

function orderCreated(total: number, quote?: Partial<apiClient.CheckoutQuote>) {
    return {
        mode: "order_created" as const,
        order: { id: "order_123", keyId: "rzp_test", amount: total * 100, currency: "INR" },
        quote: {
            listSubtotal: 3600,
            earlyBirdDiscount: 0,
            couponDiscount: 0,
            couponId: null,
            couponLabel: null,
            subtotal: 3600,
            serviceFee: 99,
            total: 3699,
            savings: 0,
            ...quote,
        },
    };
}

describe("useBookingWorkflow", () => {
    let originalFetch: typeof global.fetch;
    const settleEffects = async () => {
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
    };
    const waitForReady = async (result: { current: ReturnType<typeof useBookingWorkflow> }) => {
        await settleEffects();
        await waitFor(() => {
            expect(result.current.workshop).toBeTruthy();
            expect(result.current.isRazorpayReady).toBe(true);
        });
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockSearchParams = "?workshop=w1&hold=h1&guests=2";
        mockSettings = { service_fee: 99 };
        mockSession = { access_token: "mock-token" };
        lastRazorpayOptions = null;
        window.localStorage.clear();
        originalFetch = global.fetch;

        // @ts-expect-error test double for the Razorpay constructor
        window.Razorpay = vi.fn(function MockRazorpay(options: RazorpayOptions) {
            lastRazorpayOptions = options;
            return {
                on: vi.fn(),
                open: vi.fn(),
            };
        });

        vi.mocked(apiClient.getWorkshopById).mockResolvedValue({
            workshop: bookingTestWorkshop,
            source: "supabase",
        });
        mockFetch();
    });

    afterEach(() => {
        global.fetch = originalFetch;
        delete window.Razorpay;
    });

    it("initializes with data and prices with the service fee from the settings", async () => {
        const { result } = renderHook(() => useBookingWorkflow());

        expect(result.current.step).toBe(1);
        expect(result.current.guests).toBe(2);
        expect(result.current.holdId).toBe("h1");

        await waitForReady(result);

        expect(result.current.formData.email).toBe("test@example.com");
        expect(result.current.formData.firstName).toBe("John");
        expect(result.current.formData.lastName).toBe("Doe");
        expect(result.current.serviceFee).toBe(99);
        expect(result.current.total).toBe(1800 * 2 + 99);
        // No separate settings request: only the offers read.
        const urls = vi.mocked(global.fetch).mock.calls.map((call) => String(call[0]));
        expect(urls.some((url) => url.includes("/api/settings"))).toBe(false);
    });

    it("shows a placeholder, never a guessed fee, when the setting is missing", async () => {
        mockSettings = {};
        const { result } = renderHook(() => useBookingWorkflow());
        await waitForReady(result);

        expect(result.current.serviceFee).toBeNull();
        expect(result.current.total).toBeNull();
        expect(result.current.priceLines?.subtotal).toBe(3600);
    });

    it("tells a dropped connection apart from a missing workshop", async () => {
        vi.mocked(apiClient.getWorkshopById).mockRejectedValue(new ApiClientError("offline", 0));
        const { result } = renderHook(() => useBookingWorkflow());
        await waitFor(() => expect(result.current.workshopLoading).toBe(false));
        expect(result.current.workshopError).toBe("unavailable");

        vi.mocked(apiClient.getWorkshopById).mockRejectedValue(
            new ApiClientError("Workshop not found", 404)
        );
        act(() => result.current.retryWorkshop());
        await waitFor(() => expect(result.current.workshopError).toBe("not_found"));
    });

    it("validates form fields and prevents checkout if empty", async () => {
        const { result } = renderHook(() => useBookingWorkflow());
        await waitForReady(result);

        act(() => {
            result.current.handleFormFieldChange("phone", "");
            result.current.handleFormFieldChange("firstName", "");
        });
        await settleEffects();

        await act(async () => {
            await result.current.handleCheckout();
        });

        expect(result.current.step).toBe(1);
        expect(result.current.formErrors.firstName).toBeDefined();
        expect(result.current.formErrors.phone).toBeDefined();
        expect(apiClient.createCheckoutOrder).not.toHaveBeenCalled();
    });

    it("opens Razorpay when the server's quote equals the total shown", async () => {
        vi.mocked(apiClient.createCheckoutOrder).mockResolvedValue(orderCreated(3699));

        const { result } = renderHook(() => useBookingWorkflow());
        await waitForReady(result);
        fillForm(result);

        await act(async () => {
            await result.current.handleCheckout();
        });

        expect(apiClient.createCheckoutOrder).toHaveBeenCalledWith(
            "mock-token",
            expect.objectContaining({
                holdId: "h1",
                workshopId: bookingTestWorkshop.id,
                firstName: "John",
                phone: "9876543210",
            })
        );
        expect(result.current.priceChange).toBeNull();
        expect(result.current.step).toBe(2);
        expect(window.Razorpay).toHaveBeenCalledTimes(1);
        expect(lastRazorpayOptions?.amount).toBe(369_900);
    });

    it("shows a changed total and waits for a fresh tap before opening Razorpay", async () => {
        vi.mocked(apiClient.createCheckoutOrder).mockResolvedValue(
            orderCreated(3749, { serviceFee: 149, total: 3749 })
        );

        const { result } = renderHook(() => useBookingWorkflow());
        await waitForReady(result);
        fillForm(result);

        await act(async () => {
            await result.current.handleCheckout();
        });

        expect(window.Razorpay).not.toHaveBeenCalled();
        expect(result.current.step).toBe(1);
        expect(result.current.submitting).toBe(false);
        expect(result.current.priceChange).toMatchObject({ previousTotal: 3699, newTotal: 3749 });
        // The server's quote is now what the summary shows.
        expect(result.current.total).toBe(3749);
        expect(result.current.priceLines?.serviceFee).toBe(149);

        await act(async () => {
            await result.current.handleCheckout();
        });

        expect(apiClient.createCheckoutOrder).toHaveBeenCalledTimes(1);
        expect(window.Razorpay).toHaveBeenCalledTimes(1);
        expect(lastRazorpayOptions?.amount).toBe(374_900);
    });

    it("removes a code the server no longer accepts and lets the customer continue", async () => {
        mockFetch({
            validate: () => ({
                status: 200,
                json: { valid: true, discount: 500, type: "fixed", id: "c1" },
            }),
        });
        vi.mocked(apiClient.createCheckoutOrder).mockRejectedValueOnce(
            new ApiClientError("This coupon has expired.", 409, {
                code: "COUPON_NO_LONGER_VALID",
                message: "This coupon has expired.",
            })
        );

        const { result } = renderHook(() => useBookingWorkflow());
        await waitForReady(result);
        fillForm(result);
        await act(async () => {
            await result.current.handleApplyCoupon("SAVE500");
        });
        expect(result.current.total).toBe(3600 - 500 + 99);

        await act(async () => {
            await result.current.handleCheckout();
        });

        expect(apiClient.createCheckoutOrder).toHaveBeenCalledWith(
            "mock-token",
            expect.objectContaining({ couponCode: "SAVE500" })
        );
        expect(result.current.appliedCoupon).toBeNull();
        expect(result.current.total).toBe(3699);
        expect(result.current.notice).toMatch(/SAVE500/);
        expect(result.current.error).toBeNull();
        expect(result.current.step).toBe(1);
        expect(result.current.isCheckoutDisabled).toBe(false);
    });

    it("applies a valid coupon with the shared pricing", async () => {
        mockFetch({
            validate: () => ({
                status: 200,
                json: { valid: true, discount: 500, type: "fixed", id: "c1" },
            }),
        });
        const { result } = renderHook(() => useBookingWorkflow());
        await waitForReady(result);

        act(() => result.current.setCouponCode("test500"));
        await act(async () => {
            await result.current.handleApplyCoupon();
        });

        expect(result.current.appliedCoupon).toMatchObject({
            code: "TEST500",
            discount: 500,
            type: "fixed",
        });
        expect(result.current.priceLines?.offerLine?.amount).toBe(500);
        expect(result.current.priceLines?.savings).toBe(500);
    });

    it("auto-applies a coupon passed from the workshop page", async () => {
        mockSearchParams = "?workshop=w1&hold=h1&guests=2&coupon=save10";
        mockFetch({
            validate: () => ({
                status: 200,
                json: { valid: true, discount: 10, type: "percentage", id: "c10" },
            }),
        });

        const { result } = renderHook(() => useBookingWorkflow());
        await waitForReady(result);

        await waitFor(() => {
            expect(result.current.appliedCoupon).toMatchObject({
                code: "SAVE10",
                discount: 10,
                type: "percentage",
            });
        });
        expect(result.current.showCouponInput).toBe(false);
        expect(result.current.total).toBe(3600 - 360 + 99);
    });

    it("re-validates an applied code after the seat count changes", async () => {
        mockFetch({
            validate: (body) =>
                Number(body.guests) >= 2
                    ? {
                          status: 200,
                          json: { valid: true, discount: 600, type: "fixed", id: "g1" },
                      }
                    : {
                          status: 400,
                          json: { valid: false, message: "Valid for 2 or more seats." },
                      },
        });
        vi.mocked(apiClient.createBookingHold).mockResolvedValue({
            hold: {
                id: "h2",
                guests: 1,
                expires_at: new Date(Date.now() + 8 * 60 * 1000).toISOString(),
            },
            holdDurationMinutes: 8,
        });

        const { result } = renderHook(() => useBookingWorkflow());
        await waitForReady(result);
        await act(async () => {
            await result.current.handleApplyCoupon("GROUP600");
        });
        expect(result.current.appliedCoupon?.code).toBe("GROUP600");

        act(() => result.current.setDraftGuests(1));
        await act(async () => {
            await result.current.reholdSeats();
        });

        await waitFor(() => expect(result.current.appliedCoupon).toBeNull());
        expect(result.current.couponError).toMatch(/GROUP600/);
        expect(result.current.total).toBe(1800 + 99);
    });

    describe("bookings closed", () => {
        it("is closed when the workshop is in the settings list, and shows no offers", async () => {
            mockSettings = { service_fee: 99, closed_workshop_ids: ["w1"] } as PlatformSettings;
            mockFetch({ offers: [] });
            const { result } = renderHook(() => useBookingWorkflow());
            await waitForReady(result);

            expect(result.current.bookingsClosed).toBe(true);
            expect(result.current.isCheckoutDisabled).toBe(true);
            expect(result.current.canRetryCheckout).toBe(false);
            const urls = vi.mocked(global.fetch).mock.calls.map((call) => String(call[0]));
            expect(urls.some((url) => url.startsWith("/api/offers"))).toBe(false);

            fillForm(result);
            await act(async () => {
                await result.current.handleCheckout();
            });
            expect(apiClient.createCheckoutOrder).not.toHaveBeenCalled();
        });

        it("still confirms a payment taken before the switch was flipped", async () => {
            mockSettings = { service_fee: 99, closed_workshop_ids: ["w1"] } as PlatformSettings;
            savePaymentRecovery(
                window.localStorage,
                {
                    holdId: "h1",
                    workshopId: "w1",
                    firstName: "John",
                    lastName: "Doe",
                    email: "john@test.com",
                    razorpayOrderId: "order_c",
                    razorpayPaymentId: "pay_c",
                    razorpaySignature: "sig_c",
                },
                { guests: 2, nowMs: Date.now(), userId: "user-1" }
            );
            vi.mocked(apiClient.confirmCheckoutPayment).mockResolvedValue({
                mode: "confirmed",
                booking: { id: "booking-closed", total: 3699 },
            });

            const { result } = renderHook(() => useBookingWorkflow());
            await waitFor(() => expect(result.current.step).toBe(3));

            expect(result.current.bookingsClosed).toBe(true);
            expect(result.current.confirmedBooking?.id).toBe("booking-closed");
            expect(findPaymentRecovery(window.localStorage, "w1", Date.now())).toBeNull();
        });

        it("closes when order creation answers 409 BOOKINGS_CLOSED", async () => {
            vi.mocked(apiClient.createCheckoutOrder).mockRejectedValue(
                new ApiClientError("Bookings for this workshop are closed.", 409, {
                    code: "BOOKINGS_CLOSED",
                })
            );
            const { result } = renderHook(() => useBookingWorkflow());
            await waitForReady(result);
            fillForm(result);

            await act(async () => {
                await result.current.handleCheckout();
            });

            expect(result.current.bookingsClosed).toBe(true);
            expect(result.current.step).toBe(1);
            expect(result.current.error).toBeNull();
            expect(window.Razorpay).not.toHaveBeenCalled();
        });

        it("closes when a re-hold answers 409 BOOKINGS_CLOSED", async () => {
            vi.mocked(apiClient.createBookingHold).mockRejectedValue(
                new ApiClientError("Bookings for this workshop are closed.", 409, {
                    code: "BOOKINGS_CLOSED",
                })
            );
            const { result } = renderHook(() => useBookingWorkflow());
            await waitForReady(result);
            act(() => result.current.setDraftGuests(3));

            await act(async () => {
                await result.current.reholdSeats();
            });

            expect(result.current.bookingsClosed).toBe(true);
            expect(result.current.holdId).toBe("h1");
        });
    });

    describe("payment recovery", () => {
        it("saves the payment before confirming and keeps the confirmation for a refresh", async () => {
            vi.mocked(apiClient.createCheckoutOrder).mockResolvedValue(orderCreated(3699));
            let resolveConfirm: (value: apiClient.CheckoutOrderResponse) => void = () => {};
            vi.mocked(apiClient.confirmCheckoutPayment).mockImplementation(
                () =>
                    new Promise((resolve) => {
                        resolveConfirm = resolve;
                    })
            );

            const { result } = renderHook(() => useBookingWorkflow());
            await waitForReady(result);
            fillForm(result);
            await act(async () => {
                await result.current.handleCheckout();
            });

            act(() => {
                lastRazorpayOptions?.handler({
                    razorpay_order_id: "order_123",
                    razorpay_payment_id: "pay_1",
                    razorpay_signature: "sig_1",
                });
            });

            // Saved before the confirm request answers.
            const saved = findPaymentRecovery(window.localStorage, "w1", Date.now());
            expect(saved?.payload).toMatchObject({
                holdId: "h1",
                razorpayPaymentId: "pay_1",
                razorpaySignature: "sig_1",
            });
            expect(result.current.awaitingConfirmation).toBe(true);
            expect(result.current.isCheckoutDisabled).toBe(true);

            await act(async () => {
                resolveConfirm({
                    mode: "confirmed",
                    booking: { id: "booking-1", total: 3699 },
                });
            });

            await waitFor(() => expect(result.current.step).toBe(3));
            expect(findPaymentRecovery(window.localStorage, "w1", Date.now())).toBeNull();
            expect(findConfirmedBooking(window.localStorage, "h1", Date.now())?.booking.id).toBe(
                "booking-1"
            );
        });

        it("confirms a saved payment found on load and retries a dropped connection", async () => {
            savePaymentRecovery(
                window.localStorage,
                {
                    holdId: "h1",
                    workshopId: "w1",
                    firstName: "John",
                    lastName: "Doe",
                    email: "john@test.com",
                    phone: "9876543210",
                    razorpayOrderId: "order_9",
                    razorpayPaymentId: "pay_9",
                    razorpaySignature: "sig_9",
                },
                { guests: 2, nowMs: Date.now() }
            );
            vi.mocked(apiClient.confirmCheckoutPayment)
                .mockRejectedValueOnce(new ApiClientError("offline", 0))
                .mockResolvedValueOnce({
                    mode: "already_confirmed",
                    booking: { id: "booking-9", total: 3699 },
                });

            // (The retry pause is mocked away, so the whole round can finish before the first
            // assertion: only the outcome is checked.)
            const { result } = renderHook(() => useBookingWorkflow());

            await waitFor(() => expect(result.current.step).toBe(3), { timeout: 5000 });
            expect(apiClient.confirmCheckoutPayment).toHaveBeenCalledTimes(2);
            expect(result.current.confirmedBooking?.id).toBe("booking-9");
            expect(result.current.confirmedAttendeeName).toBe("John Doe");
            expect(findPaymentRecovery(window.localStorage, "w1", Date.now())).toBeNull();
        }, 10_000);

        it("clears the saved payment when the server refunds it", async () => {
            savePaymentRecovery(
                window.localStorage,
                {
                    holdId: "h1",
                    workshopId: "w1",
                    firstName: "John",
                    lastName: "Doe",
                    email: "john@test.com",
                    razorpayOrderId: "order_8",
                    razorpayPaymentId: "pay_8",
                    razorpaySignature: "sig_8",
                },
                { guests: 2, nowMs: Date.now() }
            );
            vi.mocked(apiClient.confirmCheckoutPayment).mockRejectedValue(
                new ApiClientError("Your seat hold expired; the payment was refunded.", 409, {
                    code: "HOLD_EXPIRED_REFUNDED",
                })
            );

            const { result } = renderHook(() => useBookingWorkflow());
            await waitFor(() => expect(result.current.awaitingConfirmation).toBe(false));
            expect(result.current.error).toMatch(/refunded/);
            expect(findPaymentRecovery(window.localStorage, "w1", Date.now())).toBeNull();
        });
    });

    describe("payment recovery edge cases", () => {
        const saved = (
            overrides: Partial<PendingConfirmationPayload> = {},
            options: { userId?: string } = {}
        ) =>
            savePaymentRecovery(
                window.localStorage,
                {
                    holdId: "h1",
                    workshopId: "w1",
                    firstName: "John",
                    lastName: "Doe",
                    email: "john@test.com",
                    phone: "9876543210",
                    razorpayOrderId: "order_7",
                    razorpayPaymentId: "pay_7",
                    razorpaySignature: "sig_7",
                    ...overrides,
                },
                { guests: 2, nowMs: Date.now(), ...options }
            );
        const confirmed = (id: string) => ({
            mode: "confirmed" as const,
            booking: { id, total: 3699 },
        });
        const payNow = () =>
            act(() => {
                lastRazorpayOptions?.handler({
                    razorpay_order_id: "order_123",
                    razorpay_payment_id: "pay_1",
                    razorpay_signature: "sig_1",
                });
            });
        const holdConfirm = () => {
            let resolve: (value: apiClient.CheckoutOrderResponse) => void = () => {};
            vi.mocked(apiClient.confirmCheckoutPayment).mockImplementation(
                () =>
                    new Promise((done) => {
                        resolve = done;
                    })
            );
            return (value: apiClient.CheckoutOrderResponse) => resolve(value);
        };

        afterEach(() => {
            vi.useRealTimers();
            delete (window.navigator as { onLine?: boolean }).onLine;
        });

        it("keeps a payment the bank has not settled yet (402) and tries again", async () => {
            saved();
            vi.mocked(apiClient.confirmCheckoutPayment)
                .mockRejectedValueOnce(new ApiClientError("Payment is not captured yet.", 402))
                .mockResolvedValueOnce({
                    mode: "already_confirmed",
                    booking: { id: "booking-402", total: 3699 },
                });

            const { result } = renderHook(() => useBookingWorkflow());
            await waitFor(() => expect(result.current.step).toBe(3));

            expect(apiClient.confirmCheckoutPayment).toHaveBeenCalledTimes(2);
            expect(result.current.confirmedBooking?.id).toBe("booking-402");
            expect(findPaymentRecovery(window.localStorage, "w1", Date.now())).toBeNull();
        });

        it("never announces a booking for an answer that is not a confirmation", async () => {
            saved();
            // A proxy's page parsed as {}: status 200, no mode, no booking.
            vi.mocked(apiClient.confirmCheckoutPayment).mockResolvedValue(
                {} as apiClient.CheckoutOrderResponse
            );

            const { result } = renderHook(() => useBookingWorkflow());
            await waitFor(() => expect(result.current.confirmStatus).toBe("stalled"));

            expect(apiClient.confirmCheckoutPayment).toHaveBeenCalledTimes(4);
            expect(result.current.step).toBe(2);
            expect(result.current.confirmedBooking).toBeNull();
            expect(result.current.awaitingConfirmation).toBe(true);
            expect(findPaymentRecovery(window.localStorage, "w1", Date.now())).not.toBeNull();

            // Back online with a working connection: the same payment is confirmed.
            vi.mocked(apiClient.confirmCheckoutPayment).mockResolvedValue(confirmed("booking-b"));
            await act(async () => {
                window.dispatchEvent(new Event("online"));
            });
            await waitFor(() => expect(result.current.step).toBe(3));
            expect(result.current.confirmedBooking?.id).toBe("booking-b");
            expect(findPaymentRecovery(window.localStorage, "w1", Date.now())).toBeNull();
        });

        it("keeps trying on its own while stalled, and says so only once", async () => {
            vi.useFakeTimers();
            saved();
            vi.mocked(apiClient.confirmCheckoutPayment).mockRejectedValue(
                new ApiClientError("offline", 0)
            );

            const { result } = renderHook(() => useBookingWorkflow());
            await act(async () => {
                await vi.advanceTimersByTimeAsync(0);
            });
            expect(result.current.confirmStatus).toBe("stalled");
            expect(apiClient.confirmCheckoutPayment).toHaveBeenCalledTimes(4);
            expect(toastMocks.error).toHaveBeenCalledTimes(1);

            // First automatic round after 30 s: still offline.
            await act(async () => {
                await vi.advanceTimersByTimeAsync(30_000);
            });
            expect(apiClient.confirmCheckoutPayment).toHaveBeenCalledTimes(8);
            expect(result.current.confirmStatus).toBe("stalled");
            expect(toastMocks.error).toHaveBeenCalledTimes(1);

            // The next round waits a minute, and the connection is back.
            vi.mocked(apiClient.confirmCheckoutPayment).mockResolvedValue(confirmed("booking-t"));
            await act(async () => {
                await vi.advanceTimersByTimeAsync(59_000);
            });
            expect(result.current.step).toBe(2);
            await act(async () => {
                await vi.advanceTimersByTimeAsync(1_000);
            });
            expect(result.current.step).toBe(3);
            expect(result.current.confirmedBooking?.id).toBe("booking-t");
        });

        it("pays the order the server priced with the details as corrected since", async () => {
            vi.mocked(apiClient.createCheckoutOrder).mockResolvedValue(
                orderCreated(3749, { serviceFee: 149, total: 3749 })
            );
            holdConfirm();

            const { result } = renderHook(() => useBookingWorkflow());
            await waitForReady(result);
            fillForm(result);
            await act(async () => {
                await result.current.handleCheckout();
            });
            expect(result.current.priceChange).not.toBeNull();

            // While looking at the new total the customer fixes their number.
            act(() => result.current.handleFormFieldChange("phone", "9123456780"));
            await act(async () => {
                await result.current.handleCheckout();
            });
            expect(apiClient.createCheckoutOrder).toHaveBeenCalledTimes(1);
            expect(lastRazorpayOptions?.amount).toBe(374_900);
            expect(lastRazorpayOptions?.prefill?.contact).toBe("9123456780");

            payNow();
            // The booking is made from this payload, and so is the saved recovery copy.
            expect(apiClient.confirmCheckoutPayment).toHaveBeenCalledWith(
                "mock-token",
                expect.objectContaining({ phone: "9123456780", razorpayPaymentId: "pay_1" })
            );
            expect(findPaymentRecovery(window.localStorage, "w1", Date.now())?.payload.phone).toBe(
                "9123456780"
            );
        });

        it("keeps the payment in memory and warns when the browser will not store it", async () => {
            vi.mocked(apiClient.createCheckoutOrder).mockResolvedValue(orderCreated(3699));
            const resolveConfirm = holdConfirm();
            const listen = vi.spyOn(window, "addEventListener");

            const { result } = renderHook(() => useBookingWorkflow());
            await waitForReady(result);
            fillForm(result);
            await act(async () => {
                await result.current.handleCheckout();
            });

            vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
                throw new Error("QuotaExceededError");
            });
            payNow();

            expect(result.current.recoveryUnsaved).toBe(true);
            expect(result.current.awaitingConfirmation).toBe(true);
            expect(findPaymentRecovery(window.localStorage, "w1", Date.now())).toBeNull();
            // Closing the page now would lose the payment: the browser is asked to confirm.
            expect(listen.mock.calls.some(([type]) => type === "beforeunload")).toBe(true);

            await act(async () => {
                resolveConfirm(confirmed("booking-mem"));
            });
            await waitFor(() => expect(result.current.step).toBe(3));
            expect(result.current.recoveryUnsaved).toBe(false);
            expect(result.current.confirmedBooking?.id).toBe("booking-mem");
        });

        it("still records a booking that confirms after the customer closed the page", async () => {
            vi.mocked(apiClient.createCheckoutOrder).mockResolvedValue(orderCreated(3699));
            const resolveConfirm = holdConfirm();

            const { result, unmount } = renderHook(() => useBookingWorkflow());
            await waitForReady(result);
            fillForm(result);
            await act(async () => {
                await result.current.handleCheckout();
            });
            payNow();
            expect(findPaymentRecovery(window.localStorage, "w1", Date.now())).not.toBeNull();

            unmount();
            await act(async () => {
                resolveConfirm(confirmed("booking-gone"));
            });

            await waitFor(() =>
                expect(findPaymentRecovery(window.localStorage, "w1", Date.now())).toBeNull()
            );
            expect(findConfirmedBooking(window.localStorage, "h1", Date.now())?.booking.id).toBe(
                "booking-gone"
            );
        });

        it("never picks up, or sends, another account's payment", async () => {
            saved({}, { userId: "someone-else" });

            const { result } = renderHook(() => useBookingWorkflow());
            await waitForReady(result);
            await settleEffects();

            expect(result.current.awaitingConfirmation).toBe(false);
            expect(result.current.step).toBe(1);
            expect(apiClient.confirmCheckoutPayment).not.toHaveBeenCalled();
            // It stays for its owner.
            expect(
                findPaymentRecovery(window.localStorage, "w1", Date.now(), "someone-else")
            ).not.toBeNull();
        });

        it("saves the paying account with the payment", async () => {
            vi.mocked(apiClient.createCheckoutOrder).mockResolvedValue(orderCreated(3699));
            holdConfirm();

            const { result } = renderHook(() => useBookingWorkflow());
            await waitForReady(result);
            fillForm(result);
            await act(async () => {
                await result.current.handleCheckout();
            });
            payNow();

            expect(findPaymentRecovery(window.localStorage, "w1", Date.now())?.userId).toBe(
                "user-1"
            );
        });

        it("points the address at the hold of a payment recovered from an older hold", async () => {
            saved({ holdId: "h-old" });
            vi.mocked(apiClient.confirmCheckoutPayment).mockResolvedValue(confirmed("booking-old"));

            const { result } = renderHook(() => useBookingWorkflow());
            await waitFor(() => expect(result.current.step).toBe(3));

            expect(routerMocks.replace).toHaveBeenCalledWith(
                expect.stringContaining("hold=h-old"),
                expect.anything()
            );
            expect(result.current.confirmedGuests).toBe(2);
        });

        it("asks to log in again on a 401, then confirms with a fresh session", async () => {
            saved();
            vi.mocked(apiClient.confirmCheckoutPayment)
                .mockRejectedValueOnce(new ApiClientError("Unauthorized", 401))
                .mockResolvedValueOnce(confirmed("booking-401"));

            const { result, rerender } = renderHook(() => useBookingWorkflow());
            await waitFor(() => expect(result.current.confirmStatus).toBe("signin"));
            // The token the server refused is not tried again: no loop.
            await settleEffects();
            expect(apiClient.confirmCheckoutPayment).toHaveBeenCalledTimes(1);
            expect(findPaymentRecovery(window.localStorage, "w1", Date.now())).not.toBeNull();

            mockSession = { access_token: "fresh-token" };
            rerender();
            await waitFor(() => expect(result.current.step).toBe(3));
            expect(apiClient.confirmCheckoutPayment).toHaveBeenLastCalledWith(
                "fresh-token",
                expect.objectContaining({ razorpayPaymentId: "pay_7" })
            );
        });
    });

    describe("checkout request failures", () => {
        afterEach(() => {
            delete (window.navigator as { onLine?: boolean }).onLine;
        });

        it("on a 503 keeps what the customer chose and lets them try again", async () => {
            vi.mocked(apiClient.createCheckoutOrder)
                .mockRejectedValueOnce(
                    new ApiClientError(
                        "We could not check your coupon code right now. Please try again.",
                        503,
                        { code: "COUPON_CHECK_FAILED" }
                    )
                )
                // A gateway's bare 503: no code, its own text is never shown.
                .mockRejectedValueOnce(new ApiClientError("Request failed.", 503, {}))
                .mockResolvedValueOnce(orderCreated(3699));

            const { result } = renderHook(() => useBookingWorkflow());
            await waitForReady(result);
            fillForm(result);

            await act(async () => {
                await result.current.handleCheckout();
            });
            expect(result.current.error).toBe(
                "We could not check your coupon code right now. Please try again. You have not been charged."
            );
            expect(result.current.step).toBe(1);
            expect(result.current.submitting).toBe(false);
            expect(result.current.formData.firstName).toBe("John");
            expect(result.current.guests).toBe(2);
            expect(result.current.canRetryCheckout).toBe(true);
            expect(result.current.isCheckoutDisabled).toBe(false);
            expect(window.Razorpay).not.toHaveBeenCalled();

            await act(async () => {
                await result.current.handleRetryCheckout();
            });
            expect(result.current.error).toBe(
                "Unable to start checkout right now. Please try again. You have not been charged."
            );

            await act(async () => {
                await result.current.handleRetryCheckout();
            });
            expect(result.current.error).toBeNull();
            expect(window.Razorpay).toHaveBeenCalledTimes(1);
            expect(apiClient.createCheckoutOrder).toHaveBeenCalledTimes(3);
        });

        it("says nothing was charged when the connection drops before the order", async () => {
            vi.mocked(apiClient.createCheckoutOrder).mockRejectedValue(
                new ApiClientError("offline", 0)
            );
            const { result } = renderHook(() => useBookingWorkflow());
            await waitForReady(result);
            fillForm(result);

            await act(async () => {
                await result.current.handleCheckout();
            });

            expect(result.current.error).toMatch(/offline or on a slow connection/);
            expect(result.current.error).toMatch(/You have not been charged\.$/);
            expect(result.current.step).toBe(1);
            expect(result.current.canRetryCheckout).toBe(true);
            expect(window.Razorpay).not.toHaveBeenCalled();
        });

        it("creates one order however fast Pay is tapped", async () => {
            let resolveOrder: (value: apiClient.CheckoutOrderResponse) => void = () => {};
            vi.mocked(apiClient.createCheckoutOrder).mockImplementation(
                () =>
                    new Promise((done) => {
                        resolveOrder = done;
                    })
            );
            const { result } = renderHook(() => useBookingWorkflow());
            await waitForReady(result);
            fillForm(result);

            await act(async () => {
                const first = result.current.handleCheckout();
                const second = result.current.handleCheckout();
                resolveOrder(orderCreated(3699));
                await Promise.all([first, second]);
            });

            expect(apiClient.createCheckoutOrder).toHaveBeenCalledTimes(1);
            expect(window.Razorpay).toHaveBeenCalledTimes(1);
        });

        it("tells the customer the payment was cancelled when the Razorpay window is closed", async () => {
            vi.mocked(apiClient.createCheckoutOrder).mockResolvedValue(orderCreated(3699));
            const { result } = renderHook(() => useBookingWorkflow());
            await waitForReady(result);
            fillForm(result);
            await act(async () => {
                await result.current.handleCheckout();
            });
            expect(result.current.submitting).toBe(true);

            act(() => lastRazorpayOptions?.modal?.ondismiss?.());

            expect(result.current.error).toBe("Payment was cancelled before completion.");
            expect(result.current.step).toBe(1);
            expect(result.current.submitting).toBe(false);
            expect(result.current.awaitingConfirmation).toBe(false);
            expect(result.current.isCheckoutDisabled).toBe(false);
        });

        it("blocks Pay once the hold has run out and reserves again on request", async () => {
            const past = new Date(Date.now() - 60_000).toISOString();
            mockSearchParams = `?workshop=w1&hold=h1&guests=2&holdExpiresAt=${encodeURIComponent(past)}`;
            const { result } = renderHook(() => useBookingWorkflow());
            await waitForReady(result);
            fillForm(result);

            expect(result.current.holdExpired).toBe(true);
            expect(result.current.isCheckoutDisabled).toBe(true);
            await act(async () => {
                await result.current.handleCheckout();
            });
            expect(apiClient.createCheckoutOrder).not.toHaveBeenCalled();
            expect(result.current.error).toMatch(/seat hold has expired/i);

            vi.mocked(apiClient.createBookingHold).mockResolvedValue({
                hold: {
                    id: "h2",
                    guests: 2,
                    expires_at: new Date(Date.now() + 8 * 60 * 1000).toISOString(),
                },
                holdDurationMinutes: 8,
            });
            await act(async () => {
                await result.current.reholdSeats();
            });
            expect(result.current.holdExpired).toBe(false);
            expect(result.current.holdId).toBe("h2");
            expect(result.current.error).toBeNull();
            expect(result.current.isCheckoutDisabled).toBe(false);
        });

        it("tracks the browser going offline and back", async () => {
            const { result } = renderHook(() => useBookingWorkflow());
            await waitForReady(result);
            expect(result.current.isOffline).toBe(false);

            Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });
            act(() => {
                window.dispatchEvent(new Event("offline"));
            });
            expect(result.current.isOffline).toBe(true);

            Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
            act(() => {
                window.dispatchEvent(new Event("online"));
            });
            expect(result.current.isOffline).toBe(false);
        });

        it("does not pull the customer back when they leave while seats are being re-held", async () => {
            let resolveHold: (value: apiClient.BookingHoldResponse) => void = () => {};
            vi.mocked(apiClient.createBookingHold).mockImplementation(
                () =>
                    new Promise((done) => {
                        resolveHold = done;
                    })
            );
            const { result, unmount } = renderHook(() => useBookingWorkflow());
            await waitForReady(result);
            act(() => result.current.setDraftGuests(3));

            let pending: Promise<boolean> = Promise.resolve(false);
            act(() => {
                pending = result.current.reholdSeats();
            });
            unmount();
            await act(async () => {
                resolveHold({
                    hold: {
                        id: "h2",
                        guests: 3,
                        expires_at: new Date(Date.now() + 8 * 60 * 1000).toISOString(),
                    },
                    holdDurationMinutes: 8,
                });
                await pending;
            });

            expect(routerMocks.replace).not.toHaveBeenCalled();
        });
    });

    describe("seat picking", () => {
        it("derives the seat limits from the workshop and the current hold", async () => {
            const { result } = renderHook(() => useBookingWorkflow());
            await waitForReady(result);

            expect(result.current.guests).toBe(2);
            expect(result.current.selectedGuests).toBe(2);
            expect(result.current.seatsRemaining).toBe(6);
            expect(result.current.maxSelectableGuests).toBe(6);
            expect(result.current.seatChangePending).toBe(false);
        });

        it("clamps the draft guest count and blocks checkout until it is applied", async () => {
            const { result } = renderHook(() => useBookingWorkflow());
            await waitForReady(result);

            act(() => result.current.setDraftGuests(99));
            expect(result.current.selectedGuests).toBe(6);
            expect(result.current.seatChangePending).toBe(true);
            expect(result.current.isCheckoutDisabled).toBe(true);

            act(() => result.current.setDraftGuests(0));
            expect(result.current.selectedGuests).toBe(1);

            // Back to the held count: nothing to apply.
            act(() => result.current.setDraftGuests(2));
            expect(result.current.seatChangePending).toBe(false);

            act(() => result.current.setDraftGuests(4));
            act(() => result.current.resetDraftGuests());
            expect(result.current.selectedGuests).toBe(2);
        });

        it("re-holds seats, swaps the hold and recalculates the total", async () => {
            const expiresAt = new Date(Date.now() + 8 * 60 * 1000).toISOString();
            vi.mocked(apiClient.createBookingHold).mockResolvedValue({
                hold: { id: "h2", guests: 3, expires_at: expiresAt },
                holdDurationMinutes: 8,
            });

            const { result } = renderHook(() => useBookingWorkflow());
            await waitForReady(result);
            act(() => result.current.setDraftGuests(3));

            await act(async () => {
                await result.current.reholdSeats();
            });

            expect(apiClient.createBookingHold).toHaveBeenCalledWith("mock-token", {
                workshopId: "w1",
                guests: 3,
            });
            expect(result.current.holdId).toBe("h2");
            expect(result.current.guests).toBe(3);
            expect(result.current.seatChangePending).toBe(false);
            expect(result.current.priceLines?.listSubtotal).toBe(1800 * 3);
            expect(result.current.total).toBe(1800 * 3 + 99);
            expect(result.current.holdExpired).toBe(false);
            expect(routerMocks.replace).toHaveBeenCalledWith(
                expect.stringContaining("hold=h2"),
                expect.anything()
            );
            expect(routerMocks.replace).toHaveBeenCalledWith(
                expect.stringContaining("guests=3"),
                expect.anything()
            );
        });

        it("keeps the existing hold and learns the real availability when re-hold is rejected", async () => {
            vi.mocked(apiClient.createBookingHold).mockRejectedValue(
                new ApiClientError("Only 1 seat left", 409, { availableSeats: 1 })
            );

            const { result } = renderHook(() => useBookingWorkflow());
            await waitForReady(result);
            act(() => result.current.setDraftGuests(4));

            await act(async () => {
                await result.current.reholdSeats();
            });

            expect(result.current.holdId).toBe("h1");
            expect(result.current.guests).toBe(2);
            expect(result.current.seatError).toBe("Only 1 seat left");
            expect(result.current.seatsRemaining).toBe(1);
            // Held guests always stay selectable even if fewer seats are now free.
            expect(result.current.maxSelectableGuests).toBe(2);
            expect(result.current.seatChangePending).toBe(false);
            expect(routerMocks.replace).not.toHaveBeenCalled();
        });
    });
});
