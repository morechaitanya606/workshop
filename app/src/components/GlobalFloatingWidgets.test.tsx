import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { lazy, Suspense, type ComponentType } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GlobalFloatingWidgets from "./GlobalFloatingWidgets";

// next/dynamic(..., { ssr: false }) as a plain lazy component.
vi.mock("next/dynamic", () => ({
    default: (loader: () => Promise<{ default: ComponentType }>) => {
        const Lazy = lazy(loader);
        return function Dynamic() {
            return (
                <Suspense fallback={null}>
                    <Lazy />
                </Suspense>
            );
        };
    },
}));

vi.mock("@/components/SupportChatbot", () => ({
    default: () => <div data-testid="support-chatbot" />,
}));

vi.mock("@/components/SurpriseBox", () => ({
    default: () => <div data-testid="surprise-box" />,
}));

async function advance(ms: number) {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
    });
}

/** Lets the lazy chunks load and React commit them (it can hold a Suspense reveal ~300 ms). */
async function settleLazyChunks() {
    for (let round = 0; round < 3; round += 1) {
        await act(async () => {
            await vi.dynamicImportSettled();
            await vi.advanceTimersByTimeAsync(500);
        });
    }
}

describe("GlobalFloatingWidgets", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        // jsdom has no requestIdleCallback, like Safari: the widgets mount 300 ms after load.
        vi.stubGlobal("requestIdleCallback", undefined);
    });

    afterEach(() => {
        cleanup();
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it("is absent from the server HTML", () => {
        expect(renderToString(<GlobalFloatingWidgets />)).toBe("");
    });

    it("mounts the chat and surprise launchers once the page is idle", async () => {
        render(<GlobalFloatingWidgets />);
        await advance(299);
        expect(screen.queryByTestId("support-chatbot")).not.toBeInTheDocument();
        expect(screen.queryByTestId("surprise-box")).not.toBeInTheDocument();

        await advance(1);
        await settleLazyChunks();
        expect(screen.getByTestId("support-chatbot")).toBeInTheDocument();
        expect(screen.getByTestId("surprise-box")).toBeInTheDocument();
    });
});
