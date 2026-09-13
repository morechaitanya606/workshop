import crypto from "crypto";
import Razorpay from "razorpay";
import { getRazorpayConfig, getRazorpayWebhookSecret } from "@/lib/env";

const razorpayConfig = getRazorpayConfig();
const razorpayKeyId = razorpayConfig?.keyId;
const razorpayKeySecret = razorpayConfig?.keySecret;

export const isRazorpayConfigured = Boolean(razorpayKeyId && razorpayKeySecret);

let razorpayInstance: Razorpay | null = null;

/**
 * Razorpay's SDK builds its axios instance from a fixed whitelist (`baseURL`, `headers`,
 * `auth`) and axios defaults to `timeout: 0` — i.e. wait forever. The checkout confirmation
 * path makes several sequential calls, so one slow upstream could hang the whole function
 * until Vercel kills it, after the customer's card has been charged.
 *
 * Two layers bound that, because they do different jobs:
 *
 *  - The TRANSPORT timeout, set on the SDK's own axios instance below, actually aborts the
 *    socket. Without it a "timed out" request stays in flight to completion, holding a
 *    connection for as long as the upstream wants — which is how a slow provider turns into
 *    socket exhaustion under load.
 *  - `withRazorpayTimeout` bounds the await regardless, as a backstop for the case where the
 *    SDK's internals move and the transport timeout silently stops being applied.
 *
 * Neither makes a capture safe to assume away: aborting OUR socket does not undo a capture
 * Razorpay already processed. That is why the checkout route still reconciles against
 * `payments.fetch` and refunds rather than inferring anything from a timeout.
 */
export const RAZORPAY_TRANSPORT_TIMEOUT_MS = 8000;
export const RAZORPAY_TIMEOUT_MS = 10000;

export async function withRazorpayTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number = RAZORPAY_TIMEOUT_MS
): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
        return await Promise.race([
            operation(),
            new Promise<never>((_resolve, reject) => {
                timer = setTimeout(
                    () => reject(new Error(`Razorpay request timed out after ${timeoutMs}ms.`)),
                    timeoutMs
                );
            }),
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}

/**
 * Reach into the SDK to give its axios instance a real timeout.
 *
 * The constructor accepts no timeout of its own, so this is the only way to get the request
 * actually aborted rather than merely abandoned. It is feature-detected and non-fatal: if a
 * future SDK version moves `api.rq`, payments keep working and `withRazorpayTimeout` remains
 * the bound, so this can never be the reason checkout breaks.
 */
function applyTransportTimeout(instance: Razorpay) {
    try {
        const transport = (
            instance as unknown as { api?: { rq?: { defaults?: { timeout?: number } } } }
        ).api?.rq?.defaults;

        if (transport && typeof transport === "object") {
            transport.timeout = RAZORPAY_TRANSPORT_TIMEOUT_MS;
        }
    } catch {
        // Best effort; withRazorpayTimeout still bounds every call.
    }
}

export function getRazorpayServerClient() {
    if (!razorpayKeyId || !razorpayKeySecret) {
        throw new Error("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be configured.");
    }

    if (!razorpayInstance) {
        razorpayInstance = new Razorpay({
            key_id: razorpayKeyId,
            key_secret: razorpayKeySecret,
        });

        applyTransportTimeout(razorpayInstance);
    }

    return razorpayInstance;
}

export function getRazorpayKeyId() {
    if (!razorpayKeyId) {
        throw new Error("RAZORPAY_KEY_ID must be configured.");
    }
    return razorpayKeyId;
}

function safeCompare(expected: string, provided: string) {
    const expectedBuffer = Buffer.from(expected);
    const providedBuffer = Buffer.from(provided);

    if (expectedBuffer.length !== providedBuffer.length) {
        return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

export function verifyRazorpayOrderSignature(params: {
    orderId: string;
    paymentId: string;
    signature: string;
}) {
    if (!razorpayKeySecret) {
        throw new Error("RAZORPAY_KEY_SECRET must be configured.");
    }

    const expected = crypto
        .createHmac("sha256", razorpayKeySecret)
        .update(`${params.orderId}|${params.paymentId}`)
        .digest("hex");

    return safeCompare(expected, params.signature);
}

export function verifyRazorpayWebhookSignature(params: { rawBody: string; signature: string }) {
    const expected = crypto
        .createHmac("sha256", getRazorpayWebhookSecret())
        .update(params.rawBody)
        .digest("hex");

    return safeCompare(expected, params.signature);
}
