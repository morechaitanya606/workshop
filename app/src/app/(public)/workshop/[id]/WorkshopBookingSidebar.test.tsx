import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicOffer } from "@/lib/offers";
import type { PricingWorkshop } from "@/lib/pricing";
import { formatCurrency } from "@/lib/utils";
import { BOOKINGS_CLOSED_LABEL } from "@/lib/workshop-availability";
import WorkshopBookingSidebar, { type WorkshopBookingSidebarProps } from "./WorkshopBookingSidebar";
import WorkshopMobileBookingBar, { BOOKING_BAR_HEIGHT_VAR } from "./WorkshopMobileBookingBar";
import { BOOKINGS_CLOSED_NOTE, priceWorkshop } from "./workshop-pricing";

const NOW = Date.parse("2026-10-24T06:00:00.000Z");

const workshop: PricingWorkshop = {
    id: "pottery-1760000000000",
    price: 1999,
    category: "Art",
    createdAt: "2026-10-22T10:00:00.000Z",
    earlyBirdEnabled: true,
    earlyBirdDiscountType: "percentage",
    earlyBirdDiscountValue: 10,
    earlyBirdDaysAfterListing: 10,
};

const auto10: PublicOffer = {
    id: "00000000-0000-4000-8000-000000000001",
    kind: "auto",
    label: "Limited-time 10% off",
    discountType: "percentage",
    discountValue: 10,
    minGuests: null,
    minOrderAmount: null,
    startsAt: null,
    availableUntil: "2026-10-30T18:00:00.000Z",
    endsAt: "2026-10-30T18:00:00.000Z",
    code: null,
    workshopIds: null,
    categories: null,
};

function renderSidebar(props: Partial<WorkshopBookingSidebarProps> = {}) {
    const pricing = priceWorkshop({
        workshop,
        guests: 2,
        offers: [auto10],
        code: null,
        serviceFee: 99,
        now: NOW,
        bookingsClosed: props.bookingsClosed,
    });
    render(
        <WorkshopBookingSidebar
            workshopPrice={workshop.price}
            headline={pricing.headline}
            workshopDate="2026-11-08"
            formattedWorkshopTime="10:00 AM"
            workshopLocation="Studio"
            maxSeats={10}
            guests={2}
            setGuests={vi.fn()}
            availableSeatCount={3}
            seatAvailabilityLabel="3 seats available"
            isSoldOut={false}
            isBookingClosed={false}
            quote={pricing.quote}
            earlyBirdLabel="Early bird 10% off"
            couponLabel={pricing.couponLabel}
            codeInPrice={false}
            onRemoveCode={vi.fn()}
            offers={<p>Offers panel</p>}
            user={null}
            bookingLoading={false}
            holdError={null}
            loginRedirectHref="/auth/login?redirect=%2Fworkshop%2Fx"
            onBooking={vi.fn()}
            onShowCommunity={vi.fn()}
            {...props}
        />
    );
    return pricing;
}

describe("WorkshopBookingSidebar", () => {
    beforeEach(() => {
        vi.stubGlobal(
            "matchMedia",
            vi.fn(() => ({
                matches: false,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
            }))
        );
    });
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it("shows the total checkout charges and a real saving", () => {
        const pricing = renderSidebar();
        expect(screen.getByText(formatCurrency(pricing.quote.total))).toBeInTheDocument();
        expect(
            screen.getByText(`You save ${formatCurrency(pricing.quote.savings)}`)
        ).toBeInTheDocument();
        // Struck list price beside the one-guest offer price (the card price).
        expect(pricing.headline).not.toBeNull();
        expect(screen.getByText(formatCurrency(pricing.headline!.offerPrice))).toBeInTheDocument();
        expect(screen.getByText("Offers panel")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Log in to Book ->" })).toBeInTheDocument();
    });

    it("closed: label and note, no Book button, no offers, no urgency", () => {
        renderSidebar({ bookingsClosed: true });
        expect(screen.getByText(BOOKINGS_CLOSED_LABEL)).toBeInTheDocument();
        expect(screen.getByText(BOOKINGS_CLOSED_NOTE)).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: /Log in to Book/ })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /Reserve/ })).not.toBeInTheDocument();
        expect(screen.queryByText("Offers panel")).not.toBeInTheDocument();
        expect(screen.queryByText("Selling Fast")).not.toBeInTheDocument();
        expect(screen.queryByText(/Only \d+ left/)).not.toBeInTheDocument();
        expect(screen.queryByText("3 seats available")).not.toBeInTheDocument();
        expect(screen.queryByText(/Sold out/i)).not.toBeInTheDocument();
        // The plain list price, never struck.
        expect(screen.getByText(formatCurrency(workshop.price))).toBeInTheDocument();
    });

    it("few seats left: says the real count, not a pace nothing measures", () => {
        renderSidebar({ availableSeatCount: 3 });
        expect(screen.getByText("Only 3 left")).toBeInTheDocument();
        expect(screen.queryByText("Selling Fast")).not.toBeInTheDocument();
        cleanup();
        renderSidebar({ availableSeatCount: 8, seatAvailabilityLabel: "8 seats available" });
        expect(screen.queryByText(/Only \d+ left/)).not.toBeInTheDocument();
    });

    it("past the booking cut-off: no seat urgency, no discount and no Book button", () => {
        renderSidebar({
            availableSeatCount: 3,
            isBookingClosed: true,
            seatAvailabilityLabel: "Booking closed",
            headline: null,
        });
        expect(screen.queryByText(/Only \d+ left/)).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Booking Closed" })).toBeDisabled();
        expect(screen.queryByRole("link", { name: /Log in to Book/ })).not.toBeInTheDocument();
        expect(screen.queryByText("Offers panel")).not.toBeInTheDocument();
        expect(screen.queryByText(/You save/)).not.toBeInTheDocument();
        expect(document.querySelector(".line-through")).toBeNull();
    });
});

describe("WorkshopMobileBookingBar", () => {
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
        document.documentElement.style.removeProperty(BOOKING_BAR_HEIGHT_VAR);
    });

    function renderBar(props: Partial<ComponentProps<typeof WorkshopMobileBookingBar>> = {}) {
        return render(
            <WorkshopMobileBookingBar
                isPastWorkshop={false}
                isBookingClosed={false}
                bookingsClosed
                isSoldOut={false}
                workshopPrice={1999}
                headline={null}
                workshopDate="2026-11-08"
                formattedWorkshopTime="10:00 AM"
                seatAvailabilityLabel={BOOKINGS_CLOSED_LABEL}
                user={{ id: "u1" }}
                bookingLoading={false}
                holdError={null}
                loginRedirectHref="/auth/login"
                isMounted
                onBooking={vi.fn()}
                onShowCommunity={vi.fn()}
                {...props}
            />
        );
    }

    it("closed: shows Bookings closed instead of a Book button", () => {
        renderBar();
        expect(screen.getByText(BOOKINGS_CLOSED_NOTE)).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /Reserve/ })).not.toBeInTheDocument();
    });

    it("publishes its real height for the page's bottom padding, and clears it with the bar", () => {
        const heights = { current: 118 };
        vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
            () => ({ height: heights.current }) as DOMRect
        );
        const watchers: Array<() => void> = [];
        const disconnect = vi.fn();
        vi.stubGlobal(
            "ResizeObserver",
            class {
                constructor(callback: () => void) {
                    watchers.push(callback);
                }
                observe = vi.fn();
                disconnect = disconnect;
            }
        );
        const root = document.documentElement.style;

        const { unmount } = renderBar({ bookingsClosed: false });
        expect(root.getPropertyValue(BOOKING_BAR_HEIGHT_VAR)).toBe("118px");

        // An error line appears under the button: the bar is taller, so is the padding.
        heights.current = 140.4;
        act(() => watchers.forEach((notify) => notify()));
        expect(root.getPropertyValue(BOOKING_BAR_HEIGHT_VAR)).toBe("141px");

        // Hidden (900px and up): no height, so the page keeps its fallback.
        heights.current = 0;
        act(() => watchers.forEach((notify) => notify()));
        expect(root.getPropertyValue(BOOKING_BAR_HEIGHT_VAR)).toBe("");

        heights.current = 118;
        act(() => watchers.forEach((notify) => notify()));
        unmount();
        expect(disconnect).toHaveBeenCalled();
        expect(root.getPropertyValue(BOOKING_BAR_HEIGHT_VAR)).toBe("");
    });

    it("renders no bar, and publishes nothing, for a past workshop", () => {
        renderBar({ isPastWorkshop: true });
        expect(screen.queryByText(BOOKINGS_CLOSED_NOTE)).not.toBeInTheDocument();
        expect(document.documentElement.style.getPropertyValue(BOOKING_BAR_HEIGHT_VAR)).toBe("");
    });
});
