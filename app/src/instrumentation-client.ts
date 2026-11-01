import { runWhenPageIdle } from "@/lib/run-when-page-idle";
import { getLoadedSentry, isSentryEnabled, loadSentry, reportError } from "@/lib/sentry-client";

/**
 * Sentry starts after the page has loaded and the browser is idle, not before hydration: on a
 * slow connection its download used to take bandwidth from the page itself. An uncaught error
 * before then starts it at once and is reported by hand, because Sentry's own handlers only see
 * errors raised after it is initialised; once it is, those handlers take over.
 */
function startSentryReporting() {
    const reportEarlyError = (error: unknown) => {
        if (!error) return;
        reportError(error, { layer: "web", phase: "before_sentry_init" });
        start();
    };
    const onError = (event: ErrorEvent) => reportEarlyError(event.error ?? event.message);
    const onUnhandledRejection = (event: PromiseRejectionEvent) => reportEarlyError(event.reason);

    function start() {
        void loadSentry().then((Sentry) => {
            if (!Sentry) return;
            window.removeEventListener("error", onError);
            window.removeEventListener("unhandledrejection", onUnhandledRejection);
        });
    }

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    runWhenPageIdle(start);
}

if (isSentryEnabled && typeof window !== "undefined") {
    startSentryReporting();
}

export function onRouterTransitionStart(...args: unknown[]) {
    // Only once Sentry is running: a navigation is not a reason to download it.
    const Sentry = getLoadedSentry();
    if (!Sentry) {
        return;
    }

    (Sentry.captureRouterTransitionStart as (...params: unknown[]) => void)(...args);
}
