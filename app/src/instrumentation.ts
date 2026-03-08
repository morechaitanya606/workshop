import * as Sentry from "@sentry/nextjs";
import { env } from "@/lib/env";

let sentryInitialized = false;

function initSentryServer() {
    if (sentryInitialized) {
        return;
    }

    const dsn = env.SENTRY_DSN ?? env.NEXT_PUBLIC_SENTRY_DSN;
    if (!dsn) {
        return;
    }

    Sentry.init({
        dsn,
        tracesSampleRate: 0.1,
        sendDefaultPii: false,
    });
    sentryInitialized = true;
}

export async function register() {
    initSentryServer();
}
