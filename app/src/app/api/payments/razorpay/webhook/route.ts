import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createHash } from "crypto";
import { requireSupabaseService } from "@/lib/api-helpers";
import { jsonError } from "@/lib/api-auth";
import { getRequestId } from "@/lib/api-route";
import {
    claimIdempotencyLease,
    markIdempotencyKeyProcessed,
    releaseIdempotencyKey,
} from "@/lib/idempotency";
import { revalidatePath } from "next/cache";
import {
    getRazorpayServerClient,
    verifyRazorpayWebhookSignature,
    withRazorpayTimeout,
} from "@/lib/razorpay-server";
import { sendPaymentNotification } from "@/lib/payment-notifications";
import { callUntypedRpc } from "@/lib/payments-rpc";
import type { SupabaseServerClient } from "@/lib/supabase-server";

const WEBHOOK_IDEMPOTENCY_SCOPE = "razorpay-webhook";

/**
 * How long one delivery may hold an event before a retry is allowed to take it over.
 *
 * The claim used to be permanent and written BEFORE the work, so a lambda killed mid-event
 * burned the event: Razorpay's retry hit the key and was ACKed as a duplicate. Vercel caps
 * the function well inside this window, so a lease that old belongs to a dead invocation.
 */
const WEBHOOK_LEASE_MS = 5 * 60 * 1000;

type RazorpayWebhookPayload = {
    event?: string;
    payload?: {
        payment?: {
            entity?: {
                id?: string;
                /** Paise. Present on payment.* events. */
                amount?: number;
                /** Paise already refunded against this payment. */
                amount_refunded?: number;
                /** Unix seconds. Used to stop retrying a capture whose booking never came. */
                created_at?: number;
            };
        };
        refund?: {
            entity?: {
                payment_id?: string;
                /** Paise refunded by THIS refund event. */
                amount?: number;
            };
        };
    };
};

type BookingNotificationRow = {
    id: string;
    user_id: string;
    workshop_id: string;
    guests: number;
    subtotal: number;
    total: number;
    status: "confirmed" | "cancelled" | "refunded";
    payment_intent_id: string | null;
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
    created_at: string;
    workshop: {
        id: string;
        title: string;
        date: string;
        time: string;
        location: string;
        city: string;
        host_id: string | null;
    } | null;
};

const HOST_PLATFORM_FEE_PERCENT = 0.1;

/**
 * Statuses a late-arriving `payment.captured` or `payment.failed` must never overwrite.
 *
 * Razorpay does not guarantee ordering and retries a failed delivery for up to 24 hours,
 * so a delayed capture can land after a refund. Writing the status unconditionally
 * resurrected refunded bookings whose seats had already gone back into inventory, then
 * re-credited the host and re-sent the confirmation email.
 */
const TERMINAL_BOOKING_STATUSES = ["refunded", "cancelled"] as const;
const TERMINAL_BOOKING_STATUS_FILTER = `(${TERMINAL_BOOKING_STATUSES.join(",")})`;

/**
 * How long a `payment.captured` may go without a booking row before we stop asking Razorpay
 * to redeliver it.
 *
 * Checkout captures and THEN inserts the booking, so a capture webhook routinely overtakes
 * its own booking by a few hundred milliseconds; that window deserves a retry. But a capture
 * that checkout compensated (refunded) has no booking and never will, and answering those
 * with 503 would burn Razorpay's full 24h retry schedule on an event nothing can act on.
 * Seat holds live 8 minutes and re-holds are capped at 30 in total, so nothing legitimate is
 * still mid-checkout after 30.
 */
const CAPTURE_WITHOUT_BOOKING_RETRY_WINDOW_MS = 30 * 60 * 1000;

function isWithinCaptureRetryWindow(paymentCreatedAtSeconds: unknown) {
    // The payload is JSON.parse output; the `created_at?: number` annotation is compile-time
    // only. Number.isFinite does not coerce, so Razorpay quoting the value would reject a
    // perfectly good timestamp and pin every delivery into the retry branch for the full 24h
    // schedule. Coerce before testing.
    const seconds = Number(paymentCreatedAtSeconds);

    if (!Number.isFinite(seconds) || seconds <= 0) {
        // No timestamp to reason about: prefer the retry, since dropping a capture silently
        // is what costs the host their payout.
        return true;
    }

    return Date.now() - seconds * 1000 < CAPTURE_WITHOUT_BOOKING_RETRY_WINDOW_MS;
}

function roundCurrency(value: number) {
    return Math.round(value * 100) / 100;
}

async function upsertHostEarningsForBookings(
    serviceClient: SupabaseServerClient,
    bookings: BookingNotificationRow[]
) {
    for (const booking of bookings) {
        if (!booking.workshop?.host_id) {
            continue;
        }

        // The host's share is workshop revenue only. Falling back to `total` folded the
        // platform service fee into the payout, so a fully discounted booking paid the host
        // out of the platform's own fee.
        const hostGross = Math.max(0, Number(booking.subtotal ?? 0));
        const feeDeducted = roundCurrency(hostGross * HOST_PLATFORM_FEE_PERCENT);
        const netAmount = roundCurrency(Math.max(0, hostGross - feeDeducted));

        // Insert-if-absent, NEVER overwrite. An upsert re-wrote amount/fee/status on every
        // redelivery, so a late or replayed `payment.captured` flipped a row that had already
        // been paid out (or reversed by a refund) back to 'available' with a fresh amount --
        // paying the host a second time.
        const { error } = await serviceClient.from("host_earnings").upsert(
            {
                host_id: booking.workshop.host_id,
                booking_id: booking.id,
                amount: netAmount,
                fee_deducted: feeDeducted,
                status: "available",
            },
            { onConflict: "booking_id", ignoreDuplicates: true }
        );

        if (error) {
            Sentry.captureException(error, {
                tags: {
                    layer: "payments",
                    provider: "razorpay",
                    route: "razorpay_webhook",
                    action: "host_earnings_upsert",
                },
                extra: {
                    bookingId: booking.id,
                    hostId: booking.workshop.host_id,
                    grossAmount: hostGross,
                    feeDeducted,
                    netAmount,
                },
            });

            // Swallowing this meant the host was silently never credited and the claim was
            // then marked processed. Throw so the claim is released and Razorpay retries.
            throw error;
        }
    }
}

type RefundBookingRpcRow = {
    booking_id: string;
    workshop_id: string;
    guests: number;
    earning_was_paid: boolean;
};

/**
 * Full refund of every confirmed booking on a payment, in one database transaction.
 *
 * refund_booking (20261001110200) flips confirmed -> refunded, reverses the host's unpaid
 * earning and restores the seats together, and only the call that performs the transition
 * gets rows back -- so a second refund event restores nothing, and a failure anywhere rolls
 * the status flip back instead of stranding seats. Errors are thrown so the claim is
 * released and Razorpay redelivers.
 */
async function refundBookingsForPayment(serviceClient: SupabaseServerClient, paymentId: string) {
    const { data, error } = await callUntypedRpc<RefundBookingRpcRow[]>(
        serviceClient,
        "refund_booking",
        { p_payment_id: paymentId }
    );

    if (error) {
        throw error;
    }

    const rows = Array.isArray(data) ? data : [];

    for (const row of rows) {
        if (row.earning_was_paid) {
            // Rows already paid out are left intact and reported: that is a clawback for a
            // human, and zeroing a paid row would hide it.
            Sentry.captureMessage(
                "Refund on an already paid-out host earning; manual clawback required.",
                {
                    level: "error",
                    tags: { layer: "payments", subsystem: "host_earnings_reversal" },
                    extra: { bookingId: row.booking_id, paymentId },
                }
            );
        }

        revalidatePath(`/workshop/${row.workshop_id}`);
    }

    if (rows.length > 0) {
        revalidatePath("/explore");
    }

    return rows;
}

/**
 * Whether a `refund.processed` event refunded the payment IN FULL.
 *
 * The event usually carries the payment entity, but not always. A missing amount used to fall
 * back to "any positive refund is a full refund" -- so a small partial refund marked the whole
 * booking refunded, returned its seats and clawed back the host. When the event cannot prove
 * the answer, ask Razorpay; when Razorpay cannot either, assume partial: leaving a booking
 * intact is recoverable, destroying it is not.
 */
async function isFullRefundEvent(event: RazorpayWebhookPayload, paymentId: string) {
    const eventPayment = event.payload?.payment?.entity;
    const refundedPaise = Number(event.payload?.refund?.entity?.amount ?? 0);

    let paymentPaise = Number(eventPayment?.amount ?? 0);
    let totalRefundedPaise =
        eventPayment?.amount_refunded === undefined || eventPayment?.amount_refunded === null
            ? Number.NaN
            : Number(eventPayment.amount_refunded);
    let paymentStatus = "";

    if (!(paymentPaise > 0) || !Number.isFinite(totalRefundedPaise)) {
        const payment = await withRazorpayTimeout(() =>
            getRazorpayServerClient().payments.fetch(paymentId)
        );
        paymentPaise = Number(payment?.amount ?? 0);
        totalRefundedPaise = Number(payment?.amount_refunded ?? 0);
        paymentStatus = String(payment?.status || "").toLowerCase();
    }

    const isFull =
        paymentStatus === "refunded" || (paymentPaise > 0 && totalRefundedPaise >= paymentPaise);

    return { isFull, refundedPaise, paymentPaise, totalRefundedPaise };
}

/**
 * Throws on a query failure rather than reporting an empty result.
 *
 * supabase-js returns errors in `error` instead of throwing, so dropping it made a degraded
 * PostgREST indistinguishable from "this payment has no booking" -- and the capture branch
 * now makes a decision on exactly that distinction. Swallowed there, it would ACK a capture
 * whose booking existed all along and burn the idempotency key for good.
 */
async function loadBookingsByPaymentId(
    serviceClient: SupabaseServerClient,
    paymentIntentId: string
) {
    const { data: bookingRows, error: bookingRowsError } = await serviceClient
        .from("bookings")
        .select(
            `
            id,
            user_id,
            workshop_id,
            guests,
            subtotal,
            total,
            status,
            payment_intent_id,
            first_name,
            last_name,
            email,
            phone,
            created_at
        `
        )
        .eq("payment_intent_id", paymentIntentId);

    const rows = (bookingRows || []) as Array<{
        id: string;
        user_id: string;
        workshop_id: string;
        guests: number;
        subtotal: number;
        total: number;
        status: "confirmed" | "cancelled" | "refunded";
        payment_intent_id: string | null;
        first_name: string;
        last_name: string;
        email: string;
        phone: string | null;
        created_at: string;
    }>;

    if (bookingRowsError) {
        throw bookingRowsError;
    }

    if (!rows.length) {
        return [] as BookingNotificationRow[];
    }

    const workshopIds = Array.from(new Set(rows.map((row) => row.workshop_id).filter(Boolean)));
    const { data: workshopRows, error: workshopRowsError } = await serviceClient
        .from("workshops")
        .select("id, title, date, time, location, city, host_id")
        .in("id", workshopIds);

    // Without the workshop row there is no host_id, and the host's credit would be skipped
    // silently while the event was marked processed.
    if (workshopRowsError) {
        throw workshopRowsError;
    }

    const workshopById = new Map(
        (workshopRows || []).map((workshop) => [
            workshop.id,
            {
                id: workshop.id,
                title: workshop.title,
                date: workshop.date,
                time: workshop.time,
                location: workshop.location,
                city: workshop.city,
                host_id: workshop.host_id,
            },
        ])
    );

    return rows.map((row) => ({
        ...row,
        workshop: workshopById.get(row.workshop_id) || null,
    })) as BookingNotificationRow[];
}

async function notifyBookingStatusTransitions(
    eventName: "booking.confirmed" | "booking.refunded",
    bookings: BookingNotificationRow[],
    paymentIntentId: string,
    webhookEvent: string | undefined
) {
    if (!bookings.length) return;

    await Promise.all(
        bookings.map((booking) =>
            sendPaymentNotification({
                event: eventName,
                source: "razorpay_webhook",
                idempotencyKey: `${eventName.replace(".", "-")}:${booking.id}`,
                data: {
                    booking: {
                        id: booking.id,
                        userId: booking.user_id,
                        status: booking.status,
                        guests: booking.guests,
                        total: booking.total,
                        paymentIntentId: booking.payment_intent_id,
                        createdAt: booking.created_at,
                        customer: {
                            firstName: booking.first_name,
                            lastName: booking.last_name,
                            email: booking.email,
                            phone: booking.phone,
                        },
                        workshop: booking.workshop || null,
                    },
                    context: {
                        webhookEvent: webhookEvent || null,
                        paymentIntentId,
                    },
                },
            })
        )
    );
}

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
    // Same reason as checkout: a payment that goes wrong has to be traceable from one id
    // across the Vercel log line, the Sentry event and Razorpay's own event id.
    Sentry.setTag("request_id", getRequestId(request));

    const signature = request.headers.get("x-razorpay-signature");
    if (!signature) {
        return jsonError("Missing Razorpay webhook signature header.", 400);
    }

    const rawBody = await request.text();

    try {
        const isValid = verifyRazorpayWebhookSignature({ rawBody, signature });
        if (!isValid) {
            return jsonError("Invalid Razorpay webhook signature.", 400);
        }
    } catch (error) {
        return jsonError("Webhook secret is not configured.", 500, String(error));
    }

    let event: RazorpayWebhookPayload;
    try {
        event = JSON.parse(rawBody) as RazorpayWebhookPayload;
    } catch {
        return jsonError("Invalid JSON webhook payload.", 400);
    }

    const webhookEventId = request.headers.get("x-razorpay-event-id");
    const idempotencyKey = buildWebhookIdempotencyKey(event, rawBody, webhookEventId);

    let claim: Awaited<ReturnType<typeof claimIdempotencyLease>>;
    try {
        claim = await claimIdempotencyLease(WEBHOOK_IDEMPOTENCY_SCOPE, idempotencyKey, {
            leaseMs: WEBHOOK_LEASE_MS,
            ttlMs: 24 * 60 * 60 * 1000,
        });
    } catch (error) {
        // The durable dedup store is unreachable. Processing now risks double-crediting a
        // payment, so decline and let Razorpay retry.
        Sentry.captureException(error, {
            tags: { layer: "payments", provider: "razorpay", subsystem: "idempotency" },
            extra: { event: event.event || null },
        });
        return jsonError("Idempotency store unavailable; retry later.", 503);
    }

    if (claim === "duplicate") {
        return NextResponse.json({ received: true, duplicate: true });
    }

    if (claim === "in_progress") {
        // Another delivery of this event holds an unexpired lease. ACKing would drop the
        // event if that invocation then dies; a 503 makes Razorpay come back, and by then
        // the holder has either finished (duplicate) or its lease has expired (takeover).
        return jsonError("Event is already being processed; retry later.", 503);
    }

    const service = requireSupabaseService();
    if (!service.ok) {
        // The key is already claimed, so ACKing here would burn the event permanently: the
        // retry short-circuits as a duplicate and the capture is never recorded. Give it back
        // and let Razorpay redeliver once the service role is configured again.
        await releaseIdempotencyKey(WEBHOOK_IDEMPOTENCY_SCOPE, idempotencyKey);
        return service.response;
    }

    try {
        const serviceClient = service.client;

        const paymentId = event.payload?.payment?.entity?.id;
        const refundPaymentId = event.payload?.refund?.entity?.payment_id;

        if (event.event === "payment.captured" && paymentId) {
            const { error: confirmError } = await serviceClient
                .from("bookings")
                .update({ status: "confirmed" })
                .eq("payment_intent_id", paymentId)
                .not("status", "in", TERMINAL_BOOKING_STATUS_FILTER);

            if (confirmError) {
                throw confirmError;
            }

            const confirmedBookings = await loadBookingsByPaymentId(serviceClient, paymentId);

            // Checkout captures before it inserts, so this event can legitimately arrive
            // before the booking exists. Claiming the idempotency key and ACKing anyway
            // meant the retry was discarded as a duplicate and the row that eventually
            // appeared never got its host_earnings credit or confirmation email -- the
            // host stayed permanently short-paid and the customer never got their mail.
            if (!confirmedBookings.length) {
                const paymentCreatedAt = event.payload?.payment?.entity?.created_at;

                if (isWithinCaptureRetryWindow(paymentCreatedAt)) {
                    await releaseIdempotencyKey("razorpay-webhook", idempotencyKey);
                    return jsonError("Booking not persisted yet; retry later.", 503);
                }

                Sentry.captureMessage(
                    "Razorpay payment.captured has no booking after the retry window; capture may be stranded.",
                    {
                        level: "error",
                        tags: {
                            layer: "payments",
                            provider: "razorpay",
                            route: "razorpay_webhook",
                            action: "capture_without_booking",
                        },
                        extra: { paymentId, paymentCreatedAt: paymentCreatedAt ?? null },
                    }
                );

                // No side effects ran on this path, and the 200 is what stops Razorpay
                // retrying. Holding the claim as well would make the event unreplayable:
                // claimInDatabase writes a permanent row (the 24h TTL reaches only the
                // in-memory store), so an operator who fixed the cause later could never
                // redeliver it.
                await releaseIdempotencyKey("razorpay-webhook", idempotencyKey);
                return NextResponse.json({ received: true, bookingMissing: true });
            }

            const freshlyConfirmedBookings = confirmedBookings.filter(
                (booking) => booking.status === "confirmed"
            );

            // Credit first: it is the one step here whose loss costs the host money, and it
            // now throws (and so retries) instead of being swallowed.
            await upsertHostEarningsForBookings(serviceClient, freshlyConfirmedBookings);

            await notifyBookingStatusTransitions(
                "booking.confirmed",
                freshlyConfirmedBookings,
                paymentId,
                event.event
            );

            const { sendBookingConfirmation } = await import("@/lib/email");
            await Promise.all(
                freshlyConfirmedBookings.map((booking) =>
                    sendBookingConfirmation(booking.id).catch((error) => {
                        Sentry.captureException(error, {
                            tags: {
                                layer: "payments",
                                provider: "razorpay",
                                route: "razorpay_webhook",
                                action: "booking_confirmation_email",
                            },
                            extra: {
                                bookingId: booking.id,
                            },
                        });
                    })
                )
            );
        }

        if (event.event === "payment.failed" && paymentId) {
            // A booking row only ever exists because checkout captured the payment and
            // confirm_booking_from_hold inserted it as `confirmed`; there is no pending
            // row for a failure to clean up. Razorpay neither orders nor deduplicates its
            // retries, so a `payment.failed` for an earlier attempt on the same payment id
            // could arrive AFTER the capture that succeeded. Excluding only refunded and
            // cancelled let that event flip a paid, seated booking to `cancelled` --
            // without returning the seat, reversing the host's credit or refunding anyone.
            //
            // Scoped to `pending` so it stays a no-op today and does the right thing on its
            // own if a pre-capture booking status is ever introduced.
            const { error: failedError } = await serviceClient
                .from("bookings")
                .update({ status: "cancelled" })
                .eq("payment_intent_id", paymentId)
                .eq("status", "pending");

            if (failedError) {
                throw failedError;
            }
        }

        if (event.event === "refund.processed" && refundPaymentId) {
            // A PARTIAL refund must not mark the whole booking refunded. Razorpay reports
            // the amount refunded by this event and the running total on the payment;
            // only a full refund changes booking status and returns seats. When the event
            // does not carry those figures, Razorpay is asked rather than guessed at.
            const { isFull, refundedPaise, paymentPaise, totalRefundedPaise } =
                await isFullRefundEvent(event, refundPaymentId);

            if (!isFull) {
                Sentry.captureMessage("Partial Razorpay refund recorded; booking left intact.", {
                    level: "info",
                    tags: { layer: "payments", provider: "razorpay" },
                    extra: {
                        refundPaymentId,
                        refundedPaise,
                        paymentPaise,
                        totalRefundedPaise,
                    },
                });
            } else {
                // Status flip, host-credit reversal and seat restore are ONE transaction in
                // the database; it throws on any failure so the event is retried whole.
                await refundBookingsForPayment(serviceClient, refundPaymentId);

                const refundedBookings = await loadBookingsByPaymentId(
                    serviceClient,
                    refundPaymentId
                );
                await notifyBookingStatusTransitions(
                    "booking.refunded",
                    refundedBookings.filter((booking) => booking.status === "refunded"),
                    refundPaymentId,
                    event.event
                );
            }
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

        // The key was claimed before any work was done. Leaving it claimed after a failure
        // meant one transient error discarded the event forever: Razorpay's retry would
        // short-circuit as a duplicate. Release it and ask for the retry explicitly.
        await releaseIdempotencyKey(WEBHOOK_IDEMPOTENCY_SCOPE, idempotencyKey);
        return jsonError("Webhook processing failed; retry later.", 500);
    }

    // Only now does the claim become permanent. Until here it was a lease, so an invocation
    // that died mid-event leaves a claim a retry can take over rather than a burned event.
    await markIdempotencyKeyProcessed(WEBHOOK_IDEMPOTENCY_SCOPE, idempotencyKey);

    return NextResponse.json({ received: true });
}
