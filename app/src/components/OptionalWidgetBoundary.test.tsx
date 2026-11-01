import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { lazy, Suspense } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reportError } from "@/lib/sentry-client";
import OptionalWidgetBoundary from "./OptionalWidgetBoundary";

vi.mock("@/lib/sentry-client", () => ({ reportError: vi.fn() }));

const chunkError = Object.assign(new Error("Loading chunk 77 failed."), {
    name: "ChunkLoadError",
});

function Healthy() {
    return <p data-testid="widget">widget</p>;
}

function Crashing(): never {
    throw new TypeError("widget crashed");
}

function FailedDownload(): never {
    throw chunkError;
}

function renderWithPage(widget: React.ReactNode) {
    return render(
        <>
            <p data-testid="page">page content</p>
            <OptionalWidgetBoundary name="chat">{widget}</OptionalWidgetBoundary>
        </>
    );
}

describe("OptionalWidgetBoundary", () => {
    beforeEach(() => {
        vi.mocked(reportError).mockClear();
        // React logs every error a boundary catches.
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    it("shows its widget", () => {
        renderWithPage(<Healthy />);

        expect(screen.getByTestId("widget")).toBeInTheDocument();
        expect(reportError).not.toHaveBeenCalled();
    });

    it("drops a widget that crashes, keeps the page, and reports it", () => {
        renderWithPage(<Crashing />);

        expect(screen.queryByTestId("widget")).not.toBeInTheDocument();
        expect(screen.getByTestId("page")).toBeInTheDocument();
        expect(reportError).toHaveBeenCalledWith(expect.any(TypeError), {
            route: "optional_widget",
            widget: "chat",
            layer: "web",
        });
    });

    it("drops a widget whose script failed to download, without reporting the connection", () => {
        renderWithPage(<FailedDownload />);

        expect(screen.getByTestId("page")).toBeInTheDocument();
        expect(reportError).not.toHaveBeenCalled();
    });

    it("catches the rejection of a lazily loaded widget (what next/dynamic does)", async () => {
        const Lazy = lazy(() => Promise.reject(chunkError));

        renderWithPage(
            <Suspense fallback={null}>
                <Lazy />
            </Suspense>
        );

        await waitFor(() => expect(console.error).toHaveBeenCalled());
        expect(screen.getByTestId("page")).toBeInTheDocument();
        expect(reportError).not.toHaveBeenCalled();
    });
});
