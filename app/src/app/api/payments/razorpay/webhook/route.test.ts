import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { POST } from "./route";
import { requireSupabaseService } from "@/lib/api-helpers";
import {
    claimIdempotencyLease,
    markIdempotencyKeyProcessed,
    releaseIdempotencyKey,
} from "@/lib/idempotency";
import { getRazorpayServerClient, verifyRazorpayWebhookSignature } from "@/lib/razorpay-server";
import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import { sendPaymentNotification } from "@/lib/payment-notifications";
import { sendBookingConfirmation } from "@/lib/email";

vi.mock("@/lib/api-helpers", () => ({
    requireSupabaseService: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
    jsonError: vi.fn((message: string, status = 400, details?: unknown) =>
        NextResponse.json({ error: message, details: details ?? null }, { status })
    ),
}));

vi.mock("@/lib/idempotency", () => ({
    claimIdempotencyLease: vi.fn(),
    markIdempotencyKeyProcessed: vi.fn(),
    releaseIdempotencyKey: vi.fn(),
}));

vi.mock("@/lib/razorpay-server", () => ({
    verifyRazorpayWebhookSignature: vi.fn(() => true),
    getRazorpayServerClient: vi.fn(),
    // Pass-through: the timeout guard is a transport concern, not webhook logic.
    withRazorpayTimeout: vi.fn(<T>(operation: () => Promise<T>) => operation()),
}));

vi.mock("@/lib/payment-notifications", () => ({
    sendPaymentNotification: vi.fn().mockResolvedValue({ sent: true }),
}));

vi.mock("@/lib/email", () => ({
    sendBookingConfirmation: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("next/cache", () => ({
    revalidatePath: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
    captureException: vi.fn(),
    captureMessage: vi.fn(),
    setTag: vi.fn(),
}));

/** Chainable query stub: every builder method returns the chain, awaiting yields `result`. */
function createChain(result: unknown) {
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "update", "insert", "upsert", "eq", "neq", "in", "not"]) {
        chain[method] = vi.fn(() => chain);
    }
    chain.single = vi.fn().mockResolvedValue(result);
    chain.maybeSingle = vi.fn().mockResolvedValue(result);
    chain.then = (resolve: (value: unknown) => unknown) => resolve(result);
    return chain as Record<string, ReturnType<typeof vi.fn>> & { then: unknown };
}

function confirmedBookingRow(overrides: Record<string, unknown> = {}) {
    return {
        id: "booking-1",
        user_id: "user-1",
        workshop_id: "workshop-1",
        guests: 2,
        subtotal: 3000,
        total: 3099,
        status: "confirmed",
        payment_intent_id: "pay_1",
        first_name: "A",
        last_name: "B",
        email: "a@b.c",
        phone: null,
        created_at: "2026-09-01T00:00:00.000Z",
        ...overrides,
    };
}

function webhookRequest(body: unknown, eventId = `evt_${Math.random()}`) {
    return new Request("http://localhost/api/payments/razorpay/webhook", {
        method: "POST",
        headers: {
            "x-razorpay-signature": "sig",
            "x-razorpay-event-id": eventId,
        },
        body: JSON.stringify(body),
    });
}

describe("POST /api/payments/razorpay/webhook", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(verifyRazorpayWebhookSignature).mockReturnValue(true);
        vi.mocked(claimIdempotencyLease).mockResolvedValue("claimed");
        // clearAllMocks above can drop the factory implementations; restate them.
        vi.mocked(sendPaymentNotification).mockResolvedValue({ sent: true });
        vi.mocked(sendBookingConfirmation).mockResolvedValue(undefined);
    });

    it("rejects a payload whose signature does not verify", async () => {
        vi.mocked(verifyRazorpayWebhookSignature).mockReturnValue(false);

        const response = await POST(
            webhookRequest({
                event: "payment.captured",
                payload: { payment: { entity: { id: "pay_1" } } },
            })
        );

        expect(response.status).toBe(400);
        expect(requireSupabaseService).not.toHaveBeenCalled();
    });

    /**
     * Razorpay does not guarantee ordering and retries a failed delivery for up to 24h,
     * so a delayed capture can arrive after a refund. Writing "confirmed" unconditionally
     * resurrected refunded bookings whose seats had already gone back into inventory.
     */
    it("never overwrites a terminal booking status on a late payment.captured", async () => {
        const bookingsChain = createChain({ data: [confirmedBookingRow()], error: null });
        const serviceClient = {
            from: vi.fn(() => bookingsChain),
            rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
        vi.mocked(requireSupabaseService).mockReturnValue({
            ok: true,
            client: serviceClient as never,
        });

        const response = await POST(
            webhookRequest({
                event: "payment.captured",
                payload: { payment: { entity: { id: "pay_1", amount: 189900 } } },
            })
        );

        expect(response.status).toBe(200);
        expect(bookingsChain.update).toHaveBeenCalledWith({ status: "confirmed" });
        // The guard that stops the resurrection.
        expect(bookingsChain.not).toHaveBeenCalledWith("status", "in", "(refunded,cancelled)");
    });

    /**
     * Checkout captures and THEN inserts, so a capture webhook routinely overtakes its own
     * booking row. ACKing that with the key already claimed meant Razorpay's retry was
     * discarded as a duplicate: the row that appeared a moment later never got its
     * host_earnings credit or its confirmation email, permanently.
     */
    it("asks Razorpay to retry a capture whose booking has not been inserted yet", async () => {
        const serviceClient = {
            from: vi.fn(() => createChain({ data: [], error: null })),
            rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
        vi.mocked(requireSupabaseService).mockReturnValue({
            ok: true,
            client: serviceClient as never,
        });

        const response = await POST(
            webhookRequest({
                event: "payment.captured",
                payload: {
                    payment: {
                        entity: {
                            id: "pay_1",
                            amount: 189900,
                            created_at: Math.floor(Date.now() / 1000),
                        },
                    },
                },
            })
        );

        expect(response.status).toBe(503);
        // Released, or the retry short-circuits as a duplicate and the event is lost anyway.
        expect(releaseIdempotencyKey).toHaveBeenCalledWith("razorpay-webhook", expect.any(String));
    });

    /**
     * The same "no booking" state, but long after any checkout could still be in flight --
     * a capture checkout already compensated. Retrying that for Razorpay's full 24h schedule
     * achieves nothing, so it is reported and acknowledged instead.
     */
    it("stops retrying a capture that still has no booking after the retry window", async () => {
        const serviceClient = {
            from: vi.fn(() => createChain({ data: [], error: null })),
            rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
        vi.mocked(requireSupabaseService).mockReturnValue({
            ok: true,
            client: serviceClient as never,
        });

        const response = await POST(
            webhookRequest({
                event: "payment.captured",
                payload: {
                    payment: {
                        entity: {
                            id: "pay_1",
                            amount: 189900,
                            created_at: Math.floor(Date.now() / 1000) - 2 * 60 * 60,
                        },
                    },
                },
            })
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ received: true, bookingMissing: true });
        // The 200 is what stops Razorpay retrying; the claim is released anyway so an
        // operator who fixes the cause later can still replay the event.
        expect(releaseIdempotencyKey).toHaveBeenCalledWith("razorpay-webhook", expect.any(String));
    });

    /**
     * Razorpay neither orders nor deduplicates retries, so a `payment.failed` for an earlier
     * attempt can land after the capture that succeeded. Excluding only refunded/cancelled let
     * it flip a paid, seated booking to cancelled -- no seat returned, no host credit reversed,
     * no refund issued.
     */
    /**
     * A degraded PostgREST returns an error, not rows. Reading that as "this payment has no
     * booking" would ACK a capture whose booking existed all along -- and burn the
     * idempotency key, so the retry that would have fixed it is dropped as a duplicate.
     */
    it("asks for a retry instead of ACKing when the bookings query itself fails", async () => {
        const serviceClient = {
            from: vi.fn(() => createChain({ data: null, error: { message: "statement timeout" } })),
            rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
        vi.mocked(requireSupabaseService).mockReturnValue({
            ok: true,
            client: serviceClient as never,
        });

        const response = await POST(
            webhookRequest({
                event: "payment.captured",
                payload: {
                    payment: {
                        entity: {
                            id: "pay_1",
                            amount: 189900,
                            // Old enough that the "not inserted yet" branch would have ACKed.
                            created_at: Math.floor(Date.now() / 1000) - 2 * 60 * 60,
                        },
                    },
                },
            })
        );

        expect(response.status).toBe(500);
        expect(releaseIdempotencyKey).toHaveBeenCalledWith("razorpay-webhook", expect.any(String));
    });

    /**
     * Number.isFinite does not coerce, so Razorpay quoting created_at decided whether the
     * endpoint 503d for its entire 24h retry schedule on an event nothing could act on.
     */
    it("treats a stringified created_at as a real timestamp", async () => {
        const serviceClient = {
            from: vi.fn(() => createChain({ data: [], error: null })),
            rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
        vi.mocked(requireSupabaseService).mockReturnValue({
            ok: true,
            client: serviceClient as never,
        });

        const response = await POST(
            webhookRequest({
                event: "payment.captured",
                payload: {
                    payment: {
                        entity: {
                            id: "pay_1",
                            amount: 189900,
                            created_at: String(Math.floor(Date.now() / 1000) - 2 * 60 * 60),
                        },
                    },
                },
            })
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ received: true, bookingMissing: true });
        // Nothing happened, so the event stays replayable.
        expect(releaseIdempotencyKey).toHaveBeenCalledWith("razorpay-webhook", expect.any(String));
    });

    it("never cancels a confirmed booking on a late payment.failed", async () => {
        const bookingsChain = createChain({ data: [], error: null });
        const serviceClient = {
            from: vi.fn(() => bookingsChain),
            rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
        vi.mocked(requireSupabaseService).mockReturnValue({
            ok: true,
            client: serviceClient as never,
        });

        const response = await POST(
            webhookRequest({
                event: "payment.failed",
                payload: { payment: { entity: { id: "pay_1", amount: 189900 } } },
            })
        );

        expect(response.status).toBe(200);
        // Scoped to a pre-capture status, which no booking this app writes ever has.
        expect(bookingsChain.eq).toHaveBeenCalledWith("status", "pending");
        expect(bookingsChain.not).not.toHaveBeenCalled();
    });

    it("releases the idempotency key instead of acknowledging when the service role is missing", async () => {
        vi.mocked(requireSupabaseService).mockReturnValue({
            ok: false,
            response: NextResponse.json({ error: "no service role" }, { status: 500 }),
        } as never);

        const response = await POST(
            webhookRequest({
                event: "payment.captured",
                payload: { payment: { entity: { id: "pay_1", amount: 189900 } } },
            })
        );

        expect(response.status).toBe(500);
        expect(releaseIdempotencyKey).toHaveBeenCalledWith("razorpay-webhook", expect.any(String));
    });

    function refundServiceClient(options: {
        rpcResult?: { data: unknown; error: unknown };
        bookings?: Array<Record<string, unknown>>;
    }) {
        const refundedBooking = confirmedBookingRow({ status: "refunded" });
        const rpc = vi.fn().mockResolvedValue(
            options.rpcResult ?? {
                data: [
                    {
                        booking_id: "booking-1",
                        workshop_id: "workshop-1",
                        guests: 2,
                        earning_was_paid: false,
                    },
                ],
                error: null,
            }
        );
        const serviceClient = {
            from: vi.fn((table: string) => {
                if (table === "workshops") {
                    return createChain({
                        data: [
                            {
                                id: "workshop-1",
                                title: "T",
                                date: "d",
                                time: "t",
                                location: "l",
                                city: "c",
                                host_id: "host-1",
                            },
                        ],
                        error: null,
                    });
                }
                return createChain({ data: options.bookings ?? [refundedBooking], error: null });
            }),
            rpc,
        };
        vi.mocked(requireSupabaseService).mockReturnValue({
            ok: true,
            client: serviceClient as never,
        });
        return serviceClient;
    }

    const fullRefundBody = {
        event: "refund.processed",
        payload: {
            payment: { entity: { id: "pay_1", amount: 189900, amount_refunded: 189900 } },
            refund: { entity: { payment_id: "pay_1", amount: 189900 } },
        },
    };

    /**
     * Status flip, host-credit reversal and seat restore used to be four independent
     * writes with their errors dropped. They are one database transaction now, so the
     * webhook must route a full refund through refund_booking and nothing else.
     */
    it("refunds through the atomic refund_booking function on a full refund", async () => {
        const serviceClient = refundServiceClient({});

        const response = await POST(webhookRequest(fullRefundBody));

        expect(response.status).toBe(200);
        expect(serviceClient.rpc).toHaveBeenCalledTimes(1);
        expect(serviceClient.rpc).toHaveBeenCalledWith("refund_booking", {
            p_payment_id: "pay_1",
        });
        // The route no longer restores seats or touches the earning itself.
        expect(serviceClient.rpc).not.toHaveBeenCalledWith(
            "restore_workshop_seats",
            expect.anything()
        );
        expect(serviceClient.from).not.toHaveBeenCalledWith("host_earnings");
        expect(revalidatePath).toHaveBeenCalledWith("/workshop/workshop-1");
        expect(markIdempotencyKeyProcessed).toHaveBeenCalledWith(
            "razorpay-webhook",
            expect.any(String)
        );
    });

    /**
     * A failed refund transaction must NOT be ACKed: the 500 releases the claim so Razorpay
     * redelivers, and the transaction rolled the status flip back so the retry still sees a
     * confirmed booking whose seats are owed.
     */
    it("throws, releases the claim and asks for a retry when refund_booking fails", async () => {
        refundServiceClient({
            rpcResult: { data: null, error: { message: "WORKSHOP_NOT_FOUND" } },
        });

        const response = await POST(webhookRequest(fullRefundBody));

        expect(response.status).toBe(500);
        expect(releaseIdempotencyKey).toHaveBeenCalledWith("razorpay-webhook", expect.any(String));
        expect(markIdempotencyKeyProcessed).not.toHaveBeenCalled();
    });

    it("does not restore or notify twice when a second refund event finds nothing to refund", async () => {
        // refund_booking only returns rows for the call that performed the transition.
        refundServiceClient({ rpcResult: { data: [], error: null } });

        const response = await POST(webhookRequest(fullRefundBody));

        expect(response.status).toBe(200);
        expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("reports a refund of an already paid-out host earning for manual clawback", async () => {
        refundServiceClient({
            rpcResult: {
                data: [
                    {
                        booking_id: "booking-1",
                        workshop_id: "workshop-1",
                        guests: 2,
                        earning_was_paid: true,
                    },
                ],
                error: null,
            },
        });

        const response = await POST(webhookRequest(fullRefundBody));

        expect(response.status).toBe(200);
        expect(Sentry.captureMessage).toHaveBeenCalledWith(
            expect.stringContaining("manual clawback required"),
            expect.anything()
        );
    });

    /**
     * Missing figures used to fall back to "any positive refund is a full refund", so a small
     * partial refund marked the whole booking refunded and returned its seats.
     */
    it("asks Razorpay instead of assuming a full refund when the event omits the payment amount", async () => {
        const serviceClient = refundServiceClient({});
        const fetchPayment = vi.fn().mockResolvedValue({
            id: "pay_1",
            amount: 189900,
            amount_refunded: 50000,
            status: "captured",
        });
        vi.mocked(getRazorpayServerClient).mockReturnValue({
            payments: { fetch: fetchPayment },
        } as never);

        const response = await POST(
            webhookRequest({
                event: "refund.processed",
                payload: { refund: { entity: { payment_id: "pay_1", amount: 50000 } } },
            })
        );

        expect(response.status).toBe(200);
        expect(fetchPayment).toHaveBeenCalledWith("pay_1");
        expect(serviceClient.rpc).not.toHaveBeenCalled();
    });

    it("treats a refund as full when Razorpay reports the payment as refunded", async () => {
        const serviceClient = refundServiceClient({});
        vi.mocked(getRazorpayServerClient).mockReturnValue({
            payments: {
                fetch: vi.fn().mockResolvedValue({
                    id: "pay_1",
                    amount: 189900,
                    amount_refunded: 189900,
                    status: "refunded",
                }),
            },
        } as never);

        const response = await POST(
            webhookRequest({
                event: "refund.processed",
                payload: { refund: { entity: { payment_id: "pay_1", amount: 189900 } } },
            })
        );

        expect(response.status).toBe(200);
        expect(serviceClient.rpc).toHaveBeenCalledWith("refund_booking", {
            p_payment_id: "pay_1",
        });
    });

    it("leaves the booking alone and retries when the payment cannot be fetched to size a refund", async () => {
        const serviceClient = refundServiceClient({});
        vi.mocked(getRazorpayServerClient).mockReturnValue({
            payments: { fetch: vi.fn().mockRejectedValue(new Error("razorpay down")) },
        } as never);

        const response = await POST(
            webhookRequest({
                event: "refund.processed",
                payload: { refund: { entity: { payment_id: "pay_1", amount: 189900 } } },
            })
        );

        expect(response.status).toBe(500);
        expect(serviceClient.rpc).not.toHaveBeenCalled();
        expect(releaseIdempotencyKey).toHaveBeenCalled();
    });

    it("leaves a partial refund alone", async () => {
        const earningsChain = createChain({
            data: { id: "e1", status: "available" },
            error: null,
        });
        const serviceClient = {
            from: vi.fn((table: string) =>
                table === "host_earnings" ? earningsChain : createChain({ data: [], error: null })
            ),
            rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
        vi.mocked(requireSupabaseService).mockReturnValue({
            ok: true,
            client: serviceClient as never,
        });

        const response = await POST(
            webhookRequest({
                event: "refund.processed",
                payload: {
                    payment: { entity: { id: "pay_1", amount: 189900, amount_refunded: 50000 } },
                    refund: { entity: { payment_id: "pay_1", amount: 50000 } },
                },
            })
        );

        expect(response.status).toBe(200);
        expect(earningsChain.update).not.toHaveBeenCalled();
        expect(serviceClient.rpc).not.toHaveBeenCalled();
    });

    /**
     * The earning used to be upserted unconditionally, so a replayed `payment.captured`
     * reset a row that had already been paid out (or reversed) back to 'available'.
     */
    it("credits host earnings insert-if-absent so a replay cannot reset a paid row", async () => {
        const earningsChain = createChain({ data: null, error: null });
        const serviceClient = {
            from: vi.fn((table: string) => {
                if (table === "host_earnings") return earningsChain;
                if (table === "workshops") {
                    return createChain({
                        data: [
                            {
                                id: "workshop-1",
                                title: "T",
                                date: "d",
                                time: "t",
                                location: "l",
                                city: "c",
                                host_id: "host-1",
                            },
                        ],
                        error: null,
                    });
                }
                return createChain({ data: [confirmedBookingRow()], error: null });
            }),
            rpc: vi.fn(),
        };
        vi.mocked(requireSupabaseService).mockReturnValue({
            ok: true,
            client: serviceClient as never,
        });

        const response = await POST(
            webhookRequest({
                event: "payment.captured",
                payload: { payment: { entity: { id: "pay_1", amount: 189900 } } },
            })
        );

        expect(response.status).toBe(200);
        expect(earningsChain.upsert).toHaveBeenCalledWith(
            expect.objectContaining({ booking_id: "booking-1", status: "available" }),
            { onConflict: "booking_id", ignoreDuplicates: true }
        );
    });

    it("retries instead of marking the event processed when the host credit cannot be written", async () => {
        const earningsChain = createChain({ data: null, error: { message: "boom" } });
        const serviceClient = {
            from: vi.fn((table: string) => {
                if (table === "host_earnings") return earningsChain;
                if (table === "workshops") {
                    return createChain({
                        data: [
                            {
                                id: "workshop-1",
                                title: "T",
                                date: "d",
                                time: "t",
                                location: "l",
                                city: "c",
                                host_id: "host-1",
                            },
                        ],
                        error: null,
                    });
                }
                return createChain({ data: [confirmedBookingRow()], error: null });
            }),
            rpc: vi.fn(),
        };
        vi.mocked(requireSupabaseService).mockReturnValue({
            ok: true,
            client: serviceClient as never,
        });

        const response = await POST(
            webhookRequest({
                event: "payment.captured",
                payload: { payment: { entity: { id: "pay_1", amount: 189900 } } },
            })
        );

        expect(response.status).toBe(500);
        expect(releaseIdempotencyKey).toHaveBeenCalledWith("razorpay-webhook", expect.any(String));
        expect(markIdempotencyKeyProcessed).not.toHaveBeenCalled();
    });

    it("short-circuits a duplicate event without touching the database", async () => {
        vi.mocked(claimIdempotencyLease).mockResolvedValue("duplicate");

        const response = await POST(
            webhookRequest({
                event: "payment.captured",
                payload: { payment: { entity: { id: "pay_1" } } },
            })
        );
        const body = await response.json();

        expect(body).toEqual({ received: true, duplicate: true });
        expect(requireSupabaseService).not.toHaveBeenCalled();
    });

    /**
     * Another delivery holds an unexpired lease. ACKing would lose the event if that
     * invocation dies, so Razorpay is told to come back.
     */
    it("answers 503 while another delivery of the same event is still in progress", async () => {
        vi.mocked(claimIdempotencyLease).mockResolvedValue("in_progress");

        const response = await POST(
            webhookRequest({
                event: "payment.captured",
                payload: { payment: { entity: { id: "pay_1" } } },
            })
        );

        expect(response.status).toBe(503);
        expect(requireSupabaseService).not.toHaveBeenCalled();
        expect(markIdempotencyKeyProcessed).not.toHaveBeenCalled();
    });

    it("fails closed with a 503 when the idempotency store is unavailable", async () => {
        vi.mocked(claimIdempotencyLease).mockRejectedValue(new Error("db down"));

        const response = await POST(
            webhookRequest({
                event: "payment.captured",
                payload: { payment: { entity: { id: "pay_1" } } },
            })
        );

        expect(response.status).toBe(503);
        expect(requireSupabaseService).not.toHaveBeenCalled();
    });

    it("claims the event as a 5 minute lease and marks it processed on success", async () => {
        const bookingsChain = createChain({ data: [confirmedBookingRow()], error: null });
        vi.mocked(requireSupabaseService).mockReturnValue({
            ok: true,
            client: {
                from: vi.fn(() => bookingsChain),
                rpc: vi.fn(),
            } as never,
        });

        const response = await POST(
            webhookRequest(
                {
                    event: "payment.failed",
                    payload: { payment: { entity: { id: "pay_1", amount: 189900 } } },
                },
                "evt_lease"
            )
        );

        expect(response.status).toBe(200);
        expect(claimIdempotencyLease).toHaveBeenCalledWith("razorpay-webhook", "evt_lease", {
            leaseMs: 5 * 60 * 1000,
            ttlMs: 24 * 60 * 60 * 1000,
        });
        expect(markIdempotencyKeyProcessed).toHaveBeenCalledWith("razorpay-webhook", "evt_lease");
    });
});
