import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { claimIdempotencyKey, releaseIdempotencyKey } from "@/lib/idempotency";
import { sendPaymentNotification } from "./payment-notifications";

vi.mock("@/lib/env", () => ({
    env: {
        PAYMENT_NOTIFICATIONS_WEBHOOK_URL: "https://hooks.example.test/payments",
        PAYMENT_NOTIFICATIONS_WEBHOOK_SECRET: "secret",
    },
}));

vi.mock("@/lib/idempotency", () => ({
    claimIdempotencyKey: vi.fn(),
    releaseIdempotencyKey: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
    captureException: vi.fn(),
    captureMessage: vi.fn(),
}));

const payload = {
    event: "booking.confirmed" as const,
    source: "bookings_checkout" as const,
    idempotencyKey: "booking-confirmed:booking-1",
    data: { booking: { id: "booking-1" } },
};

describe("sendPaymentNotification", () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal("fetch", fetchMock);
        vi.mocked(claimIdempotencyKey).mockResolvedValue(true);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("sends once and keeps the claim after a successful delivery", async () => {
        fetchMock.mockResolvedValue({ ok: true });

        const result = await sendPaymentNotification(payload);

        expect(result).toEqual({ sent: true });
        expect(releaseIdempotencyKey).not.toHaveBeenCalled();
    });

    it("does not send a duplicate", async () => {
        vi.mocked(claimIdempotencyKey).mockResolvedValue(false);

        const result = await sendPaymentNotification(payload);

        expect(result).toEqual({ sent: false, reason: "duplicate" });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    /**
     * The claim is taken before the send. Keeping it after a failure meant the notification
     * could never be re-sent for that booking for the full 7 day TTL.
     */
    it("releases the claim when the delivery fails so it can be retried", async () => {
        fetchMock.mockResolvedValue({ ok: false, status: 502, text: async () => "bad gateway" });

        const result = await sendPaymentNotification(payload);

        expect(result).toEqual({ sent: false, reason: "failed" });
        expect(releaseIdempotencyKey).toHaveBeenCalledWith(
            "payment-notification",
            "booking-confirmed:booking-1"
        );
    });

    it("releases the claim when the request itself throws", async () => {
        fetchMock.mockRejectedValue(new Error("network down"));

        const result = await sendPaymentNotification(payload);

        expect(result).toEqual({ sent: false, reason: "failed" });
        expect(releaseIdempotencyKey).toHaveBeenCalledTimes(1);
    });

    /**
     * This runs after a payment has already succeeded; an unreachable dedup store must
     * surface as "not sent", never as an exception to the checkout that called it.
     */
    it("does not throw when the idempotency claim itself fails", async () => {
        vi.mocked(claimIdempotencyKey).mockRejectedValue(new Error("store unreachable"));

        const result = await sendPaymentNotification(payload);

        expect(result).toEqual({ sent: false, reason: "claim_failed" });
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
