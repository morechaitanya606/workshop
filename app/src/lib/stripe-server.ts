import Stripe from "stripe";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

export const isStripeConfigured = Boolean(stripeSecretKey);

let stripeInstance: Stripe | null = null;

export function getStripeServerClient() {
    if (!stripeSecretKey) {
        throw new Error("STRIPE_SECRET_KEY is not configured.");
    }

    if (!stripeInstance) {
        stripeInstance = new Stripe(stripeSecretKey);
    }

    return stripeInstance;
}
