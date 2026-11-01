import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { lazy, Suspense, type ComponentType } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AppShell from "./AppShell";

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

vi.mock("@/components/Navbar", () => ({ default: () => <nav data-testid="navbar" /> }));
vi.mock("@/components/MobileNav", () => ({ default: () => <nav data-testid="mobile-nav" /> }));
vi.mock("@/components/CookieConsentBanner", () => ({
    default: () => <div data-testid="cookie-banner" />,
}));
vi.mock("@/components/ui/BackToTop", () => ({ default: () => <div data-testid="back-to-top" /> }));
vi.mock("@/components/ui/ScrollProgress", () => ({
    default: () => <div data-testid="scroll-progress" />,
}));
vi.mock("@/components/ui/CommandPalette", () => ({
    default: () => <div data-testid="command-palette" />,
}));

const EXTRAS = ["back-to-top", "scroll-progress", "command-palette"];

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

describe("AppShell", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal("requestIdleCallback", undefined);
    });

    afterEach(() => {
        cleanup();
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it("server-renders the page and navigation without the extras", () => {
        const html = renderToString(
            <AppShell>
                <p>Page content</p>
            </AppShell>
        );

        expect(html).toContain("Page content");
        expect(html).toContain('id="main-content"');
        expect(html).toContain('data-testid="navbar"');
        for (const extra of EXTRAS) {
            expect(html).not.toContain(extra);
        }
    });

    it("adds scroll progress, back-to-top and the command palette once the page is idle", async () => {
        render(
            <AppShell>
                <p>Page content</p>
            </AppShell>
        );
        await act(async () => {
            await vi.dynamicImportSettled();
        });
        expect(screen.getByText("Page content")).toBeInTheDocument();
        expect(screen.getByTestId("cookie-banner")).toBeInTheDocument();
        for (const extra of EXTRAS) {
            expect(screen.queryByTestId(extra)).not.toBeInTheDocument();
        }

        await advance(300);
        await settleLazyChunks();
        for (const extra of EXTRAS) {
            expect(screen.getByTestId(extra)).toBeInTheDocument();
        }
    });
});
