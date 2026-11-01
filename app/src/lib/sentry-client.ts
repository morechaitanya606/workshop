/**
 * Browser error reporting, loaded only when it is needed.
 *
 * `@sentry/nextjs` is never part of a page's first-load JavaScript: instrumentation-client.ts
 * starts it once the page has loaded and the browser is idle (or at the first uncaught error),
 * and the error boundaries report through `reportError`, which loads it on the spot. Only the
 * exports named below are bundled, so Session Replay, Feedback and Canvas recording (never used,
 * and most of the old ~174 KB gzipped download) stay out.
 */

type SentryBrowser = Pick<
    typeof import("@sentry/nextjs"),
    "init" | "captureException" | "captureRouterTransitionStart"
>;

const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

/** Production builds with a DSN only, as on the server (instrumentation.ts). */
export const isSentryEnabled = process.env.NODE_ENV === "production" && Boolean(sentryDsn);

let sentryPromise: Promise<SentryBrowser | null> | null = null;
let loadedSentry: SentryBrowser | null = null;

/** Loads and initialises Sentry once; resolves to null when it is off or failed to download. */
export function loadSentry(): Promise<SentryBrowser | null> {
    if (!isSentryEnabled || typeof window === "undefined") {
        return Promise.resolve(null);
    }

    if (!sentryPromise) {
        sentryPromise = import(
            /* webpackExports: ["init", "captureException", "captureRouterTransitionStart"] */
            "@sentry/nextjs"
        )
            .then((Sentry) => {
                // Default integrations only (errors, plus tracing at the sample rate below).
                Sentry.init({
                    dsn: sentryDsn,
                    tracesSampleRate: 0.1,
                    sendDefaultPii: false,
                });
                loadedSentry = Sentry;
                return Sentry;
            })
            .catch(() => {
                // A dropped connection: the next report tries the download again.
                sentryPromise = null;
                return null;
            });
    }

    return sentryPromise;
}

/** Sentry if it is already running, without starting a download. */
export function getLoadedSentry() {
    return loadedSentry;
}

/** Reports an error to Sentry, loading it first if needed. A no-op where Sentry is off. */
export function reportError(error: unknown, tags: Record<string, string>) {
    void loadSentry().then((Sentry) => {
        Sentry?.captureException(error, { tags });
    });
}
