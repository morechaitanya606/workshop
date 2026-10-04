import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * getAppUrl() feeds canonical URLs, the sitemap, robots.txt, Open Graph images, JSON-LD and
 * customer email links. A `NEXT_PUBLIC_APP_URL=http://localhost:3000` copied into Vercel once
 * pointed all of them at localhost on the live site, invisibly to every other check.
 */

const BASE_ENV = {
    NEXT_PUBLIC_SUPABASE_URL: "https://placeholder.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
    SKIP_ENV_VALIDATION: "true",
};

async function loadEnvWith(overrides: Record<string, string | undefined>) {
    vi.resetModules();
    for (const [key, value] of Object.entries({
        VERCEL: undefined,
        VERCEL_ENV: undefined,
        VERCEL_URL: undefined,
        VERCEL_PROJECT_PRODUCTION_URL: undefined,
        ...BASE_ENV,
        ...overrides,
    })) {
        vi.stubEnv(key, value as string);
    }
    return import("./env");
}

describe("getAppUrl", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("always uses the live domain on the production deployment", async () => {
        const env = await loadEnvWith({
            VERCEL: "1",
            VERCEL_ENV: "production",
            NEXT_PUBLIC_APP_URL: "http://localhost:3000",
        });
        expect(env.getAppUrl()).toBe("https://www.onlyworkshops.com");
        expect(env.getAbsoluteUrl("/explore")).toBe("https://www.onlyworkshops.com/explore");
    });

    it("ignores a localhost NEXT_PUBLIC_APP_URL on any Vercel deployment", async () => {
        const env = await loadEnvWith({
            VERCEL: "1",
            VERCEL_ENV: "preview",
            NEXT_PUBLIC_APP_URL: "http://localhost:3000",
            VERCEL_PROJECT_PRODUCTION_URL: "www.onlyworkshops.com",
        });
        expect(env.getAppUrl()).toBe("https://www.onlyworkshops.com");
    });

    it("keeps a real NEXT_PUBLIC_APP_URL on previews", async () => {
        const env = await loadEnvWith({
            VERCEL: "1",
            VERCEL_ENV: "preview",
            NEXT_PUBLIC_APP_URL: "https://staging.example.com/",
        });
        expect(env.getAppUrl()).toBe("https://staging.example.com");
    });

    it("still uses localhost for local development", async () => {
        const env = await loadEnvWith({ NEXT_PUBLIC_APP_URL: "http://localhost:3000" });
        expect(env.getAppUrl()).toBe("http://localhost:3000");
    });
});
