import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Guards the distinction between "built in production mode" and "is the production
 * deployment".
 *
 * Vercel builds previews and production identically with NODE_ENV=production. Requiring
 * production-only operational secrets on NODE_ENV alone therefore failed every preview and
 * branch deploy with `Missing required production environment variable(s): CRON_SECRET`,
 * while proving nothing about production itself. These tests exist so that regression cannot
 * come back quietly -- it does not show up in typecheck, lint or any other test.
 */

const BASE_ENV = {
    NEXT_PUBLIC_APP_URL: "https://example.com",
    NEXT_PUBLIC_SUPABASE_URL: "https://placeholder.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
    SUPABASE_SERVICE_ROLE_KEY: "x",
    GROQ_API_KEY: "x",
    HUGGINGFACE_API_KEY: "x",
    RAZORPAY_KEY_ID: "x",
    RAZORPAY_KEY_SECRET: "x",
    RAZORPAY_WEBHOOK_SECRET: "x",
    RESEND_API_KEY: "x",
};

/** Load env.ts fresh under a controlled environment; it reads process.env at import time. */
async function loadEnvWith(overrides: Record<string, string | undefined>) {
    vi.resetModules();

    // SKIP_ENV_VALIDATION off, so the module-load assert is genuinely exercised.
    vi.stubEnv("SKIP_ENV_VALIDATION", "");
    vi.stubEnv("CI", "true");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");

    // undefined deletes the variable. Passing "" would set it to an empty string, which the
    // zod schema rejects outright -- a different failure from the absence being tested.
    for (const [key, value] of Object.entries({ ...BASE_ENV, ...overrides })) {
        vi.stubEnv(key, value as string);
    }

    return import("./env");
}

describe("production env gate", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.resetModules();
    });

    it("does not demand runtime-only secrets of a Vercel preview build", async () => {
        const { getMissingProductionEnvVars } = await loadEnvWith({
            NODE_ENV: "production",
            VERCEL_ENV: "preview",
            CRON_SECRET: undefined,
            UPSTASH_REDIS_REST_URL: undefined,
            UPSTASH_REDIS_REST_TOKEN: undefined,
            RAZORPAY_WEBHOOK_SECRET: undefined,
            RESEND_API_KEY: undefined,
        });

        expect(getMissingProductionEnvVars()).toEqual([]);
    });

    it("demands them of the production deployment", async () => {
        const { getMissingProductionEnvVars } = await loadEnvWith({
            NODE_ENV: "production",
            VERCEL_ENV: "production",
            CRON_SECRET: undefined,
            UPSTASH_REDIS_REST_URL: undefined,
            UPSTASH_REDIS_REST_TOKEN: undefined,
        });

        const missing = getMissingProductionEnvVars();
        expect(missing).toContain("CRON_SECRET");
        expect(missing).toContain("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN");
    });

    it("is satisfied once the production deployment has them", async () => {
        const { getMissingProductionEnvVars } = await loadEnvWith({
            NODE_ENV: "production",
            VERCEL_ENV: "production",
            CRON_SECRET: "x",
            UPSTASH_REDIS_REST_URL: "https://upstash.example.com",
            UPSTASH_REDIS_REST_TOKEN: "x",
        });

        expect(getMissingProductionEnvVars()).toEqual([]);
    });

    it("does not demand the webhook secret or mail key of a preview either", async () => {
        // This assertion used to be the opposite, and it was wrong: both are read when a
        // request is served, never during the build, and requiring them failed preview
        // deploys with "Missing required production environment variable(s):
        // RAZORPAY_WEBHOOK_SECRET, RESEND_API_KEY". main does not require them at all, which
        // is why main deployed and this branch did not.
        const { getMissingProductionEnvVars } = await loadEnvWith({
            NODE_ENV: "production",
            VERCEL_ENV: "preview",
            RAZORPAY_WEBHOOK_SECRET: undefined,
            RESEND_API_KEY: undefined,
        });

        expect(getMissingProductionEnvVars()).toEqual([]);
    });

    it("demands the webhook secret and mail key of production", async () => {
        const { getMissingProductionEnvVars } = await loadEnvWith({
            NODE_ENV: "production",
            VERCEL_ENV: "production",
            CRON_SECRET: "x",
            UPSTASH_REDIS_REST_URL: "https://upstash.example.com",
            UPSTASH_REDIS_REST_TOKEN: "x",
            RAZORPAY_WEBHOOK_SECRET: undefined,
            RESEND_API_KEY: undefined,
        });

        const missing = getMissingProductionEnvVars();
        expect(missing).toContain("RAZORPAY_WEBHOOK_SECRET");
        expect(missing).toContain("RESEND_API_KEY");
    });

    it("still demands the genuinely build-time values everywhere, preview included", async () => {
        // These are baked into the client bundle or used while prerendering, so a preview
        // cannot build without them. The relaxation must not widen to these.
        const { getMissingProductionEnvVars } = await loadEnvWith({
            NODE_ENV: "production",
            VERCEL_ENV: "preview",
            NEXT_PUBLIC_SUPABASE_URL: undefined,
            SUPABASE_SERVICE_ROLE_KEY: undefined,
        });

        const missing = getMissingProductionEnvVars();
        expect(missing).toContain("NEXT_PUBLIC_SUPABASE_URL");
        expect(missing).toContain("SUPABASE_SERVICE_ROLE_KEY");
    });

    it("falls back to NODE_ENV when VERCEL_ENV is absent", async () => {
        const { getMissingProductionEnvVars } = await loadEnvWith({
            NODE_ENV: "production",
            VERCEL_ENV: undefined,
            CRON_SECRET: undefined,
            UPSTASH_REDIS_REST_URL: undefined,
            UPSTASH_REDIS_REST_TOKEN: undefined,
        });

        expect(getMissingProductionEnvVars()).toContain("CRON_SECRET");
    });
});
