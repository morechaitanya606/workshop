import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    init: vi.fn(),
    captureException: vi.fn(),
    captureRouterTransitionStart: vi.fn(),
}));

function sentryModule() {
    return {
        init: mocks.init,
        captureException: mocks.captureException,
        captureRouterTransitionStart: mocks.captureRouterTransitionStart,
    };
}

vi.mock("@sentry/nextjs", () => sentryModule());

const DSN = "https://key@o1.ingest.sentry.io/1";

async function loadSentryClientWith(env: { NODE_ENV: string; NEXT_PUBLIC_SENTRY_DSN?: string }) {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", env.NODE_ENV);
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", env.NEXT_PUBLIC_SENTRY_DSN as string);
    return import("./sentry-client");
}

async function settle() {
    await vi.dynamicImportSettled();
    await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("sentry-client", () => {
    beforeEach(() => {
        vi.doMock("@sentry/nextjs", () => sentryModule());
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.resetModules();
    });

    it("does nothing without a DSN or outside production", async () => {
        for (const env of [
            { NODE_ENV: "production" },
            { NODE_ENV: "development", NEXT_PUBLIC_SENTRY_DSN: DSN },
        ]) {
            const client = await loadSentryClientWith(env);
            expect(client.isSentryEnabled).toBe(false);

            client.reportError(new Error("boom"), { route: "root" });
            await expect(client.loadSentry()).resolves.toBeNull();
            await settle();
        }

        expect(mocks.init).not.toHaveBeenCalled();
        expect(mocks.captureException).not.toHaveBeenCalled();
    });

    it("loads and initialises Sentry once, on the first report", async () => {
        const client = await loadSentryClientWith({
            NODE_ENV: "production",
            NEXT_PUBLIC_SENTRY_DSN: DSN,
        });
        expect(client.getLoadedSentry()).toBeNull();

        const first = new Error("first");
        const second = new Error("second");
        client.reportError(first, { route: "root", layer: "web" });
        client.reportError(second, { route: "explore_page", layer: "web" });
        await settle();

        expect(mocks.init).toHaveBeenCalledTimes(1);
        expect(mocks.init).toHaveBeenCalledWith({
            dsn: DSN,
            tracesSampleRate: 0.1,
            sendDefaultPii: false,
        });
        expect(mocks.captureException).toHaveBeenCalledWith(first, {
            tags: { route: "root", layer: "web" },
        });
        expect(mocks.captureException).toHaveBeenCalledWith(second, {
            tags: { route: "explore_page", layer: "web" },
        });
        expect(client.getLoadedSentry()).not.toBeNull();
    });

    it("tries the download again after it failed", async () => {
        vi.doMock("@sentry/nextjs", () => {
            throw new Error("Loading chunk 491 failed.");
        });
        const client = await loadSentryClientWith({
            NODE_ENV: "production",
            NEXT_PUBLIC_SENTRY_DSN: DSN,
        });

        await expect(client.loadSentry()).resolves.toBeNull();
        expect(client.getLoadedSentry()).toBeNull();

        vi.doMock("@sentry/nextjs", () => sentryModule());
        const error = new Error("after reconnect");
        client.reportError(error, { route: "root" });
        await settle();

        expect(mocks.init).toHaveBeenCalledTimes(1);
        expect(mocks.captureException).toHaveBeenCalledWith(error, { tags: { route: "root" } });
    });

    it("bundles only the Sentry exports it uses", () => {
        const source = readFileSync(join(process.cwd(), "src", "lib", "sentry-client.ts"), "utf8");

        expect(source).toMatch(
            /webpackExports: \["init", "captureException", "captureRouterTransitionStart"\]/
        );
        expect(source).not.toMatch(/^import .*@sentry/m);
    });

    it("keeps the error boundaries off a static Sentry import", () => {
        for (const boundary of [
            "src/app/error.tsx",
            "src/app/global-error.tsx",
            "src/app/(private)/admin/error.tsx",
            "src/app/(private)/host/error.tsx",
            "src/app/(private)/profile/error.tsx",
            "src/app/(public)/communities/error.tsx",
            "src/app/(public)/explore/error.tsx",
            "src/instrumentation-client.ts",
        ]) {
            const source = readFileSync(join(process.cwd(), ...boundary.split("/")), "utf8");
            expect(source, boundary).not.toContain("@sentry/nextjs");
            expect(source, boundary).toContain('from "@/lib/sentry-client"');
        }
    });
});
