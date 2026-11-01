import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pageActions } from "@/lib/chunk-load-recovery";
import { reportError } from "@/lib/sentry-client";
import AdminError from "./(private)/admin/error";
import BookingError from "./(private)/booking/error";
import HostError from "./(private)/host/error";
import ProfileError from "./(private)/profile/error";
import CommunitiesError from "./(public)/communities/error";
import ExploreError from "./(public)/explore/error";
import WorkshopDetailError from "./(public)/workshop/[id]/error";
import GlobalError from "./global-error";

/**
 * Every error boundary reports through the lazy Sentry helper (never `@sentry/nextjs` directly,
 * which put Sentry into the booking and workshop routes' JavaScript) with its own route tag, and
 * its "Try again" button goes through the chunk-load aware retry.
 */

vi.mock("@/lib/sentry-client", () => ({ reportError: vi.fn() }));
vi.mock("@/components/Navbar", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));

type BoundaryProps = { error: Error & { digest?: string }; reset: () => void };
type Boundary = (props: BoundaryProps) => React.ReactNode;

const BOUNDARIES: Array<[string, Boundary, string, string]> = [
    ["admin", AdminError, "admin", "Dashboard error"],
    ["booking", BookingError, "booking_page", "Checkout hit an unexpected snag"],
    ["host", HostError, "host", "Host dashboard error"],
    ["profile", ProfileError, "profile", "Profile unavailable"],
    ["communities", CommunitiesError, "communities", "Communities unavailable"],
    ["explore", ExploreError, "explore_page", "Explore is taking a breather"],
    ["workshop detail", WorkshopDetailError, "workshop_detail", "Workshop unavailable"],
    ["global", GlobalError, "global", "Something went wrong"],
];

describe.each(BOUNDARIES)("%s error boundary", (_name, Boundary, route, heading) => {
    beforeEach(() => {
        // global-error renders its own <html>, which React reports as invalid inside a <div>.
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        cleanup();
    });

    it("reports the error through the lazy Sentry helper, tagged with its route", () => {
        const error = new Error("render failed");
        render(<Boundary error={error} reset={vi.fn()} />);

        expect(reportError).toHaveBeenCalledTimes(1);
        expect(reportError).toHaveBeenCalledWith(error, { route, layer: "web" });
        expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    });

    it("re-renders on Try again after an ordinary error", () => {
        const reset = vi.fn();
        const reload = vi.spyOn(pageActions, "reload").mockImplementation(() => {});
        render(<Boundary error={new Error("render failed")} reset={reset} />);

        fireEvent.click(screen.getByRole("button", { name: "Try again" }));

        expect(reset).toHaveBeenCalledTimes(1);
        expect(reload).not.toHaveBeenCalled();
    });

    it("reloads on Try again after a script that failed to download", () => {
        const reset = vi.fn();
        const reload = vi.spyOn(pageActions, "reload").mockImplementation(() => {});
        const error = new Error("Loading chunk 77 failed.");
        error.name = "ChunkLoadError";
        render(<Boundary error={error} reset={reset} />);

        fireEvent.click(screen.getByRole("button", { name: "Try again" }));

        expect(reload).toHaveBeenCalledTimes(1);
        expect(reset).not.toHaveBeenCalled();
    });
});
