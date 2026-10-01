import { createHmac } from "crypto";
import * as Sentry from "@sentry/nextjs";
import { env } from "@/lib/env";
import { claimIdempotencyKey, releaseIdempotencyKey } from "@/lib/idempotency";

export type PaymentNotificationEvent = "booking.confirmed" | "booking.refunded";

export type PaymentNotificationSource = "bookings_checkout" | "razorpay_webhook";

type NotificationPayload = {
    event: PaymentNotificationEvent;
    source: PaymentNotificationSource;
    idempotencyKey: string;
    data: Record<string, unknown>;
};

const NOTIFICATION_SCOPE = "payment-notification";
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function getNotificationsWebhookConfig() {
    const url = env.PAYMENT_NOTIFICATIONS_WEBHOOK_URL;
    if (!url) {
        return null;
    }

    return {
        url,
        secret: env.PAYMENT_NOTIFICATIONS_WEBHOOK_SECRET || null,
    };
}

function computeSignature(secret: string, body: string) {
    return createHmac("sha256", secret).update(body).digest("hex");
}

export async function sendPaymentNotification(payload: NotificationPayload) {
    const config = getNotificationsWebhookConfig();
    if (!config) {
        return { sent: false as const, reason: "not_configured" as const };
    }

    // A notification is a side effect of a payment that has ALREADY succeeded, so a dedup
    // store that is unreachable must never surface as an exception to the caller. It used to:
    // checkout confirmed the booking, the claim threw, and the customer who had paid and been
    // booked got a 500 "Checkout failed" (and the reconcile path then ran against a good
    // booking). Treat an unreachable store as "could not notify" and move on.
    let claimed: boolean;
    try {
        claimed = await claimIdempotencyKey(
            NOTIFICATION_SCOPE,
            payload.idempotencyKey,
            DEFAULT_TTL_MS
        );
    } catch (error) {
        Sentry.captureException(error, {
            level: "warning",
            tags: {
                layer: "payments",
                route: "payment_notifications",
                subsystem: "idempotency",
            },
            extra: { event: payload.event, idempotencyKey: payload.idempotencyKey },
        });
        return { sent: false as const, reason: "claim_failed" as const };
    }
    if (!claimed) {
        return { sent: false as const, reason: "duplicate" as const };
    }

    const body = JSON.stringify({
        event: payload.event,
        source: payload.source,
        timestamp: new Date().toISOString(),
        data: payload.data,
    });

    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-OnlyWorkshop-Event": payload.event,
        "X-OnlyWorkshop-Idempotency-Key": payload.idempotencyKey,
    };

    if (config.secret) {
        headers["X-OnlyWorkshop-Signature"] = computeSignature(config.secret, body);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
        const response = await fetch(config.url, {
            method: "POST",
            headers,
            body,
            signal: controller.signal,
        });

        if (!response.ok) {
            const responseText = await response.text().catch(() => "");
            throw new Error(
                `Notification webhook returned ${response.status}${responseText ? `: ${responseText}` : ""}`
            );
        }

        return { sent: true as const };
    } catch (error) {
        Sentry.captureException(error, {
            tags: {
                layer: "payments",
                route: "payment_notifications",
            },
            extra: {
                event: payload.event,
                source: payload.source,
                idempotencyKey: payload.idempotencyKey,
                webhookUrl: config.url,
            },
        });

        // The claim was taken before the send. Keeping it after a failure meant the
        // notification could never be re-sent for this booking: every later attempt
        // short-circuited as a duplicate for the full 7-day TTL.
        await releaseIdempotencyKey(NOTIFICATION_SCOPE, payload.idempotencyKey);

        return { sent: false as const, reason: "failed" as const };
    } finally {
        clearTimeout(timeout);
    }
}
