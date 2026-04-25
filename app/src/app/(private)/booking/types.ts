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

export type AppliedCoupon = {
    code: string;
    discount: number;
    type: "percentage" | "fixed";
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
