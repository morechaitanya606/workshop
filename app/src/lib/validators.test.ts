import { describe, expect, it } from "vitest";
import { bookingCheckoutSchema, bookingHoldSchema, workshopFeedbackSchema } from "@/lib/validators";

describe("bookingHoldSchema", () => {
    it("accepts valid hold payload", () => {
        const parsed = bookingHoldSchema.safeParse({
            workshopId: "workshop-1",
            guests: 2,
        });

        expect(parsed.success).toBe(true);
    });

    it("rejects invalid guests", () => {
        const parsed = bookingHoldSchema.safeParse({
            workshopId: "workshop-1",
            guests: 0,
        });

        expect(parsed.success).toBe(false);
    });
});

describe("bookingCheckoutSchema", () => {
    const basePayload = {
        holdId: "9f762c60-855c-4a6f-b2b6-470f62f2f04d",
        workshopId: "workshop-1",
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.com",
        phone: "1234567890",
    };

    it("accepts payload without razorpay fields during order creation", () => {
        const parsed = bookingCheckoutSchema.safeParse(basePayload);
        expect(parsed.success).toBe(true);
    });

    it("rejects partial razorpay confirmation fields", () => {
        const parsed = bookingCheckoutSchema.safeParse({
            ...basePayload,
            razorpayOrderId: "order_123",
        });
        expect(parsed.success).toBe(false);
    });

    it("accepts all razorpay fields together", () => {
        const parsed = bookingCheckoutSchema.safeParse({
            ...basePayload,
            razorpayOrderId: "order_123",
            razorpayPaymentId: "pay_123",
            razorpaySignature: "sig_123",
        });
        expect(parsed.success).toBe(true);
    });
});

describe("workshopFeedbackSchema", () => {
    it("accepts feedback with media", () => {
        const parsed = workshopFeedbackSchema.safeParse({
            rating: 5,
            comment: "Amazing host and clear instructions.",
            photos: ["/media/review-1.png"],
            videoUrl: "https://youtube.com/watch?v=abc123",
        });
        expect(parsed.success).toBe(true);
    });

    it("rejects comment that is too short", () => {
        const parsed = workshopFeedbackSchema.safeParse({
            rating: 5,
            comment: "ok",
        });
        expect(parsed.success).toBe(false);
    });
});
