import type { Workshop } from "@/lib/data";
import type { SpecialPageSettings } from "@/lib/special-page";
import type { HostProfile } from "@/lib/workshop-library";
import type {
    CommunityCreateInput,
    CommunityJoinInput,
    WorkshopCreateInput,
    WorkshopUpdateInput,
} from "@/lib/validators";
import { isCommunitiesSetupIncompleteMessage } from "@/lib/community-api-errors";

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

export type ApiRequestOptions = {
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    accessToken?: string;
    body?: unknown;
    cache?: RequestCache;
    /** Cancels the request (and any retry); the call then rejects with a status-0 error. */
    signal?: AbortSignal;
    /**
     * Per-attempt timeout; defaults to API_GET_TIMEOUT_MS for a GET, API_MEDIA_WRITE_TIMEOUT_MS
     * for the image-copying writes and API_WRITE_TIMEOUT_MS for any other write.
     */
    timeoutMs?: number;
};

/** Message of a status-0 ApiClientError for a read (dropped connection, timeout or abort). */
export const API_OFFLINE_MESSAGE =
    "You seem to be offline or on a slow connection. Please try again.";
/**
 * Message of a status-0 ApiClientError for a write: the request may have reached the server
 * before the connection dropped, so a bare "try again" would invite a duplicate.
 */
export const API_WRITE_UNCONFIRMED_MESSAGE =
    "The connection is slow or dropped, so we can't tell whether this was saved. Please check before trying again.";
/*
 * Per-attempt timeouts. The booking page puts its own backstops over them (booking-network.ts:
 * workshop load 35 s, hold and order 30 s, confirm 28 s): a GET (two attempts and a pause of at
 * most 1 s) must stay under 35 s and an ordinary write under 28 s.
 */
export const API_GET_TIMEOUT_MS = 15_000;
export const API_WRITE_TIMEOUT_MS = 25_000;
/** GET /api/auth/me decides whether an admin or host is let in: a slow link gets longer. */
export const API_AUTH_TIMEOUT_MS = 30_000;
/**
 * Writes whose server copies pasted image links into storage (src/lib/image-mirror.ts: four at a
 * time, each up to ~20 s; the routes run up to maxDuration = 60). The client must outlast the
 * server: a save that worked but is reported as failed gets saved a second time.
 */
export const API_MEDIA_WRITE_TIMEOUT_MS = 65_000;
const MEDIA_WRITE_PATHS: readonly RegExp[] = [
    /^\/api\/(?:admin|host)\/workshops(?:\/[^/]+)?$/,
    /^\/api\/admin\/community-photos(?:\/[^/]+)?$/,
    /^\/api\/workshops\/[^/]+\/feedback$/,
    /^\/api\/(?:communities|profile|settings)$/,
];
const API_GET_RETRY_DELAY_MS = 600;
/** Added at random to the retry pause so clients that failed together do not retry together. */
const API_GET_RETRY_JITTER_MS = 400;
/** Gateway answers worth one more try for a read (the origin was briefly unreachable). */
const RETRYABLE_GET_STATUSES = new Set([502, 503, 504]);

function defaultTimeoutMs(method: string, path: string) {
    if (method === "GET") return API_GET_TIMEOUT_MS;
    const pathname = path.split(/[?#]/, 1)[0];
    return MEDIA_WRITE_PATHS.some((pattern) => pattern.test(pathname))
        ? API_MEDIA_WRITE_TIMEOUT_MS
        : API_WRITE_TIMEOUT_MS;
}

function retryPauseMs() {
    return API_GET_RETRY_DELAY_MS + Math.floor(Math.random() * API_GET_RETRY_JITTER_MS);
}

type NetworkFailureReason = "offline" | "timeout" | "aborted";

/**
 * Network failure: status 0, details { code: "NETWORK_ERROR", reason }. A write that did not
 * come back (not one the caller cancelled) may still have been saved, and says so.
 */
function networkError(reason: NetworkFailureReason, method = "GET") {
    const unconfirmedWrite = method !== "GET" && reason !== "aborted";
    return new ApiClientError(
        unconfirmedWrite ? API_WRITE_UNCONFIRMED_MESSAGE : API_OFFLINE_MESSAGE,
        0,
        { code: "NETWORK_ERROR", reason }
    );
}

/** Waits `ms`, or rejects with an "aborted" network error as soon as `signal` aborts. */
function waitBeforeRetry(ms: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
            reject(networkError("aborted"));
            return;
        }
        const onAbort = () => {
            clearTimeout(timer);
            reject(networkError("aborted"));
        };
        const timer = setTimeout(() => {
            signal?.removeEventListener("abort", onAbort);
            resolve();
        }, ms);
        signal?.addEventListener("abort", onAbort, { once: true });
    });
}

type AttemptResult = { response: Response; payload: unknown };

/**
 * One fetch plus reading its body, under one timeout (a body can stall on a slow connection
 * too). Rejects only with a status-0 ApiClientError; HTTP errors resolve with their response.
 */
async function attemptRequest(
    path: string,
    init: RequestInit,
    timeoutMs: number,
    callerSignal?: AbortSignal
): Promise<AttemptResult> {
    if (callerSignal?.aborted) throw networkError("aborted");

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, timeoutMs);
    const onCallerAbort = () => controller.abort();
    callerSignal?.addEventListener("abort", onCallerAbort, { once: true });

    try {
        const response = await fetch(path, { ...init, signal: controller.signal });
        const text = await response.text();
        let payload: unknown = {};
        if (text) {
            try {
                payload = JSON.parse(text);
            } catch {
                // Not JSON (e.g. a gateway's HTML error page): same as an empty body.
                payload = {};
            }
        }
        return { response, payload };
    } catch {
        // fetch() and body reads reject only when no complete answer arrived.
        throw networkError(
            timedOut ? "timeout" : callerSignal?.aborted ? "aborted" : "offline",
            init.method
        );
    } finally {
        clearTimeout(timer);
        callerSignal?.removeEventListener("abort", onCallerAbort);
    }
}

/**
 * JSON request with a timeout. GET is retried once after a short pause when the connection
 * fails, times out or a gateway answers 502/503/504; POST/PATCH/DELETE are never retried (they
 * may have reached the server, and no endpoint takes an idempotency key). Network failures
 * reject with ApiClientError status 0 (API_OFFLINE_MESSAGE for a read,
 * API_WRITE_UNCONFIRMED_MESSAGE for a write); HTTP errors keep their status, the body's `error`
 * as message and `details ?? body` as details.
 */
export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}) {
    const method = options.method ?? "GET";
    const headers: Record<string, string> = {};
    if (options.body !== undefined) {
        headers["Content-Type"] = "application/json";
    }
    if (options.accessToken) {
        headers.Authorization = `Bearer ${options.accessToken}`;
    }

    const init: RequestInit = {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        cache: options.cache,
    };
    const timeoutMs = options.timeoutMs ?? defaultTimeoutMs(method, path);
    const maxAttempts = method === "GET" ? 2 : 1;

    let result: AttemptResult | null = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const isLastAttempt = attempt === maxAttempts;
        try {
            result = await attemptRequest(path, init, timeoutMs, options.signal);
        } catch (error) {
            const aborted = options.signal?.aborted ?? false;
            if (isLastAttempt || aborted) throw error;
            await waitBeforeRetry(retryPauseMs(), options.signal);
            continue;
        }
        if (!isLastAttempt && RETRYABLE_GET_STATUSES.has(result.response.status)) {
            await waitBeforeRetry(retryPauseMs(), options.signal);
            continue;
        }
        break;
    }

    // The loop either throws or ends with a result.
    const { response, payload } = result as AttemptResult;
    const body = payload as { error?: unknown; details?: unknown } | null;
    if (!response.ok) {
        throw new ApiClientError(
            String(body?.error || "Request failed."),
            response.status,
            body?.details ?? body
        );
    }

    return payload as T;
}

export function isApiClientError(error: unknown): error is ApiClientError {
    return error instanceof ApiClientError;
}

export type GetWorkshopResponse = {
    workshop: Workshop;
    source: "supabase";
};

export type FaqItem = {
    id: string;
    question: string;
    answer: string;
    created_at?: string;
    updated_at?: string;
};

export function getWorkshopById(workshopId: string) {
    return apiRequest<GetWorkshopResponse>(`/api/workshops/${workshopId}`, {
        cache: "no-store",
    });
}

export type ChatbotResponse = {
    reply: string;
    showBookingButton: boolean;
    askName: boolean;
    askPhone: boolean;
};

export function askChatbot(payload: {
    message: string;
    stage: "idle" | "asking_name" | "asking_phone" | "completed";
    lead?: {
        name?: string;
        phone?: string;
        query?: string;
    };
    clientId?: string;
    clientApiKey?: string;
    contextWorkshopId?: string | null;
}) {
    return apiRequest<ChatbotResponse>("/api/chat", {
        method: "POST",
        body: payload,
    });
}

export type ChatbotConfigResponse = {
    clientId: string | null;
    clientName: string;
    bookingUrl: string;
};

export function getChatbotConfig(params?: {
    clientApiKey?: string | null;
    clientId?: string | null;
    contextWorkshopId?: string | null;
}) {
    const searchParams = new URLSearchParams();

    if (params?.clientApiKey) {
        searchParams.set("client", params.clientApiKey);
    }

    if (params?.clientId) {
        searchParams.set("clientId", params.clientId);
    }

    if (params?.contextWorkshopId) {
        searchParams.set("contextWorkshopId", params.contextWorkshopId);
    }

    const query = searchParams.toString();
    // Response varies only by the query params above, all of which the CDN keys on, so let
    // it be cached rather than forcing an origin hit every time the widget opens.
    return apiRequest<ChatbotConfigResponse>(`/api/chatbot/config${query ? `?${query}` : ""}`, {});
}

export type FaqsResponse = {
    faqs: FaqItem[];
};

export function getFaqs() {
    // Global, rarely-changing content: let the browser and CDN cache it.
    return apiRequest<FaqsResponse>("/api/faqs", {});
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
        author: "admin" | "host" | "user";
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

export function updateSupportTicketStatus(
    ticketId: string,
    accessToken: string,
    status: SupportTicket["status"]
) {
    return apiRequest<{ ticket: Pick<SupportTicket, "id" | "status"> }>(
        `/api/support/${ticketId}`,
        {
            method: "PATCH",
            accessToken,
            body: { status },
        }
    );
}

export function createSupportTicketReply(ticketId: string, accessToken: string, message: string) {
    return apiRequest<{
        reply: SupportTicket["replies"][number];
        ticket: Pick<SupportTicket, "id" | "status">;
    }>(`/api/support/${ticketId}/replies`, {
        method: "POST",
        accessToken,
        body: { message },
    });
}

/** A refused hold answers 409 with a BookingConflictCode ("BOOKINGS_CLOSED") among others. */
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
    canLeaveFeedback?: boolean;
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

/**
 * The server's price for the order it just created (POST /api/bookings/checkout, mode
 * "order_created"), in whole rupees, computed with src/lib/pricing.ts. It is what Razorpay
 * charges: the booking page shows it as the truth.
 */
export type CheckoutQuote = {
    listSubtotal: number;
    earlyBirdDiscount: number;
    couponDiscount: number;
    couponId: string | null;
    couponLabel: string | null;
    subtotal: number;
    serviceFee: number;
    total: number;
    savings: number;
};

/**
 * `code` of the 409 answers to a NEW booking (hold creation, re-hold and checkout order
 * creation), body { code, message }; read it from ApiClientError.details.code.
 * - BOOKINGS_CLOSED: the admin closed this workshop's bookings (src/lib/workshop-availability.ts).
 * - COUPON_NO_LONGER_VALID: the typed coupon code does not apply any more (order creation only).
 */
export type BookingConflictCode = "BOOKINGS_CLOSED" | "COUPON_NO_LONGER_VALID";

export type CheckoutOrderResponse = {
    mode: "order_created" | "already_confirmed" | "confirmed";
    /** Only with "order_created". */
    quote?: CheckoutQuote;
    /** Only with "order_created": the hold the order was priced for. */
    hold?: {
        id: string;
        guests: number;
        expiresAt: string;
    };
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
    couponCode?: string;
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
        if (isCommunitiesSetupIncompleteMessage(error.message)) {
            return error.message;
        }
        if (error.status >= 500) {
            return fallbackMessage;
        }
        return error.message || fallbackMessage;
    }
    return fallbackMessage;
}

export type CafePartner = {
    id: string;
    name: string;
    logo_url: string;
};

export type PlatformSettings = {
    service_fee?: number;
    hero_image_url?: string;
    special_page?: SpecialPageSettings;
    cafe_partners?: CafePartner[];
    /** https link on chat.whatsapp.com / wa.me / whatsapp.com; "" or absent means not set. */
    whatsapp_community_url?: string;
    /** Optional short sentence shown in the sold-out community popup. */
    whatsapp_community_message?: string;
    /**
     * Workshops whose bookings the admin switched off (src/lib/workshop-availability.ts). Read
     * only: written by POST /api/admin/workshops/[id]/booking-status, never by PATCH /api/settings.
     */
    closed_workshop_ids?: string[];
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
    /** null or empty = every workshop; otherwise only these workshop ids. */
    applicable_workshop_ids?: string[] | null;
    min_order_amount?: number | null;
    max_uses?: number | null;
    valid_from?: string | null;
    applicable_categories?: string[] | null;
    /**
     * How the coupon is shown, merged in from the "coupon_offers" setting (src/lib/offers.ts).
     * "hidden" (a code typed at checkout) when it has no entry.
     */
    visibility?: AdminOfferVisibility;
    /** Customer-facing name; never a code. */
    label?: string | null;
    /** Minimum seats per booking; null = none. */
    min_guests?: number | null;
    show_end_date?: boolean;
};

export type AdminOfferVisibility = "hidden" | "listed" | "auto" | "community";

/** The display fields of a coupon (stored in "coupon_offers", not in the coupons table). */
export type AdminCouponDisplayInput = {
    visibility?: AdminOfferVisibility;
    label?: string | null;
    min_guests?: number | null;
    show_end_date?: boolean;
};

export type AdminCouponRulesInput = {
    discount_type?: AdminCoupon["discount_type"];
    discount_value?: number;
    min_order_amount?: number | null;
    max_uses?: number | null;
    /** ISO with an offset; null = no start / no end. */
    valid_from?: string | null;
    valid_until?: string | null;
    applicable_workshop_ids?: string[] | null;
    is_active?: boolean;
};

export type AdminCouponsResponse = {
    coupons: AdminCoupon[];
    nextCursor?: string | null;
    /** False when the display settings could not be read: visibility etc. are then unknown. */
    offerSettingsOk?: boolean;
};

/** A coupon write that saved the coupon but not all of it (e.g. its display settings). */
export type AdminCouponWriteResponse = { coupon: AdminCoupon; warning?: string };

export function getAdminCoupons(
    accessToken: string,
    options: { limit?: number; cursor?: string | null } = {}
) {
    const query = new URLSearchParams();
    if (options.limit) query.set("limit", String(options.limit));
    if (options.cursor) query.set("cursor", options.cursor);
    const search = query.toString();
    return apiRequest<AdminCouponsResponse>(`/api/coupons${search ? `?${search}` : ""}`, {
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
        applicable_workshop_ids?: string[] | null;
    } & AdminCouponRulesInput &
        AdminCouponDisplayInput
) {
    return apiRequest<AdminCouponWriteResponse>("/api/coupons", {
        method: "POST",
        accessToken,
        body: payload,
    });
}

export function updateAdminCoupon(
    accessToken: string,
    couponId: string,
    payload: AdminCouponRulesInput & AdminCouponDisplayInput
) {
    return apiRequest<AdminCouponWriteResponse>(`/api/coupons/${couponId}`, {
        method: "PATCH",
        accessToken,
        body: payload,
    });
}

export function deleteAdminCoupon(accessToken: string, couponId: string) {
    return apiRequest<{ ok: true; id: string; warning?: string }>(`/api/coupons/${couponId}`, {
        method: "DELETE",
        accessToken,
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
        timeoutMs: API_AUTH_TIMEOUT_MS,
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
    source: "supabase";
    pagination?: {
        limit: number;
        offset: number;
        hasMore: boolean;
    };
};

export function getMyBookings(accessToken: string, options?: { limit?: number; offset?: number }) {
    const query = new URLSearchParams();
    if (options?.limit !== undefined) query.set("limit", String(options.limit));
    if (options?.offset !== undefined) query.set("offset", String(options.offset));
    const search = query.toString();

    return apiRequest<MyBookingsResponse>(`/api/bookings${search ? `?${search}` : ""}`, {
        accessToken,
        cache: "no-store",
    });
}

export async function uploadMedia(accessToken: string, file: File, options?: { crop?: string }) {
    const formData = new FormData();
    formData.append("file", file);
    if (options?.crop) {
        formData.append("crop", options.crop);
    }

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

export type AdminFeedback = AdminFeedbackResponse["feedback"][number];

export type AdminFeedbackUpdate = {
    id: string;
    user_id?: string;
    workshop_id?: string;
    rating?: number | null;
    comment?: string;
    photos?: string[];
    video_url?: string | null;
    created_at?: string;
    updated_at?: string;
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
    return apiRequest<{ feedback: AdminFeedbackUpdate }>(`/api/admin/feedback/${feedbackId}`, {
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

export type AdminCommunityPhoto = {
    id: string;
    imageUrl: string;
    altText: string;
    sortOrder: number;
    isActive: boolean;
    createdAt: string;
};

export type AdminCommunityPhotosResponse = {
    photos: AdminCommunityPhoto[];
};

export function getAdminCommunityPhotos(accessToken: string) {
    return apiRequest<AdminCommunityPhotosResponse>("/api/admin/community-photos", {
        accessToken,
        cache: "no-store",
    });
}

export function createAdminCommunityPhoto(
    accessToken: string,
    payload: {
        imageUrl: string;
        altText?: string;
        sortOrder?: number;
        isActive?: boolean;
    }
) {
    return apiRequest<{ photo: AdminCommunityPhoto }>("/api/admin/community-photos", {
        method: "POST",
        accessToken,
        body: payload,
    });
}

export function updateAdminCommunityPhoto(
    accessToken: string,
    photoId: string,
    payload: {
        imageUrl?: string;
        altText?: string;
        sortOrder?: number;
        isActive?: boolean;
    }
) {
    return apiRequest<{ photo: AdminCommunityPhoto }>(`/api/admin/community-photos/${photoId}`, {
        method: "PATCH",
        accessToken,
        body: payload,
    });
}

export function deleteAdminCommunityPhoto(accessToken: string, photoId: string) {
    return apiRequest<{ success: boolean }>(`/api/admin/community-photos/${photoId}`, {
        method: "DELETE",
        accessToken,
    });
}

export type AdminWorkshopsResponse = {
    data: Workshop[];
    /** Fresh "Bookings closed" ids; closedWorkshopIdsOk is false when they could not be read. */
    closedWorkshopIds?: string[];
    closedWorkshopIdsOk?: boolean;
};

export function getAdminWorkshops(accessToken: string) {
    return apiRequest<AdminWorkshopsResponse>("/api/admin/workshops", {
        accessToken,
        cache: "no-store",
    });
}

/** The admin "Bookings" switch of one workshop (src/lib/workshop-availability.ts). */
export type AdminWorkshopBookingStatusResponse = {
    workshopId: string;
    closed: boolean;
    /** The whole stored list after the change (or as read). */
    closedWorkshopIds: string[];
};

export function getAdminWorkshopBookingStatus(accessToken: string, workshopId: string) {
    return apiRequest<AdminWorkshopBookingStatusResponse>(
        `/api/admin/workshops/${encodeURIComponent(workshopId)}/booking-status`,
        { accessToken, cache: "no-store" }
    );
}

/**
 * Switches new bookings off (closed: true) or back on. 503 { code: "READ_FAILED" } means the
 * current list could not be read and nothing was changed.
 */
export function setAdminWorkshopBookingsClosed(
    accessToken: string,
    workshopId: string,
    closed: boolean
) {
    return apiRequest<AdminWorkshopBookingStatusResponse>(
        `/api/admin/workshops/${encodeURIComponent(workshopId)}/booking-status`,
        { method: "POST", accessToken, body: { closed } }
    );
}

export type WorkshopLibraryResponse = {
    available: boolean;
    hosts: HostProfile[];
    templates: Workshop[];
};

export function getAdminWorkshopLibrary(accessToken: string) {
    return apiRequest<WorkshopLibraryResponse>("/api/admin/workshop-library", {
        accessToken,
        cache: "no-store",
    });
}

export function getHostWorkshopLibrary(accessToken: string) {
    return apiRequest<WorkshopLibraryResponse>("/api/host/workshop-library", {
        accessToken,
        cache: "no-store",
    });
}

export type AdminFaqsResponse = {
    faqs: FaqItem[];
};

export function getAdminFaqs(accessToken: string) {
    return apiRequest<AdminFaqsResponse>("/api/admin/faqs", {
        accessToken,
        cache: "no-store",
    });
}

export function createAdminFaq(
    accessToken: string,
    payload: {
        question: string;
        answer: string;
    }
) {
    return apiRequest<{ faq: FaqItem }>("/api/admin/faqs", {
        method: "POST",
        accessToken,
        body: payload,
    });
}

export function updateAdminFaq(
    accessToken: string,
    faqId: string,
    payload: {
        question?: string;
        answer?: string;
    }
) {
    return apiRequest<{ faq: FaqItem }>(`/api/admin/faqs/${faqId}`, {
        method: "PATCH",
        accessToken,
        body: payload,
    });
}

export function deleteAdminFaq(accessToken: string, faqId: string) {
    return apiRequest<{ success: boolean }>(`/api/admin/faqs/${faqId}`, {
        method: "DELETE",
        accessToken,
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

export function createHostWorkshop(accessToken: string, payload: WorkshopCreateInput) {
    return apiRequest<AdminWorkshopResponse>("/api/host/workshops", {
        method: "POST",
        accessToken,
        body: payload,
    });
}

export type HostWorkshopResponse = {
    workshop: Workshop;
    editable?: boolean;
    message?: string;
};

export function getHostWorkshop(accessToken: string, workshopId: string) {
    return apiRequest<HostWorkshopResponse>(`/api/host/workshops/${workshopId}`, {
        accessToken,
        cache: "no-store",
    });
}

export function updateHostWorkshop(
    accessToken: string,
    workshopId: string,
    payload: WorkshopUpdateInput
) {
    return apiRequest<HostWorkshopResponse>(`/api/host/workshops/${workshopId}`, {
        method: "PATCH",
        accessToken,
        body: payload,
    });
}

export function deleteHostWorkshop(accessToken: string, workshopId: string) {
    return apiRequest<{ success: boolean; message?: string }>(`/api/host/workshops/${workshopId}`, {
        method: "DELETE",
        accessToken,
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

export function approveAdminWorkshop(accessToken: string, workshopId: string) {
    return apiRequest<AdminWorkshopResponse>(`/api/admin/workshops/${workshopId}/approve`, {
        method: "POST",
        accessToken,
    });
}

export function rejectAdminWorkshop(accessToken: string, workshopId: string) {
    return apiRequest<AdminWorkshopResponse>(`/api/admin/workshops/${workshopId}/reject`, {
        method: "POST",
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

export type HostChatbotClient = {
    id: string;
    name: string;
    apiKey: string;
    bookingUrl: string | null;
    embedScriptUrl: string;
    embedIframeUrl: string;
    embedSnippet: string;
};

export type HostChatbotClientResponse = {
    client: HostChatbotClient;
};

export type HostChatbotFaq = FaqItem & {
    client_id: string;
};

export type HostChatbotLead = {
    id: string;
    client_id: string;
    name: string;
    phone: string;
    query: string;
    created_at: string;
};

export type HostChatbotUnansweredQuestion = {
    id: string;
    client_id: string;
    question: string;
    created_at: string;
};

export function getHostChatbotClient(accessToken: string) {
    return apiRequest<HostChatbotClientResponse>("/api/host/chatbot/client", {
        accessToken,
        cache: "no-store",
    });
}

export function updateHostChatbotClient(
    accessToken: string,
    payload: {
        name?: string;
        bookingUrl?: string;
        rotateApiKey?: boolean;
    }
) {
    return apiRequest<HostChatbotClientResponse>("/api/host/chatbot/client", {
        method: "PATCH",
        accessToken,
        body: payload,
    });
}

export function getHostChatbotFaqs(accessToken: string) {
    return apiRequest<{ faqs: HostChatbotFaq[] }>("/api/host/chatbot/faqs", {
        accessToken,
        cache: "no-store",
    });
}

export function createHostChatbotFaq(
    accessToken: string,
    payload: {
        question: string;
        answer: string;
    }
) {
    return apiRequest<{ faq: HostChatbotFaq }>("/api/host/chatbot/faqs", {
        method: "POST",
        accessToken,
        body: payload,
    });
}

export function updateHostChatbotFaq(
    accessToken: string,
    faqId: string,
    payload: {
        question?: string;
        answer?: string;
    }
) {
    return apiRequest<{ faq: HostChatbotFaq }>(`/api/host/chatbot/faqs/${faqId}`, {
        method: "PATCH",
        accessToken,
        body: payload,
    });
}

export function deleteHostChatbotFaq(accessToken: string, faqId: string) {
    return apiRequest<{ success: boolean }>(`/api/host/chatbot/faqs/${faqId}`, {
        method: "DELETE",
        accessToken,
    });
}

export function getHostChatbotLeads(accessToken: string) {
    return apiRequest<{ leads: HostChatbotLead[] }>("/api/host/chatbot/leads", {
        accessToken,
        cache: "no-store",
    });
}

export function getHostChatbotUnansweredQuestions(accessToken: string) {
    return apiRequest<{ unansweredQuestions: HostChatbotUnansweredQuestion[] }>(
        "/api/host/chatbot/unanswered",
        {
            accessToken,
            cache: "no-store",
        }
    );
}

export type CommunityResponse = {
    community: {
        id: string;
        slug: string;
        title: string;
        summary: string;
        description: string;
        category: string;
        city: string;
        hostName: string;
        hostEmail: string;
        hostPhone: string;
        meetingFormat: string;
        meetupFrequency: string;
        coverImage: string | null;
        instagramUrl: string | null;
        websiteUrl: string | null;
        whatsappUrl: string | null;
        createdAt: string;
    };
    message?: string;
};

export function createCommunity(payload: CommunityCreateInput) {
    return apiRequest<CommunityResponse>("/api/communities", {
        method: "POST",
        body: payload,
    });
}

export type CommunityJoinResponse = {
    success: boolean;
    message: string;
};

export function submitCommunityJoinRequest(slug: string, payload: CommunityJoinInput) {
    return apiRequest<CommunityJoinResponse>(`/api/communities/${slug}/join`, {
        method: "POST",
        body: payload,
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
