import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
    getRazorpayConfig: () => ({ keyId: "rzp_test_key", keySecret: "secret" }),
    getRazorpayWebhookSecret: () => "webhook-secret",
}));

describe("razorpay-server transport bounds", () => {
    afterEach(() => {
        vi.resetModules();
    });

    /**
     * The SDK builds its axios instance from a fixed whitelist and leaves `timeout: 0`, so the
     * only way to get a request actually ABORTED rather than abandoned is to set it on the
     * instance afterwards. That reaches into SDK internals, so this test is the tripwire: if a
     * future razorpay release moves `api.rq`, every "timed out" call silently goes back to
     * holding its socket open until the upstream decides otherwise.
     */
    it("applies a real transport timeout to the SDK's own HTTP client", async () => {
        const { getRazorpayServerClient, RAZORPAY_TRANSPORT_TIMEOUT_MS } =
            await import("./razorpay-server");

        const client = getRazorpayServerClient() as unknown as {
            api?: { rq?: { defaults?: { timeout?: number } } };
        };

        expect(client.api?.rq?.defaults?.timeout).toBe(RAZORPAY_TRANSPORT_TIMEOUT_MS);
    });

    /**
     * The outer race is a backstop for the transport timeout, so it must fire strictly later --
     * otherwise it wins every time and the socket is never actually released.
     */
    it("bounds the await strictly later than the transport timeout", async () => {
        const { RAZORPAY_TIMEOUT_MS, RAZORPAY_TRANSPORT_TIMEOUT_MS } =
            await import("./razorpay-server");

        expect(RAZORPAY_TIMEOUT_MS).toBeGreaterThan(RAZORPAY_TRANSPORT_TIMEOUT_MS);
    });

    it("rejects when an operation outlives the bound, and clears its timer", async () => {
        const { withRazorpayTimeout } = await import("./razorpay-server");

        await expect(withRazorpayTimeout(() => new Promise(() => {}), 10)).rejects.toThrow(
            /timed out after 10ms/
        );
    });

    it("returns the operation's value when it resolves in time", async () => {
        const { withRazorpayTimeout } = await import("./razorpay-server");

        await expect(withRazorpayTimeout(async () => "captured", 1000)).resolves.toBe("captured");
    });
});
