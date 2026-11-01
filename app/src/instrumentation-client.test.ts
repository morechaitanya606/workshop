import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    sentry: { isSentryEnabled: true },
    loadSentry: vi.fn(),
    reportError: vi.fn(),
    getLoadedSentry: vi.fn(),
    runWhenPageIdle: vi.fn(),
    captureRouterTransitionStart: vi.fn(),
}));

vi.mock("@/lib/sentry-client", () => ({
    get isSentryEnabled() {
        return mocks.sentry.isSentryEnabled;
    },
    loadSentry: mocks.loadSentry,
    reportError: mocks.reportError,
    getLoadedSentry: mocks.getLoadedSentry,
}));

vi.mock("@/lib/run-when-page-idle", () => ({ runWhenPageIdle: mocks.runWhenPageIdle }));

const SENTRY = { captureRouterTransitionStart: mocks.captureRouterTransitionStart };

async function loadInstrumentation() {
    vi.resetModules();
    return import("./instrumentation-client");
}

async function settle() {
    await new Promise((resolve) => setTimeout(resolve, 0));
}

/** An error event without an `error` object, which vitest's jsdom does not rethrow. */
function errorEvent(message: string) {
    return new ErrorEvent("error", { message });
}

describe("instrumentation-client", () => {
    const cleanups: Array<() => void> = [];

    beforeEach(() => {
        mocks.sentry.isSentryEnabled = true;
        mocks.loadSentry.mockResolvedValue(SENTRY);
        mocks.getLoadedSentry.mockReturnValue(null);
    });

    afterEach(async () => {
        cleanups.splice(0).forEach((cleanup) => cleanup());
        // Lets the listeners of a run whose Sentry load was held back remove themselves.
        await settle();
    });

    it("does not download Sentry while the page loads, only once it is idle", async () => {
        await loadInstrumentation();

        expect(mocks.loadSentry).not.toHaveBeenCalled();
        expect(mocks.runWhenPageIdle).toHaveBeenCalledTimes(1);

        mocks.runWhenPageIdle.mock.calls[0][0]();
        expect(mocks.loadSentry).toHaveBeenCalledTimes(1);
    });

    it("reports an error raised before Sentry started, and starts it", async () => {
        let finishLoading: (sentry: typeof SENTRY) => void = () => {};
        mocks.loadSentry.mockReturnValue(new Promise((resolve) => (finishLoading = resolve)));
        await loadInstrumentation();
        cleanups.push(() => finishLoading(SENTRY));

        window.dispatchEvent(errorEvent("early failure"));

        expect(mocks.reportError).toHaveBeenCalledWith("early failure", {
            layer: "web",
            phase: "before_sentry_init",
        });
        expect(mocks.loadSentry).toHaveBeenCalled();

        const rejection = Object.assign(new Event("unhandledrejection"), {
            reason: new Error("rejected early"),
        });
        window.dispatchEvent(rejection);
        expect(mocks.reportError).toHaveBeenLastCalledWith(new Error("rejected early"), {
            layer: "web",
            phase: "before_sentry_init",
        });
    });

    it("leaves later errors to Sentry's own handlers once it is running", async () => {
        await loadInstrumentation();
        mocks.runWhenPageIdle.mock.calls[0][0]();
        await settle();

        window.dispatchEvent(errorEvent("after init"));
        expect(mocks.reportError).not.toHaveBeenCalled();
    });

    it("sets nothing up where Sentry is off", async () => {
        mocks.sentry.isSentryEnabled = false;
        await loadInstrumentation();

        window.dispatchEvent(errorEvent("ignored"));
        expect(mocks.runWhenPageIdle).not.toHaveBeenCalled();
        expect(mocks.reportError).not.toHaveBeenCalled();
        expect(mocks.loadSentry).not.toHaveBeenCalled();
    });

    it("traces navigations only once Sentry is running, without downloading it", async () => {
        const { onRouterTransitionStart } = await loadInstrumentation();

        onRouterTransitionStart("/explore", "push");
        expect(mocks.loadSentry).not.toHaveBeenCalled();
        expect(mocks.captureRouterTransitionStart).not.toHaveBeenCalled();

        mocks.getLoadedSentry.mockReturnValue(SENTRY);
        onRouterTransitionStart("/explore", "push");
        expect(mocks.captureRouterTransitionStart).toHaveBeenCalledWith("/explore", "push");
    });
});
