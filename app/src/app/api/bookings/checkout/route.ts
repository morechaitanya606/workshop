import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { bookingCheckoutSchema } from "@/lib/validators";
import {
    createSupabaseServiceClient,
    isSupabaseServiceConfigured,
} from "@/lib/supabase-server";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import {
    getRazorpayKeyId,
    getRazorpayServerClient,
    isRazorpayConfigured,
    verifyRazorpayOrderSignature,
} from "@/lib/razorpay-server";
import { ensureWorkshopSeededFromMock } from "@/lib/workshop-utils";

const SERVICE_FEE = 99;
const PAYMENT_CURRENCY = "INR";
const PAYMENT_PROVIDER = "razorpay";

type HoldWithWorkshop = {
    id: string;
    workshop_id: string;
    user_id: string;
    guests: number;
    status: string;
    expires_at: string;
    workshop: {
        id: string;
        title: string;
        price: number;
        seats_remaining: number;
    } | null;
};

function toPaise(amountInRupees: number) {
    return Math.round(amountInRupees * 100);
}

function isExpired(isoDate: string) {
    return new Date(isoDate).getTime() < Date.now();
}

async function loadBookingById(serviceClient: ReturnType<typeof createSupabaseServiceClient>, bookingId: string) {
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

    return booking;
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

    if (!isRazorpayConfigured) {
        return NextResponse.json(
            {
                error:
                    "Razorpay is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.",
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

    const payload = parsed.data;
    const isPaymentConfirmation =
        Boolean(payload.razorpayOrderId) &&
        Boolean(payload.razorpayPaymentId) &&
        Boolean(payload.razorpaySignature);

    try {
        const serviceClient = createSupabaseServiceClient();
        await ensureWorkshopSeededFromMock(serviceClient, payload.workshopId);

        const { data: holdData, error: holdError } = await serviceClient
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

        const hold = holdData as HoldWithWorkshop | null;

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

        if (isExpired(hold.expires_at)) {
            await serviceClient
                .from("booking_holds")
                .update({ status: "expired" })
                .eq("id", hold.id);
            return NextResponse.json(
                { error: "Seat hold expired. Please reserve seats again." },
                { status: 409 }
            );
        }

        const workshop = hold.workshop;
        if (!workshop) {
            return NextResponse.json(
                { error: "Workshop not found for this hold." },
                { status: 404 }
            );
        }

        const subtotal = Number(workshop.price || 0) * Number(hold.guests || 0);
        const total = subtotal + SERVICE_FEE;
        const totalPaise = toPaise(total);

        const razorpay = getRazorpayServerClient();

        if (!isPaymentConfirmation) {
            const order = await razorpay.orders.create({
                amount: totalPaise,
                currency: PAYMENT_CURRENCY,
                receipt: payload.holdId,
                notes: {
                    holdId: payload.holdId,
                    workshopId: payload.workshopId,
                    userId: auth.user.id,
                },
            });

            return NextResponse.json({
                mode: "order_created",
                order: {
                    id: order.id,
                    amount: Number(order.amount || totalPaise),
                    currency: String(order.currency || PAYMENT_CURRENCY),
                    keyId: getRazorpayKeyId(),
                    name: "Only Workshop",
                    description: workshop.title,
                    prefill: {
                        name: `${payload.firstName} ${payload.lastName}`.trim(),
                        email: payload.email,
                        contact: payload.phone || undefined,
                    },
                },
                hold: {
                    id: hold.id,
                    guests: hold.guests,
                    expiresAt: hold.expires_at,
                },
            });
        }

        const signatureValid = verifyRazorpayOrderSignature({
            orderId: payload.razorpayOrderId!,
            paymentId: payload.razorpayPaymentId!,
            signature: payload.razorpaySignature!,
        });

        if (!signatureValid) {
            return NextResponse.json(
                { error: "Invalid Razorpay payment signature." },
                { status: 400 }
            );
        }

        const order = await razorpay.orders.fetch(payload.razorpayOrderId!);
        if (!order || order.id !== payload.razorpayOrderId) {
            return NextResponse.json(
                { error: "Razorpay order not found." },
                { status: 404 }
            );
        }

        if (String(order.receipt || "") !== payload.holdId) {
            return NextResponse.json(
                { error: "Order does not match the current seat hold." },
                { status: 400 }
            );
        }

        if (
            Number(order.amount || 0) !== totalPaise ||
            String(order.currency || "").toUpperCase() !== PAYMENT_CURRENCY
        ) {
            return NextResponse.json(
                { error: "Order amount mismatch for this booking." },
                { status: 400 }
            );
        }

        const payment = await razorpay.payments.fetch(payload.razorpayPaymentId!);
        if (!payment || payment.id !== payload.razorpayPaymentId) {
            return NextResponse.json(
                { error: "Razorpay payment not found." },
                { status: 404 }
            );
        }

        if (payment.order_id !== payload.razorpayOrderId) {
            return NextResponse.json(
                { error: "Payment does not belong to this order." },
                { status: 400 }
            );
        }

        if (
            Number(payment.amount || 0) !== totalPaise ||
            String(payment.currency || "").toUpperCase() !== PAYMENT_CURRENCY
        ) {
            return NextResponse.json(
                { error: "Payment amount mismatch for this booking." },
                { status: 400 }
            );
        }

        let paymentStatus = String(payment.status || "").toLowerCase();
        if (paymentStatus === "authorized") {
            const captured = await razorpay.payments.capture(
                payload.razorpayPaymentId!,
                totalPaise,
                PAYMENT_CURRENCY
            );
            paymentStatus = String(captured.status || "").toLowerCase();
        }

        if (paymentStatus !== "captured") {
            return NextResponse.json(
                {
                    error: "Payment is not captured yet.",
                    paymentStatus,
                },
                { status: 402 }
            );
        }

        const { data: existingBooking } = await serviceClient
            .from("bookings")
            .select("id")
            .eq("payment_intent_id", payload.razorpayPaymentId!)
            .maybeSingle();

        if (existingBooking?.id) {
            const booking = await loadBookingById(serviceClient, existingBooking.id);
            return NextResponse.json({
                mode: "already_confirmed",
                booking,
                paymentId: payload.razorpayPaymentId,
                paymentStatus,
            });
        }

        let bookingId: string | null = null;
        const { data: rpcBookingId, error: rpcError } = await serviceClient.rpc(
            "confirm_booking_from_hold",
            {
                p_hold_id: payload.holdId,
                p_user_id: auth.user.id,
                p_workshop_id: payload.workshopId,
                p_payment_provider: PAYMENT_PROVIDER,
                p_payment_intent_id: payload.razorpayPaymentId!,
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
                        Number(hold.workshop?.seats_remaining || 0) -
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
                        paymentId: payload.razorpayPaymentId,
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
                    payment_provider: PAYMENT_PROVIDER,
                    payment_intent_id: payload.razorpayPaymentId!,
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
                        paymentId: payload.razorpayPaymentId,
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

        if (!bookingId) {
            return NextResponse.json(
                { error: "Booking confirmation failed after payment capture." },
                { status: 500 }
            );
        }

        const booking = await loadBookingById(serviceClient, bookingId);

        return NextResponse.json({
            mode: "confirmed",
            booking,
            paymentId: payload.razorpayPaymentId,
            paymentStatus,
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
