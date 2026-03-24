import type { Workshop } from "@/lib/data";
import type { WorkshopCreateInput, WorkshopUpdateInput } from "@/lib/validators";

type Primitive = string | number | boolean | null | undefined;

export class ApiClientError extends Error {
    status: number;
    details: unknown;

    constructor(message: string, status: number, details?: unknown) {
        super(message);
        this.name = "ApiClientError";
        this.status = status;
        this.details = details ?? null;
    }
}

type ApiRequestOptions = {
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    accessToken?: string;
    body?: unknown;
    cache?: RequestCache;
};

async function apiRequest<T>(path: string, options: ApiRequestOptions = {}) {
    const headers: Record<string, string> = {};
    if (options.body !== undefined) {
        headers["Content-Type"] = "application/json";
    }
    if (options.accessToken) {
        headers.Authorization = `Bearer ${options.accessToken}`;
    }

    const response = await fetch(path, {
        method: options.method ?? "GET",
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        cache: options.cache,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new ApiClientError(
            String(payload?.error || "Request failed."),
            response.status,
            payload?.details ?? payload
        );
    }

    return payload as T;
}

export function isApiClientError(error: unknown): error is ApiClientError {
    return error instanceof ApiClientError;
}

export type GetWorkshopResponse = {
    workshop: Workshop;
    source: "supabase" | "mock";
};

export function getWorkshopById(workshopId: string) {
    return apiRequest<GetWorkshopResponse>(`/api/workshops/${workshopId}`, {
        cache: "no-store",
    });
}

export type SupportChatResponse = {
    reply: string;
    contextWorkshopId: string | null;
    showIssueForm: boolean;
    outcome: "answered" | "clarification_needed" | "issue_form";
    intent: string | null;
    confidence: "high" | "low";
};

export async function askSupportChatbot(payload: {
    message: string;
    contextWorkshopId?: string | null;
    userDisplayName?: string;
}) {
    const response = await fetch("/api/support/chat", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new ApiClientError(
            String(body?.error || "Request failed."),
            response.status,
            body?.details ?? body
        );
    }

    const result = body as SupportChatResponse;
    return {
        reply: result.reply,
        contextWorkshopId: result.contextWorkshopId ?? null,
        showIssueForm: result.showIssueForm ?? false,
        outcome: result.outcome ?? "answered",
        intent: result.intent ?? null,
        confidence: result.confidence ?? "high",
    };
}

export type SupportTicket = {
    id: string;
    subject: string;
    description: string;
    email: string;
    status: "open" | "in_progress" | "resolved";
    created_at: string;
    workshop_id?: string | null;
    workshop?: {
        id: string;
        title: string;
    } | null;
    replies: Array<{
        id: string;
        message: string;
        author: "admin" | "user";
        created_at: string;
    }>;
};

export type SupportTicketsResponse = {
    tickets: SupportTicket[];
};

export function getSupportTickets(accessToken: string) {
    return apiRequest<SupportTicketsResponse>("/api/support", {
        accessToken,
        cache: "no-store",
    });
}

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

export type WorkshopNotificationResponse = {
    subscriptions: {
        similar: boolean;
        creator: boolean;
    };
    message?: string;
};

export function getWorkshopNotifications(workshopId: string, accessToken: string) {
    return apiRequest<WorkshopNotificationResponse>(`/api/workshops/${workshopId}/notifications`, {
        accessToken,
        cache: "no-store",
    });
}

export function updateWorkshopNotifications(
    workshopId: string,
    accessToken: string,
    mode: "similar" | "creator"
) {
    return apiRequest<WorkshopNotificationResponse>(`/api/workshops/${workshopId}/notifications`, {
        method: "POST",
        accessToken,
        body: { mode },
    });
}

export type WorkshopFeedbackResponse = {
    feedback: {
        rating: number | null;
        comment: string;
        photos: string[];
        video_url: string | null;
        created_at: string;
        updated_at: string;
    } | null;
    message?: string;
};

export type BulkWorkshopFeedbackResponse = {
    feedback: Record<
        string,
        {
            rating: number | null;
            comment: string;
            photos: string[];
            video_url: string | null;
            created_at: string;
            updated_at: string;
        }
    >;
    message?: string;
};

export type WorkshopPublicFeedbackResponse = {
    feedback: Array<{
        id: string;
        rating: number | null;
        comment: string;
        photos: string[];
        createdAt: string;
        userDisplayName: string;
        avatarUrl?: string | null;
    }>;
};

export function getWorkshopFeedback(workshopId: string, accessToken: string) {
    return apiRequest<WorkshopFeedbackResponse>(`/api/workshops/${workshopId}/feedback`, {
        accessToken,
        cache: "no-store",
    });
}

export function getBulkWorkshopFeedback(workshopIds: string[], accessToken: string) {
    return apiRequest<BulkWorkshopFeedbackResponse>(`/api/workshops/feedback/bulk`, {
        method: "POST",
        accessToken,
        body: { workshopIds },
        cache: "no-store",
    });
}

export function getWorkshopPublicFeedback(
    workshopId: string,
    params?: {
        limit?: number;
    }
) {
    const searchParams = new URLSearchParams();
    if (params?.limit) {
        searchParams.set("limit", String(params.limit));
    }
    const suffix = searchParams.toString() ? `?${searchParams.toString()}` : "";
    return apiRequest<WorkshopPublicFeedbackResponse>(
        `/api/workshops/${workshopId}/public-feedback${suffix}`,
        {
            cache: "no-store",
        }
    );
}

export function submitWorkshopFeedback(
    workshopId: string,
    accessToken: string,
    payload: {
        comment: string;
        rating?: number;
        photos?: string[];
        videoUrl?: string;
    }
) {
    return apiRequest<WorkshopFeedbackResponse>(`/api/workshops/${workshopId}/feedback`, {
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

export function toApiErrorMessage(error: unknown, fallbackMessage: string) {
    if (isApiClientError(error)) {
        if (error.status >= 500) {
            return fallbackMessage;
        }
        return error.message || fallbackMessage;
    }
    return fallbackMessage;
}

export type PlatformSettings = {
    service_fee?: number;
};

export type PlatformSettingsResponse = {
    settings: PlatformSettings;
};

export function getPlatformSettings(accessToken?: string) {
    return apiRequest<PlatformSettingsResponse>("/api/settings", {
        accessToken,
        cache: "no-store",
    });
}

export function updatePlatformSettings(
    accessToken: string,
    payload: {
        settings: PlatformSettings;
    }
) {
    return apiRequest<{ success: boolean }>("/api/settings", {
        method: "PATCH",
        accessToken,
        body: payload,
    });
}

export type AdminCoupon = {
    id: string;
    code: string;
    discount_type: "percentage" | "fixed";
    discount_value: number;
    is_active: boolean | null;
    used_count: number | null;
    valid_until: string | null;
    created_at: string | null;
};

export type AdminCouponsResponse = {
    coupons: AdminCoupon[];
};

export function getAdminCoupons(accessToken: string) {
    return apiRequest<AdminCouponsResponse>("/api/coupons", {
        accessToken,
        cache: "no-store",
    });
}

export function createAdminCoupon(
    accessToken: string,
    payload: {
        code: string;
        discount_type: AdminCoupon["discount_type"];
        discount_value: number;
    }
) {
    return apiRequest<{ coupon: AdminCoupon }>("/api/coupons", {
        method: "POST",
        accessToken,
        body: payload,
    });
}

export function updateAdminCoupon(
    accessToken: string,
    couponId: string,
    payload: {
        is_active: boolean;
    }
) {
    return apiRequest<{ coupon: AdminCoupon }>(`/api/coupons/${couponId}`, {
        method: "PATCH",
        accessToken,
        body: payload,
    });
}

export type EventProperties = Record<string, Primitive>;

export type AuthMeResponse = {
    user: {
        id: string;
        email: string | null;
        fullName: string | null;
    };
    role: "admin" | "host" | "user";
};

export function getAuthMe(accessToken: string) {
    return apiRequest<AuthMeResponse>("/api/auth/me", {
        accessToken,
        cache: "no-store",
    });
}

export type ProfileResponse = {
    profile: {
        fullName: string | null;
        avatarUrl: string | null;
        dateOfBirth: string | null;
        phoneNumber: string | null;
    };
};

export function getProfile(accessToken: string) {
    return apiRequest<ProfileResponse>("/api/profile", {
        accessToken,
        cache: "no-store",
    });
}

export function updateProfile(
    accessToken: string,
    payload: {
        fullName?: string;
        avatarUrl?: string;
        dateOfBirth?: string;
        phoneNumber?: string;
    }
) {
    return apiRequest<ProfileResponse>("/api/profile", {
        method: "PATCH",
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

export async function uploadMedia(accessToken: string, file: File) {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/upload", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
        body: formData,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new ApiClientError(
            String(payload?.error || "Upload failed."),
            response.status,
            payload?.details ?? payload
        );
    }

    const resolvedUrl = payload?.url || payload?.signedUrl || null;
    if (!resolvedUrl) {
        throw new ApiClientError("Upload succeeded, but no file URL was returned.", 500, payload);
    }

    return {
        ...payload,
        url: resolvedUrl,
    } as { url: string; signedUrl?: string | null };
}

export type AdminRegistrationsResponse = {
    registrations: Array<{
        id: string;
        first_name: string;
        last_name: string;
        email: string;
        phone: string | null;
        guests: number;
        total: number;
        status: string;
        created_at: string;
        workshop: {
            id: string;
            title: string;
            date: string;
            time: string;
            city: string;
            location: string;
        } | null;
    }>;
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
};

export function getAdminRegistrations(
    accessToken: string,
    params: {
        page: number;
        pageSize: number;
        status?: string;
        q?: string;
    }
) {
    const searchParams = new URLSearchParams({
        page: String(params.page),
        pageSize: String(params.pageSize),
        status: params.status || "all",
    });
    if (params.q?.trim()) {
        searchParams.set("q", params.q.trim());
    }

    return apiRequest<AdminRegistrationsResponse>(
        `/api/admin/registrations?${searchParams.toString()}`,
        {
            accessToken,
            cache: "no-store",
        }
    );
}

export type AdminFeedbackResponse = {
    feedback: Array<{
        id: string;
        userId: string;
        workshopId: string;
        rating: number | null;
        comment: string;
        photos: string[];
        videoUrl: string | null;
        createdAt: string;
        updatedAt: string;
        workshop: {
            id: string;
            title: string;
            date: string;
            time: string | null;
            city: string;
            location: string;
        } | null;
        user: {
            fullName: string | null;
            firstName: string | null;
            lastName: string | null;
            email: string | null;
        };
    }>;
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
};

export function getAdminFeedback(
    accessToken: string,
    params: {
        page: number;
        pageSize: number;
        q?: string;
        workshopId?: string;
    }
) {
    const searchParams = new URLSearchParams({
        page: String(params.page),
        pageSize: String(params.pageSize),
    });
    if (params.q?.trim()) {
        searchParams.set("q", params.q.trim());
    }
    if (params.workshopId?.trim()) {
        searchParams.set("workshopId", params.workshopId.trim());
    }

    return apiRequest<AdminFeedbackResponse>(`/api/admin/feedback?${searchParams.toString()}`, {
        accessToken,
        cache: "no-store",
    });
}

export function updateAdminFeedback(
    accessToken: string,
    feedbackId: string,
    payload: { rating?: number; comment?: string }
) {
    return apiRequest<{ feedback: unknown }>(`/api/admin/feedback/${feedbackId}`, {
        method: "PATCH",
        accessToken,
        body: payload,
    });
}

export function deleteAdminFeedback(accessToken: string, feedbackId: string) {
    return apiRequest<{ success: boolean }>(`/api/admin/feedback/${feedbackId}`, {
        method: "DELETE",
        accessToken,
    });
}

export type AdminWorkshopsResponse = {
    data: Workshop[];
};

export function getAdminWorkshops(accessToken: string) {
    return apiRequest<AdminWorkshopsResponse>("/api/admin/workshops", {
        accessToken,
        cache: "no-store",
    });
}

export type AdminWorkshopResponse = {
    workshop: Workshop;
};

export function getAdminWorkshop(accessToken: string, workshopId: string) {
    return apiRequest<AdminWorkshopResponse>(`/api/admin/workshops/${workshopId}`, {
        accessToken,
        cache: "no-store",
    });
}

export function createAdminWorkshop(accessToken: string, payload: WorkshopCreateInput) {
    return apiRequest<AdminWorkshopResponse>("/api/admin/workshops", {
        method: "POST",
        accessToken,
        body: payload,
    });
}

export function updateAdminWorkshop(
    accessToken: string,
    workshopId: string,
    payload: WorkshopUpdateInput
) {
    return apiRequest<AdminWorkshopResponse>(`/api/admin/workshops/${workshopId}`, {
        method: "PATCH",
        accessToken,
        body: payload,
    });
}

export type AdminStats = {
    activeWorkshops: number;
    totalBookedSeats: number;
    revenue: number;
    avgRating: string;
};

export type AdminStatsResponse = {
    stats: AdminStats;
};

export function getAdminStats(accessToken: string) {
    return apiRequest<AdminStatsResponse>("/api/admin/stats", {
        accessToken,
        cache: "no-store",
    });
}

export type HostApplication = {
    id: string;
    user_id: string;
    name: string;
    email: string;
    bio: string;
    portfolio_url: string | null;
    application_type: string;
    details: Record<string, unknown>;
    status: "pending" | "approved" | "rejected";
    created_at: string;
    updated_at: string;
};

export type HostApplicationSubmitResponse = {
    application: HostApplication;
    message?: string;
};

export function submitHostApplication(
    accessToken: string,
    payload: {
        name: string;
        email: string;
        bio: string;
        portfolioUrl?: string;
        applicationType: string;
        details?: Record<string, unknown>;
    }
) {
    return apiRequest<HostApplicationSubmitResponse>("/api/host-applications", {
        method: "POST",
        accessToken,
        body: payload,
    });
}

export type AdminHostApplicationsResponse = {
    applications: HostApplication[];
};

export function getAdminHostApplications(accessToken: string) {
    return apiRequest<AdminHostApplicationsResponse>("/api/host-applications", {
        accessToken,
        cache: "no-store",
    });
}

export type AdminHostApplicationActionResponse = {
    success: boolean;
    application: HostApplication;
    message?: string;
};

export function approveHostApplication(accessToken: string, applicationId: string) {
    return apiRequest<AdminHostApplicationActionResponse>(
        `/api/admin/host-applications/${applicationId}/approve`,
        {
            method: "POST",
            accessToken,
        }
    );
}

export function rejectHostApplication(accessToken: string, applicationId: string) {
    return apiRequest<AdminHostApplicationActionResponse>(
        `/api/admin/host-applications/${applicationId}/reject`,
        {
            method: "POST",
            accessToken,
        }
    );
}

export type AdminPayoutBalance = {
    hostId: string;
    name: string;
    userId: string | null;
    availableBalance: number;
    availableEarningsCount: number;
};

export type AdminPayoutBalancesResponse = {
    balances: AdminPayoutBalance[];
};

export function getAdminPayoutBalances(accessToken: string) {
    return apiRequest<AdminPayoutBalancesResponse>("/api/admin/payouts/balances", {
        accessToken,
        cache: "no-store",
    });
}

export type AdminPayout = {
    id: string;
    host_id: string;
    amount: number;
    status: "processing" | "completed";
    reference_note: string | null;
    created_at: string;
    host: {
        id: string;
        name: string;
        user_id: string | null;
    } | null;
};

export type AdminPayoutsResponse = {
    payouts: AdminPayout[];
};

export function getAdminPayouts(accessToken: string) {
    return apiRequest<AdminPayoutsResponse>("/api/admin/payouts", {
        accessToken,
        cache: "no-store",
    });
}

export type AdminCreatePayoutResponse = {
    payout: {
        id: string;
        host_id: string;
        amount: number;
        status: "processing" | "completed";
        reference_note: string | null;
        created_at: string;
        updated_at: string;
    };
    paidEarningsCount: number;
    message?: string;
};

export function createAdminPayout(
    accessToken: string,
    payload: { hostId: string; referenceNote?: string }
) {
    return apiRequest<AdminCreatePayoutResponse>("/api/admin/payouts", {
        method: "POST",
        accessToken,
        body: payload,
    });
}

export type HostEarningsResponse = {
    host: {
        id: string;
        name: string;
        user_id: string | null;
    } | null;
    summary: {
        pending: number;
        available: number;
        paid: number;
    };
    earnings: Array<{
        id: string;
        booking_id: string;
        amount: number;
        fee_deducted: number;
        status: "pending" | "available" | "paid";
        created_at: string;
    }>;
    payouts: Array<{
        id: string;
        amount: number;
        status: "processing" | "completed";
        reference_note: string | null;
        created_at: string;
    }>;
};

export function getHostEarnings(accessToken: string) {
    return apiRequest<HostEarningsResponse>("/api/host/earnings", {
        accessToken,
        cache: "no-store",
    });
}

export function deleteAdminWorkshop(accessToken: string, workshopId: string) {
    return apiRequest<{ success: boolean }>(`/api/admin/workshops/${workshopId}`, {
        method: "DELETE",
        accessToken,
    });
}

export type FavoritesResponse = {
    favorites: string[];
    source: "supabase" | "memory";
};

export function getFavorites(accessToken: string) {
    return apiRequest<FavoritesResponse>("/api/favorites", {
        accessToken,
        cache: "no-store",
    });
}

export function addFavorite(accessToken: string, workshopId: string) {
    return apiRequest<FavoritesResponse>("/api/favorites", {
        method: "POST",
        accessToken,
        body: { workshopId },
    });
}

export function removeFavorite(accessToken: string, workshopId: string) {
    return apiRequest<FavoritesResponse>("/api/favorites", {
        method: "DELETE",
        accessToken,
        body: { workshopId },
    });
}

export type HostLedgerResponse = {
    earnings: Array<{
        id: string;
        amount: number;
        fee_deducted: number;
        status: "pending" | "available" | "paid";
        created_at: string;
        booking?: {
            id: string;
            status: string;
            guests: number;
            total: number;
            created_at: string;
            workshop?: {
                title: string;
            } | null;
        } | null;
    }>;
    payouts: Array<{
        id: string;
        amount: number;
        status: "processing" | "completed";
        reference_note: string | null;
        created_at: string;
    }>;
};

export function getHostLedger(accessToken: string) {
    return apiRequest<HostLedgerResponse>("/api/host/ledger", {
        accessToken,
        cache: "no-store",
    });
}

export type HostWorkshopsResponse = {
    data: Workshop[];
};

export function getHostWorkshops(accessToken: string) {
    return apiRequest<HostWorkshopsResponse>("/api/host/workshops", {
        accessToken,
        cache: "no-store",
    });
}

export type WorkshopAttendee = {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
    guests: number;
    attended: boolean;
    status?: string;
    created_at?: string;
};

export type WorkshopAttendeesResponse = {
    success: boolean;
    attendees: WorkshopAttendee[];
};

type DashboardScope = "admin" | "host";

function getWorkshopAttendeesPath(workshopId: string, scope: DashboardScope) {
    return scope === "admin"
        ? `/api/admin/workshops/${workshopId}/attendees`
        : `/api/host/workshops/${workshopId}/attendees`;
}

function getWorkshopAttendeeCheckInPath(bookingId: string, scope: DashboardScope) {
    return scope === "admin"
        ? `/api/admin/bookings/${bookingId}/check-in`
        : `/api/host/bookings/${bookingId}/check-in`;
}

export function getWorkshopAttendees(
    accessToken: string,
    workshopId: string,
    scope: DashboardScope = "host"
) {
    return apiRequest<WorkshopAttendeesResponse>(getWorkshopAttendeesPath(workshopId, scope), {
        accessToken,
        cache: "no-store",
    });
}

export function updateWorkshopAttendeeCheckIn(
    accessToken: string,
    bookingId: string,
    attended: boolean,
    scope: DashboardScope = "host"
) {
    return apiRequest<{ success: boolean; attended: boolean }>(
        getWorkshopAttendeeCheckInPath(bookingId, scope),
        {
            method: "PATCH",
            accessToken,
            body: { attended },
        }
    );
}
