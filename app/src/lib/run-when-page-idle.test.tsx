import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runWhenPageIdle, usePageIdle } from "./run-when-page-idle";

function setReadyState(state: DocumentReadyState) {
    vi.spyOn(document, "readyState", "get").mockReturnValue(state);
}

describe("runWhenPageIdle", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it("waits for the load event, then for an idle callback", () => {
        setReadyState("loading");
        const requestIdleCallback = vi.fn((_callback: IdleRequestCallback) => 7);
        vi.stubGlobal("requestIdleCallback", requestIdleCallback);
        const callback = vi.fn();

        runWhenPageIdle(callback);
        vi.advanceTimersByTime(5_000);
        expect(requestIdleCallback).not.toHaveBeenCalled();

        window.dispatchEvent(new Event("load"));
        expect(requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), {
            timeout: 2_000,
        });
        expect(callback).not.toHaveBeenCalled();

        requestIdleCallback.mock.calls[0][0]({} as IdleDeadline);
        expect(callback).toHaveBeenCalledTimes(1);

        // The load-event fallback timer was cleared: nothing runs twice.
        vi.advanceTimersByTime(20_000);
        expect(callback).toHaveBeenCalledTimes(1);
    });

    it("runs shortly after load where requestIdleCallback is missing (Safari)", () => {
        setReadyState("complete");
        vi.stubGlobal("requestIdleCallback", undefined);
        const callback = vi.fn();

        runWhenPageIdle(callback);
        vi.advanceTimersByTime(299);
        expect(callback).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(callback).toHaveBeenCalledTimes(1);
    });

    it("stops waiting for a load event that never comes", () => {
        setReadyState("interactive");
        vi.stubGlobal("requestIdleCallback", undefined);
        const callback = vi.fn();

        runWhenPageIdle(callback);
        vi.advanceTimersByTime(10_000);
        expect(callback).not.toHaveBeenCalled();
        vi.advanceTimersByTime(300);
        expect(callback).toHaveBeenCalledTimes(1);

        window.dispatchEvent(new Event("load"));
        vi.advanceTimersByTime(1_000);
        expect(callback).toHaveBeenCalledTimes(1);
    });

    it("can be cancelled before load and while waiting for idle time", () => {
        setReadyState("loading");
        const cancelIdleCallback = vi.fn();
        vi.stubGlobal(
            "requestIdleCallback",
            vi.fn(() => 3)
        );
        vi.stubGlobal("cancelIdleCallback", cancelIdleCallback);
        const beforeLoad = vi.fn();
        const whileIdle = vi.fn();

        runWhenPageIdle(beforeLoad)();
        const cancelWhileIdle = runWhenPageIdle(whileIdle);
        window.dispatchEvent(new Event("load"));
        cancelWhileIdle();

        expect(cancelIdleCallback).toHaveBeenCalledWith(3);
        vi.advanceTimersByTime(20_000);
        expect(beforeLoad).not.toHaveBeenCalled();
        expect(whileIdle).not.toHaveBeenCalled();
    });
});

describe("usePageIdle", () => {
    function Probe() {
        return <p data-testid="idle">{usePageIdle() ? "idle" : "busy"}</p>;
    }

    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal("requestIdleCallback", undefined);
    });

    afterEach(() => {
        cleanup();
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it("is false in the server HTML and on the first client render", () => {
        expect(renderToString(<Probe />)).toContain("busy");

        render(<Probe />);
        expect(screen.getByTestId("idle")).toHaveTextContent("busy");
    });

    it("turns true once the page is idle", async () => {
        render(<Probe />);
        await act(async () => {
            await vi.advanceTimersByTimeAsync(300);
        });
        expect(screen.getByTestId("idle")).toHaveTextContent("idle");
    });
});
