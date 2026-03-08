import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createHash } from "crypto";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase-server";
import { claimIdempotencyKey } from "@/lib/idempotency";
import { verifyRazorpayWebhookSignature } from "@/lib/razorpay-server";

type RazorpayWebhookPayload = {
    event?: string;
    payload?: {
        payment?: {
            entity?: {
                id?: string;
            };
        };
        refund?: {
            entity?: {
                payment_id?: string;
            };
        };
    };
};

function buildWebhookIdempotencyKey(
    payload: RazorpayWebhookPayload,
    rawBody: string,
    explicitEventId: string | null
) {
    if (explicitEventId) return explicitEventId;

    const paymentId = payload.payload?.payment?.entity?.id;
    const refundPaymentId = payload.payload?.refund?.entity?.payment_id;
    if (payload.event && paymentId) {
        return `${payload.event}:${paymentId}`;
    }
    if (payload.event && refundPaymentId) {
        return `${payload.event}:${refundPaymentId}`;
    }

    const hash = createHash("sha256").update(rawBody).digest("hex");
    return `${payload.event || "unknown"}:${hash}`;
}

export async function POST(request: Request) {
    const signature = request.headers.get("x-razorpay-signature");
    if (!signature) {
        return NextResponse.json(
            { error: "Missing Razorpay webhook signature header." },
            { status: 400 }
        );
    }

    const rawBody = await request.text();

    try {
        const isValid = verifyRazorpayWebhookSignature({ rawBody, signature });
        if (!isValid) {
            return NextResponse.json(
                { error: "Invalid Razorpay webhook signature." },
                { status: 400 }
            );
        }
    } catch (error) {
        return NextResponse.json(
            { error: "Webhook secret is not configured.", details: String(error) },
            { status: 500 }
        );
    }

    let event: RazorpayWebhookPayload;
    try {
        event = JSON.parse(rawBody) as RazorpayWebhookPayload;
    } catch {
        return NextResponse.json({ error: "Invalid JSON webhook payload." }, { status: 400 });
    }

    const webhookEventId = request.headers.get("x-razorpay-event-id");
    const idempotencyKey = buildWebhookIdempotencyKey(event, rawBody, webhookEventId);

    const claimed = claimIdempotencyKey("razorpay-webhook", idempotencyKey, 24 * 60 * 60 * 1000);
    if (!claimed) {
        return NextResponse.json({ received: true, duplicate: true });
    }

    if (isSupabaseServiceConfigured) {
        try {
            const serviceClient = createSupabaseServiceClient();

            const paymentId = event.payload?.payment?.entity?.id;
            const refundPaymentId = event.payload?.refund?.entity?.payment_id;

            if (event.event === "payment.captured" && paymentId) {
                await serviceClient
                    .from("bookings")
                    .update({ status: "confirmed" })
                    .eq("payment_intent_id", paymentId);
            }

            if (event.event === "payment.failed" && paymentId) {
                await serviceClient
                    .from("bookings")
                    .update({ status: "cancelled" })
                    .eq("payment_intent_id", paymentId);
            }

            if (event.event === "refund.processed" && refundPaymentId) {
                await serviceClient
                    .from("bookings")
                    .update({ status: "refunded" })
                    .eq("payment_intent_id", refundPaymentId);
            }
        } catch (error) {
            Sentry.captureException(error, {
                tags: {
                    layer: "payments",
                    provider: "razorpay",
                    route: "razorpay_webhook",
                },
                extra: {
                    event: event.event || null,
                    paymentId: event.payload?.payment?.entity?.id || null,
                    refundPaymentId: event.payload?.refund?.entity?.payment_id || null,
                },
            });
            // Ack webhook even when post-processing fails to avoid retries storm.
        }
    }

    return NextResponse.json({ received: true });
}
