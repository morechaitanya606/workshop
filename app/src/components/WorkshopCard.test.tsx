import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Workshop } from "@/lib/data";
import type { CardOffer } from "@/lib/offers";
import WorkshopCard, { WorkshopPriceTag } from "./WorkshopCard";

vi.mock("next/image", () => ({
    // eslint-disable-next-line @next/next/no-img-element
    default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));
vi.mock("next/link", () => ({
    default: ({
        href,
        children,
        className,
    }: {
        href: string;
        children: ReactNode;
        className?: string;
    }) => (
        <a href={href} className={className}>
            {children}
        </a>
    ),
}));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null, session: null }) }));
vi.mock("@/lib/api-client", () => ({
    addFavorite: vi.fn(),
    getFavorites: vi.fn(),
    removeFavorite: vi.fn(),
}));
vi.mock("@/lib/use-reduced-motion", () => ({ usePrefersReducedMotion: () => false }));

// 24 Oct 2026, 12:00 IST.
const NOW = Date.parse("2026-10-24T06:30:00.000Z");
const TODAY = "2026-10-24";

const workshop: Workshop = {
    id: "pottery-basics-1761000000000",
    title: "Pottery Basics",
    description: "Learn to throw a bowl on the wheel.",
    category: "Pottery",
    price: 2000,
    location: "Clay Studio",
    city: "Pune",
    duration: "3 hours",
    date: "2026-11-20",
    time: "10:00",
    maxSeats: 10,
    seatsRemaining: 8,
    coverImage: "/images/pottery.jpg",
    galleryImages: [],
    rating: 0,
    reviewCount: 0,
    hostName: "Asha",
    hostAvatar: "",
    hostBio: "",
    whatYouLearn: [],
    materialsProvided: ["Clay"],
};

const offer: CardOffer = {
    listPrice: 2000,
    offerPrice: 1800,
    savings: 200,
    label: "Diwali offer",
    labels: ["Diwali offer"],
    discountText: "10% off",
    endsAt: "2026-11-01T00:00:00.000Z",
    availableUntil: "2026-11-01T00:00:00.000Z",
    couponId: "11111111-1111-4111-8111-111111111111",
    perBooking: false,
};

function renderCard(props: Partial<Parameters<typeof WorkshopCard>[0]> = {}) {
    return render(
        <WorkshopCard workshop={workshop} todayIso={TODAY} animateOnScroll={false} {...props} />
    );
}

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

describe("WorkshopCard without offer or closed props", () => {
    it("renders the same markup as with neutral props (unchanged card)", () => {
        const plain = renderCard().container.innerHTML;
        cleanup();
        const neutral = renderCard({ offer: null, bookingsClosed: false }).container.innerHTML;
        expect(neutral).toBe(plain);
    });

    it("shows only the list price, the seats line hidden on phones, and nothing new", () => {
        const { container } = renderCard();
        const price = screen.getByText("₹2,000");
        expect(price.className).toBe(
            "text-sm sm:text-lg font-inter font-bold text-terracotta ml-auto"
        );
        expect(container.querySelector("s")).toBeNull();
        expect(screen.queryByText("Bookings closed")).toBeNull();
        expect(screen.getByText("Seats available").closest("div.mt-2")).toHaveClass(
            "hidden",
            "sm:block"
        );
        // The exact number is not shown.
        expect(screen.queryByText(/\d+ seats? available/)).toBeNull();
    });

    it("keeps the bottom row's classes exactly as before (no wrapping) without an offer", () => {
        const { container } = renderCard();
        expect(container.querySelector("div.border-t")?.className).toBe(
            "flex items-center justify-between pt-2 border-t border-gray-100 mt-auto sm:mt-0"
        );
    });
});

describe("WorkshopCard with an offer", () => {
    it("shows the label, the struck list price and the offer price", () => {
        const { container } = renderCard({ offer });
        expect(screen.getByText("Diwali offer")).toBeInTheDocument();
        const struck = container.querySelector("s");
        expect(struck).toHaveTextContent("Regular price ₹2,000");
        expect(screen.getByText("₹1,800", { exact: false })).toBeInTheDocument();
    });

    it("renders the end date only after mount", () => {
        renderCard({ offer });
        // After mount (effects ran inside render's act): the advertised end in IST.
        expect(screen.getByText("10% off · Ends 1 Nov, 5:30 am")).toBeInTheDocument();
    });

    it("drops the offer after mount once availableUntil has passed", () => {
        vi.setSystemTime(Date.parse("2026-11-01T00:00:00.000Z"));
        const { container } = renderCard({ offer });
        expect(screen.queryByText("Diwali offer")).toBeNull();
        expect(container.querySelector("s")).toBeNull();
        expect(screen.getByText("₹2,000")).toBeInTheDocument();
    });

    it("drops the offer when it ends while the page stays open", () => {
        vi.useRealTimers();
        vi.useFakeTimers();
        vi.setSystemTime(Date.parse("2026-10-31T23:59:00.000Z"));
        renderCard({ offer });
        expect(screen.getByText("Diwali offer")).toBeInTheDocument();
        act(() => {
            vi.advanceTimersByTime(61_000);
        });
        expect(screen.queryByText("Diwali offer")).toBeNull();
    });

    it("never strikes a price that is not this card's list price or not a discount", () => {
        const { container, rerender } = renderCard({ offer: { ...offer, listPrice: 2500 } });
        expect(container.querySelector("s")).toBeNull();
        rerender(
            <WorkshopCard
                workshop={workshop}
                todayIso={TODAY}
                animateOnScroll={false}
                offer={{ ...offer, offerPrice: 2000, savings: 0 }}
            />
        );
        expect(container.querySelector("s")).toBeNull();
        expect(screen.queryByText("Diwali offer")).toBeNull();
    });

    it("shows a per-booking discount beside the list price, without a per-person struck price", () => {
        const { container } = renderCard({
            offer: {
                ...offer,
                offerPrice: 1800,
                label: "Community price drop",
                labels: ["Community price drop"],
                discountText: "₹200 off per booking",
                perBooking: true,
                endsAt: null,
                availableUntil: null,
            },
        });
        expect(screen.getByText("Community price drop")).toBeInTheDocument();
        expect(container.querySelector("s")).toBeNull();
        expect(screen.getByText("₹2,000")).toBeInTheDocument();
        expect(screen.getByText("₹200 off per booking")).toBeInTheDocument();
    });

    it("shows no offer on a sold-out workshop", () => {
        renderCard({ workshop: { ...workshop, seatsRemaining: 0 }, offer });
        expect(screen.queryByText("Diwali offer")).toBeNull();
    });

    it("lets the label wrap and the row wrap, so the badge is never squeezed to an empty pill", () => {
        // A 240px phone rail card leaves ~120px for this row; the price alone needs ~97px.
        const label = "Community price drop: WhatsApp group";
        const { container } = renderCard({ offer: { ...offer, label, labels: [label] } });
        const badge = screen.getByText(label);
        expect(badge).not.toHaveClass("truncate");
        expect(badge).toHaveClass("break-words", "max-w-full", "leading-tight");
        expect(badge.parentElement).toHaveClass("flex-wrap", "gap-y-1");
        // The price stays one unbreakable block on the right.
        expect(container.querySelector("s")?.parentElement).toHaveClass(
            "shrink-0",
            "whitespace-nowrap",
            "ml-auto"
        );
    });
});

describe("WorkshopCard with bookings closed", () => {
    it("shows a Bookings closed pill (visible on phones) instead of seats, and no offer", () => {
        const { container } = renderCard({ bookingsClosed: true, offer });
        const pill = screen.getByText("Bookings closed");
        expect(pill.parentElement).toHaveClass("mt-2");
        expect(pill.parentElement).not.toHaveClass("hidden");
        expect(screen.queryByText("Seats available")).toBeNull();
        expect(screen.queryByText("Sold out")).toBeNull();
        expect(screen.queryByText("Diwali offer")).toBeNull();
        expect(container.querySelector("s")).toBeNull();
        expect(screen.getByText("₹2,000")).toBeInTheDocument();
    });

    it("keeps the pill on one line on a 240px phone rail card", () => {
        renderCard({ bookingsClosed: true });
        const pill = screen.getByText("Bookings closed");
        expect(pill).toHaveClass("whitespace-nowrap", "px-2", "tracking-wide");
    });

    it("shows no starting-soon countdown", () => {
        const soon = { ...workshop, date: "2026-10-25", time: "10:00" };
        renderCard({ workshop: soon });
        expect(screen.getByText(/Starts in \d+h/)).toBeInTheDocument();
        cleanup();
        renderCard({ workshop: soon, bookingsClosed: true });
        expect(screen.queryByText(/Starts in \d+h/)).toBeNull();
    });
});

describe("WorkshopPriceTag", () => {
    it("is just the price without offer or closed", () => {
        const { container } = render(<WorkshopPriceTag price={2000} className="price" />);
        expect(container.innerHTML).toBe('<span class="price">₹2,000</span>');
    });

    it("wraps a long label instead of truncating it", () => {
        render(<WorkshopPriceTag price={2000} offer={offer} />);
        expect(screen.getByText("Diwali offer")).not.toHaveClass("truncate");
        expect(screen.getByText("Diwali offer")).toHaveClass("break-words", "max-w-[12rem]");
    });

    it("shows no offer on a sold-out workshop, like the card does", () => {
        const { container } = render(<WorkshopPriceTag price={2000} offer={offer} soldOut />);
        expect(screen.queryByText("Diwali offer")).toBeNull();
        expect(container.querySelector("s")).toBeNull();
        expect(container).toHaveTextContent("₹2,000");
        expect(container).not.toHaveTextContent("₹1,800");
    });

    it("shows the offer and, when closed, the pill without an offer", () => {
        const { container } = render(<WorkshopPriceTag price={2000} offer={offer} />);
        expect(screen.getByText("Diwali offer")).toBeInTheDocument();
        expect(container.querySelector("s")).toHaveTextContent("₹2,000");
        cleanup();
        const closed = render(<WorkshopPriceTag price={2000} offer={offer} bookingsClosed />);
        expect(screen.getByText("Bookings closed")).toBeInTheDocument();
        expect(screen.queryByText("Diwali offer")).toBeNull();
        expect(closed.container.querySelector("s")).toBeNull();
    });
});
