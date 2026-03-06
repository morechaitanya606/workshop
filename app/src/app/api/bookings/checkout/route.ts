import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { bookingCheckoutSchema } from "@/lib/validators";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase-server";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { getStripeServerClient, isStripeConfigured } from "@/lib/stripe-server";
import { ensureWorkshopSeededFromMock } from "@/lib/workshop-utils";

const SERVICE_FEE = 99;

function createPaymentIntentForHold(params: {
    amount: number;
    currency: string;
    userId: string;
    workshopId: string;
    holdId: string;
}) {
    const stripe = getStripeServerClient();
    const autoConfirm = process.env.STRIPE_AUTOCONFIRM_TEST !== "false";

    const payload: Stripe.PaymentIntentCreateParams = {
        amount: params.amount * 100,
        currency: params.currency,
        metadata: {
            user_id: params.userId,
            workshop_id: params.workshopId,
            hold_id: params.holdId,
        },
    };

    if (autoConfirm) {
        payload.payment_method =
            process.env.STRIPE_TEST_PAYMENT_METHOD || "pm_card_visa";
        payload.confirm = true;
        payload.error_on_requires_action = true;
    } else {
        payload.automatic_payment_methods = { enabled: true };
    }

    return stripe.paymentIntents.create(payload);
}

export async function POST(request: NextRequest) {
    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    if (!isSupabaseServiceConfigured) {
        return NextResponse.json(
            {
                error:
                    "Supabase service role is not configured. Add SUPABASE_SERVICE_ROLE_KEY.",
            },
            { status: 500 }
        );
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
    }

    const parsed = bookingCheckoutSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            {
                error: "Booking checkout validation failed.",
                details: parsed.error.flatten(),
            },
            { status: 400 }
        );
    }

    if (!isStripeConfigured) {
        return NextResponse.json(
            {
                error:
                    "Stripe is not configured. Add STRIPE_SECRET_KEY to enable payment intents.",
            },
            { status: 500 }
        );
    }

    const payload = parsed.data;

    try {
        const serviceClient = createSupabaseServiceClient();
        await ensureWorkshopSeededFromMock(serviceClient, payload.workshopId);

        const { data: hold, error: holdError } = await serviceClient
            .from("booking_holds")
            .select(
                `
                id,
                workshop_id,
                user_id,
                guests,
                status,
                expires_at,
                workshop:workshops (
                    id,
                    title,
                    price,
                    seats_remaining
                )
            `
            )
            .eq("id", payload.holdId)
            .eq("workshop_id", payload.workshopId)
            .eq("user_id", auth.user.id)
            .single();

        if (holdError || !hold) {
            return NextResponse.json(
                { error: "Seat hold not found for this user/workshop." },
                { status: 404 }
            );
        }

        if (hold.status !== "active") {
            return NextResponse.json(
                { error: "This seat hold is no longer active." },
                { status: 409 }
            );
        }

        if (new Date(hold.expires_at).getTime() < Date.now()) {
            await serviceClient
                .from("booking_holds")
                .update({ status: "expired" })
                .eq("id", hold.id);
            return NextResponse.json(
                { error: "Seat hold expired. Please reserve seats again." },
                { status: 409 }
            );
        }

        const workshop = hold.workshop as unknown as {
            id: string;
            title: string;
            price: number;
        };

        const subtotal = Number(workshop.price || 0) * Number(hold.guests || 0);
        const total = subtotal + SERVICE_FEE;

        const paymentIntent = await createPaymentIntentForHold({
            amount: total,
            currency: "inr",
            userId: auth.user.id,
            workshopId: payload.workshopId,
            holdId: payload.holdId,
        });

        if (paymentIntent.status !== "succeeded") {
            return NextResponse.json(
                {
                    error:
                        "Payment intent created but not completed. Integrate Stripe Elements to complete card collection.",
                    paymentIntentId: paymentIntent.id,
                    paymentStatus: paymentIntent.status,
                    clientSecret: paymentIntent.client_secret,
                },
                { status: 402 }
            );
        }

        let bookingId: string | null = null;
        const { data: rpcBookingId, error: rpcError } = await serviceClient.rpc(
            "confirm_booking_from_hold",
            {
                p_hold_id: payload.holdId,
                p_user_id: auth.user.id,
                p_workshop_id: payload.workshopId,
                p_payment_provider: "stripe",
                p_payment_intent_id: paymentIntent.id,
                p_first_name: payload.firstName,
                p_last_name: payload.lastName,
                p_email: payload.email,
                p_phone: payload.phone || null,
                p_notes: payload.notes || null,
                p_service_fee: SERVICE_FEE,
            }
        );

        if (!rpcError && typeof rpcBookingId === "string") {
            bookingId = rpcBookingId;
        }

        if (!bookingId) {
            // Fallback path if RPC migration has not been applied.
            const { data: seatUpdated, error: seatUpdateError } = await serviceClient
                .from("workshops")
                .update({
                    seats_remaining: Math.max(
                        0,
                        Number((hold.workshop as { seats_remaining?: number }).seats_remaining || 0) -
                            Number(hold.guests || 0)
                    ),
                })
                .eq("id", payload.workshopId)
                .gte("seats_remaining", Number(hold.guests || 0))
                .select("id")
                .single();

            if (seatUpdateError || !seatUpdated) {
                return NextResponse.json(
                    {
                        error:
                            "Payment succeeded, but seat reservation failed. Contact support immediately.",
                        paymentIntentId: paymentIntent.id,
                        details: seatUpdateError?.message || rpcError?.message || null,
                    },
                    { status: 500 }
                );
            }

            const { data: insertedBooking, error: bookingError } = await serviceClient
                .from("bookings")
                .insert({
                    user_id: auth.user.id,
                    workshop_id: payload.workshopId,
                    hold_id: payload.holdId,
                    guests: hold.guests,
                    subtotal,
                    service_fee: SERVICE_FEE,
                    total,
                    status: "confirmed",
                    payment_provider: "stripe",
                    payment_intent_id: paymentIntent.id,
                    first_name: payload.firstName,
                    last_name: payload.lastName,
                    email: payload.email,
                    phone: payload.phone || null,
                    notes: payload.notes || null,
                })
                .select("id")
                .single();

            if (bookingError || !insertedBooking?.id) {
                return NextResponse.json(
                    {
                        error:
                            "Payment succeeded, but booking write failed. Contact support immediately.",
                        paymentIntentId: paymentIntent.id,
                        details: bookingError?.message || null,
                    },
                    { status: 500 }
                );
            }

            await serviceClient
                .from("booking_holds")
                .update({ status: "confirmed" })
                .eq("id", payload.holdId);

            bookingId = insertedBooking.id;
        }

        const { data: booking } = await serviceClient
            .from("bookings")
            .select(
                `
                id,
                guests,
                total,
                status,
                created_at,
                workshop:workshops (
                    id,
                    title,
                    date,
                    time,
                    location,
                    city,
                    cover_image
                )
            `
            )
            .eq("id", bookingId)
            .single();

        return NextResponse.json({
            booking,
            paymentIntentId: paymentIntent.id,
            paymentStatus: paymentIntent.status,
        });
    } catch (error) {
        return NextResponse.json(
            {
                error: "Checkout failed.",
                details: String(error),
            },
            { status: 500 }
        );
    }
}
