// @vitest-environment node
// env.ts is parsed on the server and in the browser; node is the server, and the browser case
// stubs `window` itself.
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * NEXT_PUBLIC_GA_MEASUREMENT_ID is optional: unset, the root layout renders no Google tag at all.
 * A malformed id must stop a validated build with a clear message, and must never break the site
 * where validation is skipped (CI builds) or in the browser.
 */

const BASE_ENV = {
    NEXT_PUBLIC_SUPABASE_URL: "https://placeholder.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
};

async function loadEnvWith(overrides: Record<string, string | undefined>) {
    vi.resetModules();
    // undefined deletes the variable.
    for (const [key, value] of Object.entries({
        NEXT_PUBLIC_GA_MEASUREMENT_ID: undefined,
        SKIP_ENV_VALIDATION: "true",
        ...BASE_ENV,
        ...overrides,
    })) {
        vi.stubEnv(key, value as string);
    }
    return import("./env");
}

// The first import of env.ts (and zod) can take several seconds on a busy machine.
describe("NEXT_PUBLIC_GA_MEASUREMENT_ID", { timeout: 20_000 }, () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
        vi.resetModules();
    });

    it("is off when unset", async () => {
        expect((await loadEnvWith({})).getGaMeasurementId()).toBeNull();
    });

    it.each(["", "   "])("is off when blank (%j), even with validation on", async (value) => {
        const env = await loadEnvWith({
            NEXT_PUBLIC_GA_MEASUREMENT_ID: value,
            SKIP_ENV_VALIDATION: "",
        });
        expect(env.getGaMeasurementId()).toBeNull();
    });

    it("accepts a GA4 measurement id, trimmed", async () => {
        const env = await loadEnvWith({
            NEXT_PUBLIC_GA_MEASUREMENT_ID: " G-ABC123XYZ9 ",
            SKIP_ENV_VALIDATION: "",
        });
        expect(env.getGaMeasurementId()).toBe("G-ABC123XYZ9");
        expect(env.publicEnv.NEXT_PUBLIC_GA_MEASUREMENT_ID).toBe("G-ABC123XYZ9");
    });

    it.each(["UA-12345-1", "GTM-ABC123", "g-abc123", "G-", "G-ABC 123", 'G-1";alert(1)//'])(
        "fails a validated server build on %j, naming the variable",
        async (value) => {
            await expect(
                loadEnvWith({ NEXT_PUBLIC_GA_MEASUREMENT_ID: value, SKIP_ENV_VALIDATION: "" })
            ).rejects.toThrow(/NEXT_PUBLIC_GA_MEASUREMENT_ID/);
        }
    );

    it("turns analytics off instead of throwing when validation is skipped", async () => {
        for (const skip of ["true", "1"]) {
            const env = await loadEnvWith({
                NEXT_PUBLIC_GA_MEASUREMENT_ID: "UA-12345-1",
                SKIP_ENV_VALIDATION: skip,
            });
            expect(env.getGaMeasurementId()).toBeNull();
        }
    });

    it("never throws in the browser, where SKIP_ENV_VALIDATION is not visible", async () => {
        vi.stubGlobal("window", {});
        const env = await loadEnvWith({
            NEXT_PUBLIC_GA_MEASUREMENT_ID: "GTM-ABC123",
            SKIP_ENV_VALIDATION: "",
        });
        expect(env.getGaMeasurementId()).toBeNull();
    });
});
