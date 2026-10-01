import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useBookingWorkflow } from "./useBookingWorkflow";
import * as apiClient from "@/lib/api-client";
import type { Workshop } from "@/lib/data";

// Mock dependencies
let mockSearchParams = "?workshop=w1&hold=h1&guests=2";
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

const routerMocks = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: routerMocks.replace }),
    useSearchParams: () => new URLSearchParams(mockSearchParams),
}));

vi.mock("@/components/ToastProvider", () => ({
    useToast: () => ({
        success: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
    }),
}));

const mockUser = {
    id: "user-1",
    email: "test@example.com",
    user_metadata: { full_name: "John Doe" },
};

vi.mock("@/lib/auth-context", () => ({
    useAuth: () => ({
        user: mockUser,
        session: { access_token: "mock-token" },
        loading: false,
    }),
}));

vi.mock("@/lib/analytics", () => ({
    trackEvent: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
    createBookingHold: vi.fn(),
    createCheckoutOrder: vi.fn(),
    confirmCheckoutPayment: vi.fn(),
    getWorkshopById: vi.fn(),
    toApiErrorMessage: vi.fn().mockReturnValue("API Error"),
}));

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
        originalFetch = global.fetch;

        // Mock window.Razorpay
        // @ts-ignore
        window.Razorpay = vi.fn(function MockRazorpay() {
            return {
                on: vi.fn(),
                open: vi.fn(),
            };
        });

        vi.spyOn(apiClient, "getWorkshopById").mockResolvedValue({
            workshop: bookingTestWorkshop,
        } as any);

        // Default fetch mock for settings
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ settings: { service_fee: 99 } }),
        });
    });

    afterEach(() => {
        global.fetch = originalFetch;
        // @ts-ignore
        delete window.Razorpay;
    });

    it("initializes with data and valid state", async () => {
        const { result } = renderHook(() => useBookingWorkflow());

        // By default should wait for initial useEffects
        expect(result.current.step).toBe(1);
        expect(result.current.guests).toBe(2);
        expect(result.current.holdId).toBe("h1");

        // Wait for user effect setting initial form data
        await waitForReady(result);

        expect(result.current.formData.email).toBe("test@example.com");
        expect(result.current.formData.firstName).toBe("John");
        expect(result.current.formData.lastName).toBe("Doe");
    });

    it("validates form fields and prevents checkout if empty", async () => {
        const { result } = renderHook(() => useBookingWorkflow());
        await waitForReady(result);

        await act(async () => {
            // Clear out fields to force validation failure
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

    it("calculates totals correctly with guests and runs checkout successfully", async () => {
        vi.spyOn(apiClient, "createCheckoutOrder").mockResolvedValue({
            mode: "order_created",
            order: {
                id: "order_123",
                keyId: "rzp_test",
                amount: 1000,
                currency: "INR",
            },
        });

        const { result } = renderHook(() => useBookingWorkflow());
        await waitForReady(result);

        await act(async () => {
            // Provide all required valid fields
            result.current.handleFormFieldChange("phone", "9876543210");
            result.current.handleFormFieldChange("firstName", "John");
            result.current.handleFormFieldChange("lastName", "Doe");
            result.current.handleFormFieldChange("email", "john@test.com");
        });

        await act(async () => {
            await result.current.handleCheckout();
        });

        expect(result.current.step).toBe(2);
        expect(result.current.submitting).toBe(true);
        expect(apiClient.createCheckoutOrder).toHaveBeenCalledWith(
            "mock-token",
            expect.objectContaining({
                holdId: "h1",
                workshopId: bookingTestWorkshop.id,
                firstName: "John",
                phone: "9876543210",
            })
        );
        expect(window.Razorpay).toHaveBeenCalled();
    });

    it("applies a valid coupon", async () => {
        const { result } = renderHook(() => useBookingWorkflow());

        // Override fetch just for the coupon validation call
        global.fetch = vi.fn().mockImplementation(async (url: string) => {
            if (url.includes("/api/settings")) {
                return { ok: true, json: async () => ({ settings: { service_fee: 99 } }) };
            }
            if (url.includes("/api/coupons/validate")) {
                return {
                    ok: true,
                    json: async () => ({ valid: true, discount: 500, type: "fixed" }),
                };
            }
            return { ok: false };
        });

        // Set coupon code
        await act(async () => {
            result.current.setCouponCode("TEST500");
        });

        // Apply coupon
        await act(async () => {
            await result.current.handleApplyCoupon();
        });

        expect(result.current.appliedCoupon).toEqual({
            code: "TEST500",
            discount: 500,
            type: "fixed",
        });
        expect(result.current.discountAmount).toBe(500);
    });

    it("auto-applies a coupon passed from the workshop page", async () => {
        mockSearchParams = "?workshop=w1&hold=h1&guests=2&coupon=SAVE10";

        global.fetch = vi.fn().mockImplementation(async (url: string) => {
            if (url.includes("/api/settings")) {
                return { ok: true, json: async () => ({ settings: { service_fee: 99 } }) };
            }
            if (url.includes("/api/coupons/validate")) {
                return {
                    ok: true,
                    json: async () => ({ valid: true, discount: 10, type: "percentage" }),
                };
            }
            return { ok: false };
        });

        const { result } = renderHook(() => useBookingWorkflow());
        await waitForReady(result);

        await waitFor(() => {
            expect(result.current.appliedCoupon).toEqual({
                code: "SAVE10",
                discount: 10,
                type: "percentage",
            });
        });
        expect(result.current.showCouponInput).toBe(false);
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
            vi.spyOn(apiClient, "createBookingHold").mockResolvedValue({
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
            expect(result.current.subtotalOriginal).toBe(1800 * 3);
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
            vi.mocked(apiClient.toApiErrorMessage).mockReturnValue("Only 1 seat left");
            vi.spyOn(apiClient, "createBookingHold").mockRejectedValue(
                Object.assign(new Error("Only 1 seat left"), {
                    details: { availableSeats: 1 },
                })
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
