import { apiRequest, ApiClientError } from "./client";

export type BookingHoldResponse = {
    hold: {
        id: string;
        guests: number;
        expires_at: string;
        workshop?: {
            id: string;
            title: string;
            price: number;
            date: string;
            time: string;
            location: string;
            city: string;
            cover_image: string;
        };
    };
    holdDurationMinutes: number;
};

export function createBookingHold(
    accessToken: string,
    payload: {
        workshopId: string;
        guests: number;
    }
) {
    return apiRequest<BookingHoldResponse>("/api/bookings/hold", {
        method: "POST",
        accessToken,
        body: payload,
    });
}

export type CheckoutOrderResponse = {
    mode: "order_created" | "already_confirmed" | "confirmed";
    order?: {
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
    booking?: {
        id: string;
        total: number;
        workshop?: {
            title?: string;
            date?: string;
            time?: string;
            cover_image?: string;
        };
    };
};

export type CheckoutPayload = {
    holdId: string;
    workshopId: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    notes?: string;
    razorpayOrderId?: string;
    razorpayPaymentId?: string;
    razorpaySignature?: string;
};

export function createCheckoutOrder(accessToken: string, payload: CheckoutPayload) {
    return apiRequest<CheckoutOrderResponse>("/api/bookings/checkout", {
        method: "POST",
        accessToken,
        body: payload,
    });
}

export function confirmCheckoutPayment(
    accessToken: string,
    payload: CheckoutPayload & {
        razorpayOrderId: string;
        razorpayPaymentId: string;
        razorpaySignature: string;
    }
) {
    return apiRequest<CheckoutOrderResponse>("/api/bookings/checkout", {
        method: "POST",
        accessToken,
        body: payload,
    });
}

export type MyBookingsResponse = {
    data: Array<{
        id: string;
        guests: number;
        total: number;
        status?: string;
        created_at: string;
        first_name?: string;
        last_name?: string;
        workshop?: {
            id: string;
            title: string;
            date: string;
            time: string;
            location: string;
            city: string;
            cover_image?: string;
        };
    }>;
    source: "supabase" | "mock";
};

export function getMyBookings(accessToken: string) {
    return apiRequest<MyBookingsResponse>("/api/bookings", {
        accessToken,
        cache: "no-store",
    });
}
