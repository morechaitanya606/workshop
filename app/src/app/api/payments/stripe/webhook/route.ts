import { NextResponse } from "next/server";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase-server";
import { getStripeServerClient, isStripeConfigured } from "@/lib/stripe-server";

export async function POST(request: Request) {
    if (!isStripeConfigured) {
        return NextResponse.json(
            { error: "Stripe is not configured." },
            { status: 500 }
        );
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
        return NextResponse.json(
            { error: "STRIPE_WEBHOOK_SECRET is not configured." },
            { status: 500 }
        );
    }

    const signature = request.headers.get("stripe-signature");
    if (!signature) {
        return NextResponse.json(
            { error: "Missing Stripe signature header." },
            { status: 400 }
        );
    }

    try {
        const stripe = getStripeServerClient();
        const payload = await request.text();
        const event = stripe.webhooks.constructEvent(
            payload,
            signature,
            webhookSecret
        );

        if (isSupabaseServiceConfigured) {
            const serviceClient = createSupabaseServiceClient();

            if (event.type === "payment_intent.succeeded") {
                const paymentIntent = event.data.object;
                await serviceClient
                    .from("bookings")
                    .update({ status: "confirmed" })
                    .eq("payment_intent_id", paymentIntent.id);
            }

            if (event.type === "payment_intent.payment_failed") {
                const paymentIntent = event.data.object;
                await serviceClient
                    .from("bookings")
                    .update({ status: "cancelled" })
                    .eq("payment_intent_id", paymentIntent.id);
            }
        }

        return NextResponse.json({ received: true });
    } catch (error) {
        return NextResponse.json(
            { error: "Invalid Stripe webhook payload.", details: String(error) },
            { status: 400 }
        );
    }
}
