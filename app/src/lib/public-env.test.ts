// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * public-env.ts is what client components read their NEXT_PUBLIC_* settings from, so it must stay
 * free of zod (and of env.ts, which pulls zod and the server schema into the browser bundle),
 * and it must never throw: a bad optional value in the browser reads as unset.
 */

const PUBLIC_KEYS = [
    "NEXT_PUBLIC_APP_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_RAZORPAY_KEY_ID",
    "NEXT_PUBLIC_MAPPLS_API_KEY",
    "NEXT_PUBLIC_POSTHOG_KEY",
    "NEXT_PUBLIC_POSTHOG_HOST",
    "NEXT_PUBLIC_SENTRY_DSN",
    "NEXT_PUBLIC_MEDIA_BASE_URL",
    "NEXT_PUBLIC_GA_MEASUREMENT_ID",
] as const;

async function loadPublicEnvWith(overrides: Partial<Record<string, string>>) {
    vi.resetModules();
    for (const key of PUBLIC_KEYS) {
        // undefined deletes the variable.
        vi.stubEnv(key, overrides[key] as string);
    }
    return import("./public-env");
}

function sourceOf(relativePath: string) {
    return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

describe("public-env", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.resetModules();
    });

    it("reads every public setting, trimmed", async () => {
        const { publicEnv } = await loadPublicEnvWith({
            NEXT_PUBLIC_APP_URL: " https://preview.example.com ",
            NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
            NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: " sb_publishable_x ",
            NEXT_PUBLIC_POSTHOG_KEY: "phc_key",
            NEXT_PUBLIC_POSTHOG_HOST: "https://eu.i.posthog.com",
            NEXT_PUBLIC_SENTRY_DSN: "https://key@o1.ingest.sentry.io/1",
            NEXT_PUBLIC_GA_MEASUREMENT_ID: " G-ABC123XYZ9 ",
        });

        expect(publicEnv).toMatchObject({
            NEXT_PUBLIC_APP_URL: "https://preview.example.com",
            NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
            NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
            NEXT_PUBLIC_POSTHOG_KEY: "phc_key",
            NEXT_PUBLIC_POSTHOG_HOST: "https://eu.i.posthog.com",
            NEXT_PUBLIC_SENTRY_DSN: "https://key@o1.ingest.sentry.io/1",
            NEXT_PUBLIC_GA_MEASUREMENT_ID: "G-ABC123XYZ9",
        });
    });

    it("treats unset and blank values as unset", async () => {
        const { publicEnv } = await loadPublicEnvWith({
            NEXT_PUBLIC_POSTHOG_KEY: "   ",
            NEXT_PUBLIC_APP_URL: "",
        });

        for (const key of PUBLIC_KEYS) {
            expect(publicEnv[key]).toBeUndefined();
        }
    });

    it("reads a malformed optional value as unset instead of throwing", async () => {
        const { publicEnv } = await loadPublicEnvWith({
            NEXT_PUBLIC_APP_URL: "not a url",
            NEXT_PUBLIC_POSTHOG_HOST: "eu.i.posthog.com",
            NEXT_PUBLIC_GA_MEASUREMENT_ID: "UA-12345-1",
        });

        expect(publicEnv.NEXT_PUBLIC_APP_URL).toBeUndefined();
        expect(publicEnv.NEXT_PUBLIC_POSTHOG_HOST).toBeUndefined();
        expect(publicEnv.NEXT_PUBLIC_GA_MEASUREMENT_ID).toBeUndefined();
    });

    it("prefers the publishable Supabase key and falls back to the anon key", async () => {
        const both = await loadPublicEnvWith({
            NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
            NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
            NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon_y",
        });
        expect(both.getPublicSupabaseConfig()).toEqual({
            url: "https://project.supabase.co",
            key: "sb_publishable_x",
        });

        const anonOnly = await loadPublicEnvWith({
            NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
            NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon_y",
        });
        expect(anonOnly.getPublicSupabaseConfig()).toEqual({
            url: "https://project.supabase.co",
            key: "anon_y",
        });
    });

    it("has no Supabase config without both the URL and a key", async () => {
        const noKey = await loadPublicEnvWith({
            NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
        });
        expect(noKey.getPublicSupabaseConfig()).toBeNull();

        const noUrl = await loadPublicEnvWith({
            NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
        });
        expect(noUrl.getPublicSupabaseConfig()).toBeNull();
    });

    it("matches env.ts on the production site URL and the Supabase config", async () => {
        const values = {
            NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
            NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon_y",
        };
        const publicEnvModule = await loadPublicEnvWith(values);
        vi.stubEnv("SKIP_ENV_VALIDATION", "true");
        const serverEnv = await import("./env");

        expect(publicEnvModule.PRODUCTION_SITE_URL).toBe("https://www.onlyworkshops.com");
        expect(serverEnv.PRODUCTION_SITE_URL).toBe(publicEnvModule.PRODUCTION_SITE_URL);
        expect(serverEnv.getPublicSupabaseConfig()).toEqual(
            publicEnvModule.getPublicSupabaseConfig()
        );
    });

    it("keeps zod and env.ts out of public-env and the client modules that read it", () => {
        expect(sourceOf("./public-env.ts")).not.toMatch(/from\s+["'](zod|@\/lib\/env)["']/);

        for (const clientModule of [
            "./supabase.ts",
            "./analytics.ts",
            "./client-url.ts",
            "./auth-context.tsx",
            "../components/AnalyticsProvider.tsx",
        ]) {
            expect(sourceOf(clientModule), clientModule).not.toMatch(
                /from\s+["'](zod|@\/lib\/env|\.\/env)["']/
            );
        }
    });

    it("reads each variable as a literal process.env.NEXT_PUBLIC_* the bundler can inline", () => {
        const source = sourceOf("./public-env.ts");
        const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

        expect(code).not.toMatch(/process\.env\[/);
        for (const key of PUBLIC_KEYS) {
            expect(source).toContain(`process.env.${key}`);
        }
    });

    it("reads and exposes nothing but NEXT_PUBLIC_* variables, so no secret can reach the browser", async () => {
        const code = sourceOf("./public-env.ts")
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/\/\/.*$/gm, "");
        const names = [...code.matchAll(/process\.env\.([A-Za-z0-9_]+)/g)].map((match) => match[1]);

        expect(names.length).toBeGreaterThan(0);
        expect(names.filter((name) => !name.startsWith("NEXT_PUBLIC_"))).toEqual([]);

        const { publicEnv } = await loadPublicEnvWith({});
        const exposed = Object.keys(publicEnv);
        expect(exposed.filter((name) => !name.startsWith("NEXT_PUBLIC_"))).toEqual([]);
        expect([...exposed].sort()).toEqual([...PUBLIC_KEYS].sort());
    });
});
