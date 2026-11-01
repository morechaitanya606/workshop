import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import WorkshopGuestStepper, { MAX_GUESTS_PER_BOOKING } from "./WorkshopGuestStepper";

function renderStepper(guests: number, availableSeatCount: number) {
    const setGuests = vi.fn();
    render(
        <WorkshopGuestStepper
            guests={guests}
            setGuests={setGuests}
            availableSeatCount={availableSeatCount}
            idPrefix="test"
        />
    );
    return setGuests;
}

describe("WorkshopGuestStepper", () => {
    afterEach(() => {
        cleanup();
    });

    it("is a labelled group, and the count is read out with its unit", () => {
        renderStepper(2, 6);
        expect(screen.getByRole("group", { name: "Guests" })).toBeInTheDocument();
        expect(screen.getByText("2 guests")).toBeInTheDocument();
        cleanup();
        renderStepper(1, 6);
        expect(screen.getByText("1 guest")).toBeInTheDocument();
    });

    it("steps one guest at a time", () => {
        const setGuests = renderStepper(2, 6);
        fireEvent.click(screen.getByRole("button", { name: "One guest more" }));
        expect(setGuests).toHaveBeenLastCalledWith(3);
        fireEvent.click(screen.getByRole("button", { name: "One guest fewer" }));
        expect(setGuests).toHaveBeenLastCalledWith(1);
    });

    it("stops at one guest and at the seats left", () => {
        const fewer = () => screen.getByRole("button", { name: "One guest fewer" });
        const more = () => screen.getByRole("button", { name: "One guest more" });
        const setAtOne = renderStepper(1, 3);
        expect(fewer()).toHaveAttribute("aria-disabled", "true");
        expect(more()).toHaveAttribute("aria-disabled", "false");
        fireEvent.click(fewer());
        expect(setAtOne).not.toHaveBeenCalled();
        cleanup();
        const setAtMax = renderStepper(3, 3);
        expect(more()).toHaveAttribute("aria-disabled", "true");
        expect(fewer()).toHaveAttribute("aria-disabled", "false");
        fireEvent.click(more());
        expect(setAtMax).not.toHaveBeenCalled();
    });

    it("never goes past what one seat hold takes, however many seats are left", () => {
        const setGuests = renderStepper(MAX_GUESTS_PER_BOOKING, 50);
        const more = screen.getByRole("button", { name: "One guest more" });
        expect(more).toHaveAttribute("aria-disabled", "true");
        fireEvent.click(more);
        expect(setGuests).not.toHaveBeenCalled();
    });

    it("keeps the keyboard focus on a button that has reached its limit", () => {
        const stepper = (guests: number) => (
            <WorkshopGuestStepper
                guests={guests}
                setGuests={vi.fn()}
                availableSeatCount={3}
                idPrefix="focus"
            />
        );
        const { rerender } = render(stepper(2));
        const more = screen.getByRole("button", { name: "One guest more" });
        more.focus();
        rerender(stepper(3));
        // Same element, still focused, now marked unavailable: a browser takes the focus away
        // from a button that becomes `disabled`, which ended keyboard stepping at the limit.
        expect(screen.getByRole("button", { name: "One guest more" })).toBe(more);
        expect(more).toHaveAttribute("aria-disabled", "true");
        expect(more).toHaveFocus();
    });
});
