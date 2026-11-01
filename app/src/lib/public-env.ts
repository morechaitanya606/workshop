/**
 * The public (NEXT_PUBLIC_*) configuration, safe to import from client components.
 *
 * Next.js writes each `process.env.NEXT_PUBLIC_*` read below into the browser bundle as a
 * literal at build time, so nothing here needs a schema library. `@/lib/env` validates the same
 * values with zod on the server, where a bad value stops the build with a clear message; client
 * modules used to import env.ts for these values, which put zod and the server schema (about
 * 18 KB gzipped) into every page's first-load JavaScript. Here a malformed optional value reads
 * as unset instead: throwing in the browser would break every page over one optional setting.
 *
 * Keep every read a literal `process.env.NEXT_PUBLIC_NAME`: Next.js cannot inline a computed
 * key, so `process.env[name]` is undefined in the browser.
 */

/**
 * The live site, www included (the bare domain answers 308 to it).
 *
 * The production deployment always uses this, whatever NEXT_PUBLIC_APP_URL says: a
 * `http://localhost:3000` copied from .env.local into Vercel once made every canonical URL,
 * sitemap entry, social preview image and customer email link on the live site point at
 * localhost, which Google and WhatsApp cannot reach.
 */
export const PRODUCTION_SITE_URL = "https://www.onlyworkshops.com";

/** A GA4 web stream id. A UA- (retired Universal Analytics) or GTM- id is a different product. */
export const GA_MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]+$/;

/** Blank means unset, as in env.ts. */
function readOptional(value: string | undefined) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
}

function readOptionalUrl(value: string | undefined) {
    const trimmed = readOptional(value);
    if (!trimmed) return undefined;

    try {
        new URL(trimmed);
    } catch {
        return undefined;
    }
    return trimmed;
}

function readGaMeasurementId(value: string | undefined) {
    const trimmed = readOptional(value);
    return trimmed && GA_MEASUREMENT_ID_PATTERN.test(trimmed) ? trimmed : undefined;
}

export const publicEnv = {
    NEXT_PUBLIC_APP_URL: readOptionalUrl(process.env.NEXT_PUBLIC_APP_URL),
    NEXT_PUBLIC_SUPABASE_URL: readOptionalUrl(process.env.NEXT_PUBLIC_SUPABASE_URL),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: readOptional(
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    ),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: readOptional(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    NEXT_PUBLIC_RAZORPAY_KEY_ID: readOptional(process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID),
    NEXT_PUBLIC_MAPPLS_API_KEY: readOptional(process.env.NEXT_PUBLIC_MAPPLS_API_KEY),
    NEXT_PUBLIC_POSTHOG_KEY: readOptional(process.env.NEXT_PUBLIC_POSTHOG_KEY),
    NEXT_PUBLIC_POSTHOG_HOST: readOptionalUrl(process.env.NEXT_PUBLIC_POSTHOG_HOST),
    NEXT_PUBLIC_SENTRY_DSN: readOptionalUrl(process.env.NEXT_PUBLIC_SENTRY_DSN),
    NEXT_PUBLIC_MEDIA_BASE_URL: readOptionalUrl(process.env.NEXT_PUBLIC_MEDIA_BASE_URL),
    NEXT_PUBLIC_GA_MEASUREMENT_ID: readGaMeasurementId(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID),
};

/** The browser's Supabase project and key (publishable, or the legacy anon key), or null. */
export function getPublicSupabaseConfig() {
    const url = publicEnv.NEXT_PUBLIC_SUPABASE_URL;
    const key =
        publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key) {
        return null;
    }

    return { url, key };
}
