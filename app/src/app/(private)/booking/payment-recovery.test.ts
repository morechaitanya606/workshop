import { describe, expect, it } from "vitest";
import { ApiClientError } from "@/lib/api-client";
import {
    classifyConfirmFailure,
    clearPaymentRecovery,
    findConfirmedBooking,
    findPaymentRecovery,
    isRefundedFailure,
    PAYMENT_RECOVERY_TTL_MS,
    paymentRecoveryKey,
    saveConfirmedBooking,
    savePaymentRecovery,
    type BookingStorage,
} from "./payment-recovery";
import type { PendingConfirmationPayload } from "./types";

function memoryStorage(): BookingStorage & { data: Map<string, string> } {
    const data = new Map<string, string>();
    return {
        data,
        get length() {
            return data.size;
        },
        key: (index) => Array.from(data.keys())[index] ?? null,
        getItem: (key) => data.get(key) ?? null,
        setItem: (key, value) => {
            data.set(key, value);
        },
        removeItem: (key) => {
            data.delete(key);
        },
    };
}

const NOW = Date.parse("2026-10-24T06:00:00.000Z");

const payload: PendingConfirmationPayload = {
    holdId: "hold-1",
    workshopId: "pottery-1",
    firstName: "Asha",
    lastName: "Rao",
    email: "asha@example.com",
    phone: "9876543210",
    notes: "",
    razorpayOrderId: "order_1",
    razorpayPaymentId: "pay_1",
    razorpaySignature: "sig_1",
};

describe("payment recovery storage", () => {
    it("saves the confirm payload keyed by hold and order, and finds it again", () => {
        const storage = memoryStorage();
        expect(savePaymentRecovery(storage, payload, { guests: 2, nowMs: NOW })).toBe(true);
        expect(storage.data.has(paymentRecoveryKey("hold-1", "order_1"))).toBe(true);

        const entry = findPaymentRecovery(storage, "pottery-1", NOW + 1000);
        expect(entry?.payload).toEqual(payload);
        expect(entry?.guests).toBe(2);
        expect(findPaymentRecovery(storage, "another-workshop", NOW)).toBeNull();
    });

    it("never stores anything but the confirm fields", () => {
        const storage = memoryStorage();
        savePaymentRecovery(
            storage,
            { ...payload, cardNumber: "4111111111111111" } as PendingConfirmationPayload,
            { guests: 1, nowMs: NOW }
        );
        const raw = Array.from(storage.data.values()).join("");
        expect(raw).not.toContain("4111");
    });

    it("expires entries after 24 hours and removes them", () => {
        const storage = memoryStorage();
        savePaymentRecovery(storage, payload, { guests: 1, nowMs: NOW });
        expect(findPaymentRecovery(storage, "pottery-1", NOW + PAYMENT_RECOVERY_TTL_MS + 1)).toBe(
            null
        );
        expect(storage.data.size).toBe(0);
    });

    it("drops unreadable entries and survives a throwing storage", () => {
        const storage = memoryStorage();
        storage.setItem("ow:booking-payment:junk", "{not json");
        expect(findPaymentRecovery(storage, "pottery-1", NOW)).toBeNull();
        expect(storage.data.size).toBe(0);

        const broken: BookingStorage = {
            length: 1,
            key: () => {
                throw new Error("blocked");
            },
            getItem: () => {
                throw new Error("blocked");
            },
            setItem: () => {
                throw new Error("quota");
            },
            removeItem: () => {
                throw new Error("blocked");
            },
        };
        expect(savePaymentRecovery(broken, payload, { guests: 1, nowMs: NOW })).toBe(false);
        expect(findPaymentRecovery(broken, "pottery-1", NOW)).toBeNull();
        expect(() => clearPaymentRecovery(broken, "hold-1", "order_1")).not.toThrow();
        expect(savePaymentRecovery(null, payload, { guests: 1, nowMs: NOW })).toBe(false);
    });

    it("clears the entry and keeps the confirmed booking for a refresh", () => {
        const storage = memoryStorage();
        savePaymentRecovery(storage, payload, { guests: 2, nowMs: NOW });
        clearPaymentRecovery(storage, "hold-1", "order_1");
        expect(findPaymentRecovery(storage, "pottery-1", NOW)).toBeNull();

        saveConfirmedBooking(
            storage,
            {
                workshopId: "pottery-1",
                holdId: "hold-1",
                guests: 2,
                attendeeName: "Asha Rao",
                booking: { id: "booking-1", total: 4097 },
            },
            NOW
        );
        const confirmed = findConfirmedBooking(storage, "hold-1", NOW + 60_000);
        expect(confirmed?.booking.id).toBe("booking-1");
        expect(confirmed?.guests).toBe(2);
        expect(findConfirmedBooking(storage, "hold-1", NOW + PAYMENT_RECOVERY_TTL_MS + 1)).toBe(
            null
        );
    });
});

describe("classifyConfirmFailure", () => {
    it("retries network failures, timeouts and server errors", () => {
        expect(classifyConfirmFailure(new ApiClientError("offline", 0))).toBe("retry");
        expect(classifyConfirmFailure(new TypeError("Failed to fetch"))).toBe("retry");
        expect(classifyConfirmFailure(new ApiClientError("boom", 503))).toBe("retry");
        expect(classifyConfirmFailure(new ApiClientError("slow down", 429))).toBe("retry");
    });

    it("asks to sign in on 401 and stops on refund or other 4xx", () => {
        expect(classifyConfirmFailure(new ApiClientError("expired", 401))).toBe("signin");
        const refunded = new ApiClientError("Refunded", 409, { code: "HOLD_EXPIRED_REFUNDED" });
        expect(classifyConfirmFailure(refunded)).toBe("final");
        expect(isRefundedFailure(refunded)).toBe(true);
        expect(classifyConfirmFailure(new ApiClientError("bad signature", 400))).toBe("final");
        expect(
            classifyConfirmFailure(new ApiClientError("x", 409, { code: "REFUND_FAILED" }))
        ).toBe("support");
    });
});
