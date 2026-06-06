import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import type { Json } from "@/lib/database.types";
import { jsonError } from "@/lib/api-auth";
import { env } from "@/lib/env";
import { claimIdempotencyKey } from "@/lib/idempotency";
import { requireSupabaseService } from "@/lib/api-helpers";

const notificationEventSchema = z.object({
    event: z.enum(["booking.confirmed", "booking.refunded"]),
    source: z.enum(["bookings_checkout", "razorpay_webhook"]),
    timestamp: z.string(),
    data: z.record(z.string(), z.unknown()),
});

type NotificationEvent = z.infer<typeof notificationEventSchema>;

type StoredNotification = NotificationEvent & {
    idempotencyKey: string;
    receivedAt: string;
};

const RECEIVER_SCOPE = "payment-notification-receiver";
const RECEIVER_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_MEMORY_EVENTS = 200;
const memoryEventStore: StoredNotification[] = [];

function storeInMemory(event: StoredNotification) {
    memoryEventStore.unshift(event);
    if (memoryEventStore.length > MAX_MEMORY_EVENTS) {
        memoryEventStore.length = MAX_MEMORY_EVENTS;
    }
}

function safeCompare(expected: string, provided: string) {
    const expectedBuffer = Buffer.from(expected);
    const providedBuffer = Buffer.from(provided);
    if (expectedBuffer.length !== providedBuffer.length) {
        return false;
    }
    return timingSafeEqual(expectedBuffer, providedBuffer);
}

function verifySignature(rawBody: string, signature: string, secret: string) {
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    return safeCompare(expected, signature);
}

function isMissingNotificationEventsTableError(error: unknown) {
    if (!error || typeof error !== "object") {
        return false;
    }

    const code = String((error as { code?: string }).code || "").toUpperCase();
    const message = String((error as { message?: string }).message || "").toLowerCase();

    return code === "42P01" || code === "PGRST205" || message.includes("payment_webhook_events");
}

async function persistNotification(event: StoredNotification) {
    const service = requireSupabaseService();
    if (!service.ok) {
        storeInMemory(event);
        return "memory" as const;
    }

    try {
        const serviceClient = service.client;
        const { error } = await serviceClient.from("payment_webhook_events").upsert(
            {
                provider: "onlyworkshop",
                event_key: event.idempotencyKey,
                event_type: event.event,
                payload: {
                    source: event.source,
                    timestamp: event.timestamp,
                    data: event.data,
                } as Json,
                received_at: event.receivedAt,
                processed_at: new Date().toISOString(),
            },
            { onConflict: "provider,event_key" }
        );

        if (!error) {
            return "supabase" as const;
        }

        if (isMissingNotificationEventsTableError(error)) {
            storeInMemory(event);
            return "memory" as const;
        }

        throw error;
    } catch (error) {
        Sentry.captureException(error, {
            tags: {
                layer: "payments",
                route: "internal_payments_events",
                action: "persist_notification",
            },
            extra: {
                event: event.event,
                source: event.source,
                idempotencyKey: event.idempotencyKey,
            },
        });

        storeInMemory(event);
        return "memory" as const;
    }
}

export async function POST(request: Request) {
    const signature = request.headers.get("x-onlyworkshop-signature");
    const idempotencyKey = request.headers.get("x-onlyworkshop-idempotency-key");
    const headerEvent = request.headers.get("x-onlyworkshop-event");

    if (!signature) {
        return jsonError("Missing X-OnlyWorkshop-Signature header.", 400);
    }

    if (!idempotencyKey) {
        return jsonError("Missing X-OnlyWorkshop-Idempotency-Key header.", 400);
    }

    const secret = env.PAYMENT_NOTIFICATIONS_WEBHOOK_SECRET;
    if (!secret) {
        return jsonError("PAYMENT_NOTIFICATIONS_WEBHOOK_SECRET is not configured.", 500);
    }

    const rawBody = await request.text();
    if (!verifySignature(rawBody, signature, secret)) {
        return jsonError("Invalid X-OnlyWorkshop-Signature.", 401);
    }

    let payload: unknown;
    try {
        payload = JSON.parse(rawBody);
    } catch {
        return jsonError("Invalid JSON payload.", 400);
    }

    const parsed = notificationEventSchema.safeParse(payload);
    if (!parsed.success) {
        return jsonError("Invalid notification payload.", 400, parsed.error.flatten());
    }

    const event = parsed.data;
    if (headerEvent && headerEvent !== event.event) {
        return jsonError("Event header does not match payload event.", 400);
    }

    const claimed = claimIdempotencyKey(RECEIVER_SCOPE, idempotencyKey, RECEIVER_TTL_MS);
    if (!claimed) {
        return NextResponse.json({ received: true, duplicate: true });
    }

    const storedEvent: StoredNotification = {
        ...event,
        idempotencyKey,
        receivedAt: new Date().toISOString(),
    };

    const storage = await persistNotification(storedEvent);

    Sentry.captureMessage("Payment notification received", {
        level: "info",
        tags: {
            layer: "payments",
            route: "internal_payments_events",
            event: storedEvent.event,
            source: storedEvent.source,
            storage,
        },
        extra: {
            idempotencyKey: storedEvent.idempotencyKey,
            timestamp: storedEvent.timestamp,
        },
    });

    return NextResponse.json({ received: true, storage });
}
