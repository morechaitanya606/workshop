import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

async function importEnvModule() {
    vi.resetModules();
    return import("./env");
}

describe("env module", () => {
    afterEach(() => {
        process.env = { ...originalEnv };
        vi.resetModules();
    });

    it("does not throw on import in production when optional env vars are missing", async () => {
        process.env = {
            ...originalEnv,
            NODE_ENV: "production",
        };

        delete process.env.NEXT_PUBLIC_SUPABASE_URL;
        delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
        delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        delete process.env.SUPABASE_SERVICE_ROLE_KEY;
        delete process.env.RAZORPAY_KEY_ID;
        delete process.env.RAZORPAY_KEY_SECRET;

        await expect(importEnvModule()).resolves.toMatchObject({
            getAppUrl: expect.any(Function),
            getPublicSupabaseConfig: expect.any(Function),
            getRazorpayConfig: expect.any(Function),
            assertProductionEnv: expect.any(Function),
        });

        const envModule = await importEnvModule();
        expect(envModule.getPublicSupabaseConfig()).toBeNull();
        expect(envModule.getRazorpayConfig()).toBeNull();
        expect(envModule.getMissingProductionEnvVars()).toEqual([
            "NEXT_PUBLIC_SUPABASE_URL",
            "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)",
            "SUPABASE_SERVICE_ROLE_KEY",
            "RAZORPAY_KEY_ID",
            "RAZORPAY_KEY_SECRET",
        ]);
        expect(() => envModule.assertProductionEnv()).toThrow(
            "Missing required production environment variable(s)"
        );
    });
});
