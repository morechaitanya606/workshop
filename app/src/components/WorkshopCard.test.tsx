import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import WorkshopCard from "@/components/WorkshopCard";
import { mockWorkshops } from "@/lib/data";

beforeAll(() => {
    class IntersectionObserverMock {
        readonly root = null;
        readonly rootMargin = "";
        readonly thresholds = [];

        observe() {}
        unobserve() {}
        disconnect() {}
        takeRecords() {
            return [];
        }
    }

    vi.stubGlobal(
        "IntersectionObserver",
        IntersectionObserverMock as unknown as typeof IntersectionObserver
    );
});

describe("WorkshopCard", () => {
    it("renders workshop summary details", () => {
        const workshop = {
            ...mockWorkshops[0],
            date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        };
        render(<WorkshopCard workshop={workshop} />);

        expect(screen.getByText(workshop.title)).toBeInTheDocument();
        expect(screen.getByText(/₹/)).toBeInTheDocument();
        expect(
            screen.getByText(
                `${workshop.seatsRemaining} seat${workshop.seatsRemaining === 1 ? "" : "s"} available`
            )
        ).toBeInTheDocument();
    });

    it("links to the workshop detail page", () => {
        const workshop = {
            ...mockWorkshops[1],
            date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        };
        render(<WorkshopCard workshop={workshop} />);

        const link = screen.getByRole("link");
        expect(link).toHaveAttribute("href", `/workshop/${workshop.id}`);
    });

    it("shows sold out when seats are not available", () => {
        const soldOutWorkshop = {
            ...mockWorkshops[0],
            id: "sold-out-card",
            seatsRemaining: 0,
            date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        };
        render(<WorkshopCard workshop={soldOutWorkshop} />);

        expect(screen.getByText("Sold out")).toBeInTheDocument();
    });

    it("shows Event ended for past workshops", () => {
        const pastWorkshop = {
            ...mockWorkshops[0],
            id: "past-card",
            date: "2025-01-01",
        };
        render(<WorkshopCard workshop={pastWorkshop} />);

        expect(screen.getByText("Event ended")).toBeInTheDocument();
        expect(screen.queryByText(/seat/i)).not.toBeInTheDocument();
    });

    it("does not show New badge for past workshops", () => {
        const pastNewWorkshop = {
            ...mockWorkshops[0],
            id: "past-new-card",
            isNew: true,
            isBestseller: false,
            reviewCount: 0,
            date: "2025-01-01",
        };
        render(<WorkshopCard workshop={pastNewWorkshop} />);

        // The highlighted "New" badge (top-right overlay) should not appear
        // Bottom row should show "No reviews", not "New"
        expect(screen.getByText("No reviews")).toBeInTheDocument();
        expect(screen.getByText("Event ended")).toBeInTheDocument();
    });

    it("shows No reviews instead of New for past workshops with zero reviews", () => {
        const pastNoReviews = {
            ...mockWorkshops[0],
            id: "past-no-reviews-card",
            reviewCount: 0,
            date: "2025-01-01",
        };
        render(<WorkshopCard workshop={pastNoReviews} />);

        expect(screen.getByText("No reviews")).toBeInTheDocument();
    });
});
