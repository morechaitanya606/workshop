import * as Sentry from "@sentry/nextjs";
import { publicEnv } from "@/lib/env";

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

if (publicEnv.NEXT_PUBLIC_SENTRY_DSN) {
    Sentry.init({
        dsn: publicEnv.NEXT_PUBLIC_SENTRY_DSN,
        tracesSampleRate: 0.1,
        sendDefaultPii: false,
    });
}
