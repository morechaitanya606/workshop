import crypto from "crypto";
import Razorpay from "razorpay";

const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;

export const isRazorpayConfigured = Boolean(
    razorpayKeyId && razorpayKeySecret
);

let razorpayInstance: Razorpay | null = null;

export function getRazorpayServerClient() {
    if (!razorpayKeyId || !razorpayKeySecret) {
        throw new Error(
            "RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be configured."
        );
    }

    if (!razorpayInstance) {
        razorpayInstance = new Razorpay({
            key_id: razorpayKeyId,
            key_secret: razorpayKeySecret,
        });
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

export function verifyRazorpayWebhookSignature(params: {
    rawBody: string;
    signature: string;
}) {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
        throw new Error("RAZORPAY_WEBHOOK_SECRET must be configured.");
    }

    const expected = crypto
        .createHmac("sha256", webhookSecret)
        .update(params.rawBody)
        .digest("hex");

    return safeCompare(expected, params.signature);
}
