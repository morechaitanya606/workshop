/**
 * Network helpers for the booking page: timeouts, 409 codes, and the two small reads the page
 * makes itself (public offers and coupon validation). On a slow or dropped connection nothing
 * here hangs or pretends a refusal: callers can always tell "offline" from "refused", so the
 * page shows a Retry instead of "Workshop not found" or "Invalid coupon".
 */

import { ApiClientError, isApiClientError, toApiErrorMessage } from "@/lib/api-client";
import type { PublicOffer, PublicOfferKind } from "@/lib/offers";
import type { AppliedCoupon } from "./types";

/** Same wording as api-client's network errors (ApiClientError with status 0). */
export const OFFLINE_MESSAGE = "You seem to be offline or on a slow connection. Please try again.";

/*
 * Backstops for requests made through api-client, which has its own (shorter) timeouts: the
 * page must never wait on a spinner forever, whatever the network does. GET may be retried
 * once inside api-client, hence the longer workshop window.
 */
export const WORKSHOP_LOAD_TIMEOUT_MS = 35_000;
export const HOLD_REQUEST_TIMEOUT_MS = 30_000;
export const ORDER_REQUEST_TIMEOUT_MS = 30_000;
/** One confirm attempt; api-client aborts a POST at about 25 s, this is the backstop. */
export const CONFIRM_ATTEMPT_TIMEOUT_MS = 28_000;
/** Offers are optional: a slow answer means "no offers", never a blocked page. */
export const OFFERS_REQUEST_TIMEOUT_MS = 6_000;
export const COUPON_REQUEST_TIMEOUT_MS = 12_000;

/** True for a dropped connection, a timeout or an aborted request (never for an HTTP answer). */
export function isNetworkFailure(error: unknown): boolean {
    if (isApiClientError(error)) return error.status === 0;
    // fetch() rejects with a TypeError when the request never got an answer.
    if (error instanceof TypeError) return true;
    const name =
        error && typeof error === "object" ? (error as { name?: unknown }).name : undefined;
    return name === "AbortError" || name === "TimeoutError";
}

/** Rejects with a status-0 ApiClientError (OFFLINE_MESSAGE) when `promise` takes longer. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ApiClientError(OFFLINE_MESSAGE, 0)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => {
        if (timer !== undefined) clearTimeout(timer);
    });
}

function detailsOf(error: unknown): Record<string, unknown> | null {
    if (!isApiClientError(error)) return null;
    const details = error.details;
    return details && typeof details === "object" ? (details as Record<string, unknown>) : null;
}

/**
 * The `code` of an API error ("BOOKINGS_CLOSED", "COUPON_NO_LONGER_VALID", "HOLD_NOT_ACTIVE",
 * ...). Hold errors carry it in `details`, checkout errors at the top of the body; api-client
 * stores either as ApiClientError.details.
 */
export function apiErrorCode(error: unknown): string | null {
    const code = detailsOf(error)?.code;
    return typeof code === "string" && code ? code : null;
}

/** HTTP status of an API error, 0 for a network failure, null for anything else. */
export function apiErrorStatus(error: unknown): number | null {
    if (isApiClientError(error)) return error.status;
    return isNetworkFailure(error) ? 0 : null;
}

/**
 * A deliberate "try again in a moment" answer: 503 WITH a `code` (checkout's own refusals, e.g.
 * COUPON_CHECK_FAILED when the offers or the code could not be read). Its text is written for
 * customers; a bare 503 from a gateway or a crash has no code and is never shown as it is.
 */
export function isRetryableRefusal(error: unknown): boolean {
    return isApiClientError(error) && error.status === 503 && apiErrorCode(error) !== null;
}

/**
 * Text for an error banner: OFFLINE_MESSAGE for a network failure; the server's own words for a
 * 4xx (a { code, message } body has no `error` field, so its `message` is used) and for a
 * retryable refusal (503 with a code); `fallback` for any other 5xx and anything unknown
 * (toApiErrorMessage).
 */
export function apiErrorText(error: unknown, fallback: string): string {
    if (isNetworkFailure(error)) return OFFLINE_MESSAGE;
    if (isApiClientError(error) && error.status < 500) {
        const message = detailsOf(error)?.message;
        if (
            typeof message === "string" &&
            message.trim() &&
            (!error.message || error.message === "Request failed.")
        ) {
            return message.trim();
        }
    }
    if (isApiClientError(error) && isRetryableRefusal(error)) {
        const own =
            error.message && error.message !== "Request failed."
                ? error.message
                : detailsOf(error)?.message;
        if (typeof own === "string" && own.trim()) return own.trim();
    }
    return toApiErrorMessage(error, fallback);
}

/* -------------------------------------------------------------------------- */
/* Public offers                                                               */
/* -------------------------------------------------------------------------- */

const COUPON_OFFER_KINDS: ReadonlySet<string> = new Set<PublicOfferKind>([
    "auto",
    "listed",
    "community",
]);

function textOrNull(value: unknown): string | null {
    return typeof value === "string" && value ? value : null;
}

function numberOrNull(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function textListOrNull(value: unknown): string[] | null {
    if (!Array.isArray(value) || value.length === 0) return null;
    return value.every((item) => typeof item === "string") ? [...value] : null;
}

/** One offer from GET /api/offers, or null when it is not a well-formed coupon offer. */
export function readPublicOffer(value: unknown): PublicOffer | null {
    if (!value || typeof value !== "object") return null;
    const raw = value as Record<string, unknown>;
    if (typeof raw.id !== "string" || !raw.id) return null;
    if (typeof raw.kind !== "string" || !COUPON_OFFER_KINDS.has(raw.kind)) return null;
    if (typeof raw.label !== "string" || !raw.label.trim()) return null;
    if (raw.discountType !== "percentage" && raw.discountType !== "fixed") return null;
    const discountValue = numberOrNull(raw.discountValue);
    if (discountValue === null || discountValue <= 0) return null;
    const kind = raw.kind as PublicOffer["kind"];
    return {
        id: raw.id,
        kind,
        label: raw.label.trim(),
        discountType: raw.discountType,
        discountValue,
        minGuests: numberOrNull(raw.minGuests),
        minOrderAmount: numberOrNull(raw.minOrderAmount),
        startsAt: textOrNull(raw.startsAt),
        availableUntil: textOrNull(raw.availableUntil),
        endsAt: textOrNull(raw.endsAt),
        code: kind === "listed" ? textOrNull(raw.code) : null,
        workshopIds: textListOrNull(raw.workshopIds),
        categories: textListOrNull(raw.categories),
    };
}

/**
 * The live coupon offers for one workshop (GET /api/offers?workshopId=). Never throws: a
 * failure, a timeout or a malformed answer is "no offers", today's behaviour.
 */
export async function fetchWorkshopOffers(
    workshopId: string,
    options: { signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<PublicOffer[]> {
    if (!workshopId) return [];
    const controller = new AbortController();
    const abort = () => controller.abort();
    options.signal?.addEventListener("abort", abort);
    const timer = setTimeout(abort, options.timeoutMs ?? OFFERS_REQUEST_TIMEOUT_MS);
    try {
        const response = await fetch(`/api/offers?workshopId=${encodeURIComponent(workshopId)}`, {
            signal: controller.signal,
        });
        if (!response.ok) return [];
        const body = (await response.json()) as { offers?: unknown } | null;
        if (!body || !Array.isArray(body.offers)) return [];
        return body.offers
            .map(readPublicOffer)
            .filter((offer): offer is PublicOffer => offer !== null);
    } catch {
        return [];
    } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", abort);
    }
}

/* -------------------------------------------------------------------------- */
/* Coupon validation                                                           */
/* -------------------------------------------------------------------------- */

export const COUPON_REJECTED_MESSAGE = "This coupon code is not valid for this order.";

/**
 * - rejected: the server says the code does not apply (remove it);
 * - unavailable: it could not be checked (offline, slow, rate limited, server error, signed
 *   out): keep whatever was applied and let the customer try again.
 */
export type CouponCheck =
    | { ok: true; coupon: AppliedCoupon }
    | { ok: false; reason: "rejected" | "unavailable"; message: string };

function positiveWhole(value: unknown): number | null {
    const number = typeof value === "number" ? value : Number.NaN;
    return Number.isInteger(number) && number > 1 ? number : null;
}

function positiveAmount(value: unknown): number | null {
    const number = typeof value === "number" ? value : Number.NaN;
    return Number.isFinite(number) && number > 0 ? number : null;
}

/** POST /api/coupons/validate with a timeout. Never throws. */
export async function checkCouponCode(params: {
    code: string;
    workshopId: string;
    /** The post-Early-Bird subtotal, which the minimum order is measured on. */
    subtotal: number;
    guests: number;
    accessToken?: string | null;
    timeoutMs?: number;
}): Promise<CouponCheck> {
    const code = params.code.trim().toUpperCase();
    if (!code) return { ok: false, reason: "rejected", message: "Enter a coupon code." };

    const controller = new AbortController();
    const timer = setTimeout(
        () => controller.abort(),
        params.timeoutMs ?? COUPON_REQUEST_TIMEOUT_MS
    );
    try {
        const response = await fetch("/api/coupons/validate", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(params.accessToken ? { Authorization: `Bearer ${params.accessToken}` } : {}),
            },
            body: JSON.stringify({
                code,
                workshopId: params.workshopId,
                subtotal: params.subtotal,
                guests: params.guests,
            }),
            cache: "no-store",
            signal: controller.signal,
        });
        const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        const serverMessage =
            typeof data.message === "string" && data.message.trim()
                ? data.message.trim()
                : typeof data.error === "string" && data.error.trim()
                  ? data.error.trim()
                  : "";

        if (response.ok && data.valid === true) {
            const type =
                data.type === "percentage" || data.type === "fixed" ? data.type : undefined;
            const discount = Number(data.discount);
            if (!type || !Number.isFinite(discount) || discount <= 0) {
                return { ok: false, reason: "rejected", message: COUPON_REJECTED_MESSAGE };
            }
            return {
                ok: true,
                coupon: {
                    code,
                    id: typeof data.id === "string" && data.id ? data.id : null,
                    discount,
                    type,
                    minGuests: positiveWhole(data.minGuests),
                    minOrderAmount: positiveAmount(data.minOrderAmount),
                    label:
                        typeof data.label === "string" && data.label.trim()
                            ? data.label.trim().slice(0, 80)
                            : null,
                },
            };
        }
        if (response.status === 401) {
            return {
                ok: false,
                reason: "unavailable",
                message: "Your session expired. Please log in again to use a coupon code.",
            };
        }
        if (response.status === 429) {
            return {
                ok: false,
                reason: "unavailable",
                message: serverMessage || "Too many attempts. Please wait a minute and try again.",
            };
        }
        if (response.status >= 500) {
            return {
                ok: false,
                reason: "unavailable",
                message: "We could not check this code right now. Please try again.",
            };
        }
        return {
            ok: false,
            reason: "rejected",
            message: serverMessage || COUPON_REJECTED_MESSAGE,
        };
    } catch {
        return { ok: false, reason: "unavailable", message: OFFLINE_MESSAGE };
    } finally {
        clearTimeout(timer);
    }
}

/** Resolves after `ms`, or as soon as `signal` aborts (then `false`). */
export function sleep(ms: number, signal?: AbortSignal): Promise<boolean> {
    return new Promise((resolve) => {
        if (signal?.aborted) {
            resolve(false);
            return;
        }
        const timer = setTimeout(() => {
            signal?.removeEventListener("abort", onAbort);
            resolve(true);
        }, ms);
        const onAbort = () => {
            clearTimeout(timer);
            resolve(false);
        };
        signal?.addEventListener("abort", onAbort, { once: true });
    });
}
