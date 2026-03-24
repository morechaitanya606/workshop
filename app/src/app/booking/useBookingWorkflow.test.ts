import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useBookingWorkflow } from "./useBookingWorkflow";
import * as apiClient from "@/lib/api-client";
import { mockWorkshops } from "@/lib/data";

// Mock dependencies
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams("?workshop=w1&hold=h1&guests=2"),
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
            workshop: mockWorkshops[0],
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
                workshopId: mockWorkshops[0].id,
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
});
