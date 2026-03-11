const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const shouldInitSentry = process.env.NODE_ENV === "production" && Boolean(sentryDsn);
let sentryClientPromise: Promise<typeof import("@sentry/nextjs")> | null = null;

function getSentryClient() {
    if (!sentryClientPromise) {
        sentryClientPromise = import("@sentry/nextjs").then((Sentry) => {
            Sentry.init({
                dsn: sentryDsn,
                tracesSampleRate: 0.1,
                sendDefaultPii: false,
            });
            return Sentry;
        });
    }
    return sentryClientPromise;
}

if (shouldInitSentry) {
    void getSentryClient();
}

export function onRouterTransitionStart(...args: unknown[]) {
    if (!shouldInitSentry) {
        return;
    }

    void getSentryClient().then((Sentry) => {
        (Sentry.captureRouterTransitionStart as (...params: unknown[]) => void)(...args);
    });
}
