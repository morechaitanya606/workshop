import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Workshop } from "@/lib/data";
import type { CardOffer } from "@/lib/offers";
import ExploreResultsSection from "./ExploreResultsSection";

// The card has its own tests; here only its place in the heading outline and the offer and
// closed flags it is handed matter.
vi.mock("@/components/WorkshopCard", () => ({
    default: ({
        workshop,
        offer,
        bookingsClosed,
    }: {
        workshop: Workshop;
        offer?: { label: string } | null;
        bookingsClosed?: boolean;
    }) => (
        <h3 data-offer={offer ? offer.label : "none"} data-closed={String(Boolean(bookingsClosed))}>
            {workshop.title}
        </h3>
    ),
}));

type Props = ComponentProps<typeof ExploreResultsSection>;

function renderSection(overrides: Partial<Props> = {}) {
    const props: Props = {
        heading: "Upcoming workshops",
        isPending: false,
        total: 1,
        source: "supabase",
        todayIso: "2026-10-23",
        errorBannerMotionProps: {},
        workshops: [{ id: "w-1", title: "Pottery Basics" } as Workshop],
        clearFilters: vi.fn(),
        onRetry: vi.fn(),
        gridKey: "grid",
        gridMotionProps: {},
        prefersReducedMotion: true,
        totalPages: 1,
        currentPage: 1,
        onPrevious: vi.fn(),
        onNext: vi.fn(),
        ...overrides,
    };
    return render(<ExploreResultsSection {...props} />);
}

afterEach(() => cleanup());

describe("ExploreResultsSection", () => {
    it("titles the results with a visible h2 that labels the section", () => {
        renderSection();

        const heading = screen.getByRole("heading", { level: 2 });
        expect(heading).toHaveTextContent("Upcoming workshops");
        expect(heading).toBeVisible();
        expect(screen.getByRole("region", { name: "Upcoming workshops" })).toBeInTheDocument();
        expect(screen.getByText("1 workshop found")).toBeInTheDocument();
    });

    it("puts the card titles (h3) after the h2", () => {
        renderSection();

        const headings = screen.getAllByRole("heading").map((node) => node.tagName);
        expect(headings).toEqual(["H2", "H3"]);
    });

    it("hands each card its own offer and closed flag, and never an inherited one", () => {
        const offer = { label: "Diwali offer" } as unknown as CardOffer;
        renderSection({
            total: 3,
            workshops: [
                { id: "w-1", title: "Pottery Basics" },
                { id: "w-2", title: "Sourdough" },
                { id: "constructor", title: "Odd Id" },
            ] as Workshop[],
            cardOffers: { "w-1": offer },
            closedWorkshopIds: ["w-2"],
        });

        const card = (title: string) => screen.getByRole("heading", { level: 3, name: title });
        expect(card("Pottery Basics")).toHaveAttribute("data-offer", "Diwali offer");
        expect(card("Pottery Basics")).toHaveAttribute("data-closed", "false");
        expect(card("Sourdough")).toHaveAttribute("data-offer", "none");
        expect(card("Sourdough")).toHaveAttribute("data-closed", "true");
        // "constructor" exists on every object: only own keys count.
        expect(card("Odd Id")).toHaveAttribute("data-offer", "none");
        expect(card("Odd Id")).toHaveAttribute("data-closed", "false");
    });

    it("passes no offer and nothing closed when the page has none", () => {
        renderSection();

        const card = screen.getByRole("heading", { level: 3, name: "Pottery Basics" });
        expect(card).toHaveAttribute("data-offer", "none");
        expect(card).toHaveAttribute("data-closed", "false");
    });

    it("keeps the empty state under the section h2", () => {
        renderSection({ workshops: [], total: 0 });

        expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Upcoming workshops");
        expect(
            screen.getByRole("heading", { level: 3, name: "No workshops match your filters" })
        ).toBeInTheDocument();
    });
});
