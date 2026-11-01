import type { CheckoutPayload } from "@/lib/api-client";

export type ConfirmedBooking = {
    id: string;
    total: number;
    workshop?: {
        title?: string;
        date?: string;
        time?: string;
        cover_image?: string;
    };
};

/**
 * A code the customer typed or tapped, as /api/coupons/validate accepted it. The price is never
 * taken from here directly: booking-pricing.ts turns it into a PricingCoupon (with the public
 * offer's rules when it is one) and quotes it with src/lib/pricing.ts, like checkout does.
 */
export type AppliedCoupon = {
    code: string;
    /** The coupon id from the validate response; matches a public offer's id when it is one. */
    id: string | null;
    /** discount_value: a percentage, or rupees once per booking. */
    discount: number;
    type: "percentage" | "fixed";
    /** Only when the validate response names them. */
    minGuests?: number | null;
    minOrderAmount?: number | null;
    /** The offer's public name when the code belongs to one ("Community price drop"). */
    label?: string | null;
};

/** What the confirm request sends: the order's checkout payload plus Razorpay's proof. */
export type PendingConfirmationPayload = CheckoutPayload & {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
};

export type BookingFormData = {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    notes: string;
};

export type FormErrors = {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
};

export type RazorpayOrderResponse = {
    id: string;
    amount: number;
    currency: string;
    keyId: string;
    name?: string;
    description?: string;
    prefill?: {
        name?: string;
        email?: string;
        contact?: string;
    };
};

export type RazorpaySuccessResponse = {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
};

export type RazorpayOptions = {
    key: string;
    amount: number;
    currency: string;
    name: string;
    description?: string;
    order_id: string;
    prefill?: {
        name?: string;
        email?: string;
        contact?: string;
    };
    handler: (response: RazorpaySuccessResponse) => void;
    modal?: {
        ondismiss?: () => void;
    };
    theme?: {
        color?: string;
    };
};

export type RazorpayInstance = {
    open: () => void;
    on: (event: string, handler: (response: unknown) => void) => void;
};
