import { NextResponse } from "next/server";
import {
    createSupabaseServiceClient,
    isSupabaseServiceConfigured,
} from "@/lib/supabase-server";
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
        return NextResponse.json(
            { error: "Invalid JSON webhook payload." },
            { status: 400 }
        );
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
        } catch {
            // Ack webhook even when post-processing fails to avoid retries storm.
        }
    }

    return NextResponse.json({ received: true });
}
