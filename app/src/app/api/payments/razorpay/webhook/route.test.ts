import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { POST } from "./route";
import { requireSupabaseService } from "@/lib/api-helpers";
import { claimIdempotencyKey, releaseIdempotencyKey } from "@/lib/idempotency";
import { verifyRazorpayWebhookSignature } from "@/lib/razorpay-server";

vi.mock("@/lib/api-helpers", () => ({
    requireSupabaseService: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
    jsonError: vi.fn((message: string, status = 400, details?: unknown) =>
        NextResponse.json({ error: message, details: details ?? null }, { status })
    ),
}));

vi.mock("@/lib/idempotency", () => ({
    claimIdempotencyKey: vi.fn(),
    releaseIdempotencyKey: vi.fn(),
}));

vi.mock("@/lib/razorpay-server", () => ({
    verifyRazorpayWebhookSignature: vi.fn(() => true),
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
        vi.mocked(claimIdempotencyKey).mockResolvedValue(true);
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

    /**
     * Earnings were credited at capture and never reversed, so /api/admin/payouts summed
     * refunded bookings into the next payout and real cash left the business.
     */
    it("reverses unpaid host earnings when a full refund is processed", async () => {
        const refundedBooking = {
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
        };

        const earningsChain = createChain({
            data: { id: "earning-1", status: "available" },
            error: null,
        });

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
                return createChain({ data: [refundedBooking], error: null });
            }),
            rpc: vi.fn().mockResolvedValue({ data: 10, error: null }),
        };
        vi.mocked(requireSupabaseService).mockReturnValue({
            ok: true,
            client: serviceClient as never,
        });

        const response = await POST(
            webhookRequest({
                event: "refund.processed",
                payload: {
                    payment: { entity: { id: "pay_1", amount: 189900, amount_refunded: 189900 } },
                    refund: { entity: { payment_id: "pay_1", amount: 189900 } },
                },
            })
        );

        expect(response.status).toBe(200);
        expect(earningsChain.update).toHaveBeenCalledWith({
            amount: 0,
            fee_deducted: 0,
            status: "pending",
        });
        // A row already paid out must not be silently zeroed.
        expect(earningsChain.neq).toHaveBeenCalledWith("status", "paid");
        // Seats return via the relative RPC, never an absolute write.
        expect(serviceClient.rpc).toHaveBeenCalledWith("restore_workshop_seats", {
            p_workshop_id: "workshop-1",
            p_seats: 2,
        });
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

    it("short-circuits a duplicate event without touching the database", async () => {
        vi.mocked(claimIdempotencyKey).mockResolvedValue(false);

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
});
