/**
 * Payment recovery for dropped connections, browser-side only (no webhook-created bookings).
 *
 * The booking exists only once the page's confirm request reaches the server. If the network
 * drops (or the tab is closed) after Razorpay took the money, React state alone would forget
 * the payment and a refresh would offer "Pay" again. So, before confirming, the Razorpay
 * success handler saves the confirm payload here, keyed by hold + order. While an entry exists
 * the page shows "Payment received, confirming your booking..." with Pay disabled and retries
 * the confirm (the server is idempotent: a second confirm answers already_confirmed). The entry
 * is cleared on success, on a refund and on any other definitive 4xx answer, and expires after
 * 24 hours. The success result is saved too, so a refresh shows the confirmation.
 *
 * Stored: ids, the Razorpay signature, the account id and the form fields (name, email, phone,
 * notes). Never card data (Razorpay never gives the page any). Every storage access is in
 * try/catch: a private window or full storage just means no recovery, never a broken page
 * (the booking page warns the customer to keep the page open when the save failed).
 */

import { isApiClientError } from "@/lib/api-client";
import { apiErrorCode, isNetworkFailure } from "./booking-network";
import type { ConfirmedBooking, PendingConfirmationPayload } from "./types";

export const PAYMENT_RECOVERY_PREFIX = "ow:booking-payment:";
export const CONFIRMED_BOOKING_PREFIX = "ow:booking-confirmed:";
export const PAYMENT_RECOVERY_TTL_MS = 24 * 60 * 60 * 1000;
/** Waits before the 2nd, 3rd and 4th confirm attempt. */
export const CONFIRM_RETRY_DELAYS_MS = [2_000, 5_000, 10_000] as const;

/** The parts of Storage this module uses (window.localStorage, or a fake in tests). */
export type BookingStorage = {
    readonly length: number;
    key(index: number): string | null;
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
};

export type PaymentRecoveryEntry = {
    v: 1;
    savedAt: number;
    workshopId: string;
    holdId: string;
    orderId: string;
    guests: number;
    /**
     * The account that paid. On a shared phone another login must never see this payment or
     * send its proof with their own session (the server would treat them as its owner).
     */
    userId?: string;
    payload: PendingConfirmationPayload;
};

export type ConfirmedBookingRecord = {
    v: 1;
    savedAt: number;
    workshopId: string;
    holdId: string;
    guests: number;
    attendeeName: string;
    userId?: string;
    booking: ConfirmedBooking;
};

/** localStorage, or null where it cannot be used (server, blocked storage). */
export function browserStorage(): BookingStorage | null {
    try {
        if (typeof window === "undefined") return null;
        return window.localStorage ?? null;
    } catch {
        return null;
    }
}

function keysWithPrefix(storage: BookingStorage, prefix: string): string[] {
    const keys: string[] = [];
    try {
        for (let index = 0; index < storage.length; index += 1) {
            const key = storage.key(index);
            if (key && key.startsWith(prefix)) keys.push(key);
        }
    } catch {
        return [];
    }
    return keys;
}

function readJson(storage: BookingStorage, key: string): unknown {
    try {
        const raw = storage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function writeJson(storage: BookingStorage, key: string, value: unknown): boolean {
    try {
        storage.setItem(key, JSON.stringify(value));
        return true;
    } catch {
        return false;
    }
}

function removeKey(storage: BookingStorage, key: string) {
    try {
        storage.removeItem(key);
    } catch {
        // Nothing to do: the entry simply stays until it expires.
    }
}

function isText(value: unknown): value is string {
    return typeof value === "string" && value.length > 0 && value.length <= 2000;
}

function optionalText(value: unknown): string | undefined {
    return typeof value === "string" && value.length <= 2000 ? value : undefined;
}

function isFresh(savedAt: unknown, nowMs: number): savedAt is number {
    return (
        typeof savedAt === "number" &&
        Number.isFinite(savedAt) &&
        nowMs - savedAt <= PAYMENT_RECOVERY_TTL_MS &&
        // A clock that jumped back more than a few minutes: treat the entry as unreadable.
        savedAt - nowMs <= 5 * 60 * 1000
    );
}

/** Only the fields the confirm request needs, so nothing else is ever stored or sent. */
function confirmPayloadFrom(value: unknown): PendingConfirmationPayload | null {
    if (!value || typeof value !== "object") return null;
    const raw = value as Record<string, unknown>;
    if (
        !isText(raw.holdId) ||
        !isText(raw.workshopId) ||
        !isText(raw.firstName) ||
        !isText(raw.lastName) ||
        !isText(raw.email) ||
        !isText(raw.razorpayOrderId) ||
        !isText(raw.razorpayPaymentId) ||
        !isText(raw.razorpaySignature)
    ) {
        return null;
    }
    const payload: PendingConfirmationPayload = {
        holdId: raw.holdId,
        workshopId: raw.workshopId,
        firstName: raw.firstName,
        lastName: raw.lastName,
        email: raw.email,
        razorpayOrderId: raw.razorpayOrderId,
        razorpayPaymentId: raw.razorpayPaymentId,
        razorpaySignature: raw.razorpaySignature,
    };
    const phone = optionalText(raw.phone);
    const notes = optionalText(raw.notes);
    const couponCode = optionalText(raw.couponCode);
    if (phone !== undefined) payload.phone = phone;
    if (notes !== undefined) payload.notes = notes;
    if (couponCode) payload.couponCode = couponCode;
    return payload;
}

export function paymentRecoveryKey(holdId: string, orderId: string): string {
    return `${PAYMENT_RECOVERY_PREFIX}${holdId}:${orderId}`;
}

function confirmedBookingKey(holdId: string): string {
    return `${CONFIRMED_BOOKING_PREFIX}${holdId}`;
}

function readRecoveryEntry(value: unknown, nowMs: number): PaymentRecoveryEntry | null {
    if (!value || typeof value !== "object") return null;
    const raw = value as Record<string, unknown>;
    if (raw.v !== 1 || !isFresh(raw.savedAt, nowMs)) return null;
    const payload = confirmPayloadFrom(raw.payload);
    if (!payload) return null;
    const guests = Number(raw.guests);
    return {
        v: 1,
        savedAt: raw.savedAt,
        workshopId: payload.workshopId,
        holdId: payload.holdId,
        orderId: payload.razorpayOrderId,
        guests: Number.isInteger(guests) && guests > 0 ? guests : 1,
        ...(isText(raw.userId) ? { userId: raw.userId } : {}),
        payload,
    };
}

/** Another account's record (it has an owner and it is not this one). */
function belongsToSomeoneElse(owner: string | undefined, userId: string | null | undefined) {
    return Boolean(userId && owner && owner !== userId);
}

/** Saves a paid order's confirm payload BEFORE the confirm request. False when it could not. */
export function savePaymentRecovery(
    storage: BookingStorage | null,
    payload: PendingConfirmationPayload,
    options: { guests: number; nowMs: number; userId?: string | null }
): boolean {
    if (!storage) return false;
    const clean = confirmPayloadFrom(payload);
    if (!clean) return false;
    const entry: PaymentRecoveryEntry = {
        v: 1,
        savedAt: options.nowMs,
        workshopId: clean.workshopId,
        holdId: clean.holdId,
        orderId: clean.razorpayOrderId,
        guests: options.guests,
        ...(isText(options.userId) ? { userId: options.userId } : {}),
        payload: clean,
    };
    return writeJson(storage, paymentRecoveryKey(clean.holdId, clean.razorpayOrderId), entry);
}

/**
 * The newest unconfirmed payment of this account for this workshop, whatever hold the page is
 * on now: a customer who paid, lost the connection and reserved again must see the payment being
 * confirmed, not a second Pay button. Expired and unreadable entries are removed on the way;
 * another account's entry is left alone (it expires on its own).
 */
export function findPaymentRecovery(
    storage: BookingStorage | null,
    workshopId: string,
    nowMs: number,
    userId?: string | null
): PaymentRecoveryEntry | null {
    if (!storage || !workshopId) return null;
    let newest: PaymentRecoveryEntry | null = null;
    for (const key of keysWithPrefix(storage, PAYMENT_RECOVERY_PREFIX)) {
        const entry = readRecoveryEntry(readJson(storage, key), nowMs);
        if (!entry || key !== paymentRecoveryKey(entry.holdId, entry.orderId)) {
            removeKey(storage, key);
            continue;
        }
        if (entry.workshopId !== workshopId) continue;
        if (belongsToSomeoneElse(entry.userId, userId)) continue;
        if (!newest || entry.savedAt > newest.savedAt) newest = entry;
    }
    return newest;
}

export function clearPaymentRecovery(
    storage: BookingStorage | null,
    holdId: string,
    orderId: string
) {
    if (storage) removeKey(storage, paymentRecoveryKey(holdId, orderId));
}

/** Saves a confirmed booking so a refresh of the same hold shows the confirmation. */
export function saveConfirmedBooking(
    storage: BookingStorage | null,
    record: Omit<ConfirmedBookingRecord, "v" | "savedAt">,
    nowMs: number
): boolean {
    if (!storage || !isText(record.holdId) || !isText(record.booking?.id)) return false;
    const value: ConfirmedBookingRecord = { v: 1, savedAt: nowMs, ...record };
    return writeJson(storage, confirmedBookingKey(record.holdId), value);
}

/**
 * The confirmed booking this account saved for this hold, if any (expired ones are removed).
 * Another account's confirmation is never shown, even from a pasted or remembered link.
 */
export function findConfirmedBooking(
    storage: BookingStorage | null,
    holdId: string,
    nowMs: number,
    userId?: string | null
): ConfirmedBookingRecord | null {
    if (!storage || !holdId) return null;
    // Housekeeping: confirmed records of other holds expire like recovery entries.
    for (const key of keysWithPrefix(storage, CONFIRMED_BOOKING_PREFIX)) {
        const value = readJson(storage, key) as Record<string, unknown> | null;
        if (!value || !isFresh(value.savedAt, nowMs)) removeKey(storage, key);
    }

    const raw = readJson(storage, confirmedBookingKey(holdId)) as Record<string, unknown> | null;
    if (!raw || raw.v !== 1 || !isFresh(raw.savedAt, nowMs) || raw.holdId !== holdId) return null;
    const booking = raw.booking as Record<string, unknown> | null;
    if (!booking || !isText(booking.id) || typeof booking.total !== "number") return null;
    if (!isText(raw.workshopId)) return null;
    const owner = isText(raw.userId) ? raw.userId : undefined;
    if (belongsToSomeoneElse(owner, userId)) return null;
    const guests = Number(raw.guests);
    return {
        v: 1,
        savedAt: raw.savedAt,
        workshopId: raw.workshopId,
        holdId,
        guests: Number.isInteger(guests) && guests > 0 ? guests : 1,
        attendeeName: typeof raw.attendeeName === "string" ? raw.attendeeName : "",
        ...(owner ? { userId: owner } : {}),
        booking: raw.booking as ConfirmedBooking,
    };
}

/**
 * What a failed confirm attempt means for the saved payment:
 * - retry: no answer, a timeout, a server error, a rate limit, or 402 "payment not captured
 *   yet" (the bank is still settling a payment the customer did make); keep it and try again;
 * - signin: the session expired; keep it, ask the customer to log in, then retry;
 * - support: the server could not book AND could not refund (REFUND_FAILED); keep it, stop
 *   retrying on our own and point to support;
 * - final: a definitive answer (a refund, an invalid signature, a hold that is gone): clear it.
 */
export type ConfirmFailureKind = "retry" | "signin" | "support" | "final";

export function classifyConfirmFailure(error: unknown): ConfirmFailureKind {
    if (isNetworkFailure(error)) return "retry";
    if (!isApiClientError(error)) return "retry";
    if (error.status === 401) return "signin";
    // The checkout route says "contact support" (booking failed AND the refund did not go
    // through) with a REFUND_FAILED code on most paths and without one on the rest. Retrying
    // would only re-run its refund attempts.
    if (
        apiErrorCode(error) === "REFUND_FAILED" ||
        (error.status >= 500 && /contact support/i.test(error.message))
    ) {
        return "support";
    }
    if (
        error.status >= 500 ||
        error.status === 402 ||
        error.status === 408 ||
        error.status === 429
    ) {
        return "retry";
    }
    return "final";
}

/**
 * True when the server refunded the payment: a code ending in _REFUNDED, or a 409 whose own
 * words say so (some refund paths answer without a code).
 */
export function isRefundedFailure(error: unknown): boolean {
    if (/_REFUNDED$/.test(apiErrorCode(error) ?? "")) return true;
    return isApiClientError(error) && error.status === 409 && /\brefunded\b/i.test(error.message);
}

/** The server's refund message, always saying roughly when the money comes back. */
export function refundNoticeText(message: string): string {
    const text = message.trim() || "Your payment has been refunded.";
    return /working days/i.test(text)
        ? text
        : `${text} Refunds usually reach your account within 5-7 working days.`;
}

/**
 * The seat hold is gone ("Seat hold expired", "This seat hold is no longer active", "Seat hold
 * not found"): Pay and Try again cannot work on it any more, only reserving seats again can.
 */
export function isDeadHoldFailure(error: unknown): boolean {
    if (!isApiClientError(error)) return false;
    if (error.status !== 404 && error.status !== 409) return false;
    return apiErrorCode(error) === "HOLD_NOT_ACTIVE" || /seat hold/i.test(error.message);
}
