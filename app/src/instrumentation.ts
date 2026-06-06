import * as Sentry from "@sentry/nextjs";

let sentryInitialized = false;
const sentryDsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
const shouldInitSentry = process.env.NODE_ENV === "production" && Boolean(sentryDsn);

async function initSentryServer() {
    if (sentryInitialized || !shouldInitSentry || !sentryDsn) {
        return;
    }

    Sentry.init({
        dsn: sentryDsn,
        tracesSampleRate: 0.1,
        sendDefaultPii: false,
    });
    sentryInitialized = true;
}

export async function register() {
    await initSentryServer();
}

export const onRequestError = Sentry.captureRequestError;
