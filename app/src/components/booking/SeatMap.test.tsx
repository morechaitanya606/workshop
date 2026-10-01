import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SeatMap from "./SeatMap";

afterEach(() => cleanup());

describe("SeatMap", () => {
    it("renders a table of chairs with state-aware labels and a live summary", () => {
        render(
            <SeatMap
                maxSeats={8}
                seatsRemaining={4}
                guests={2}
                maxGuests={4}
                onGuestsChange={vi.fn()}
            />
        );

        expect(
            (screen.getByRole("button", { name: "Seat 1, taken" }) as HTMLButtonElement).disabled
        ).toBe(true);
        expect(
            screen
                .getByRole("button", { name: "Seat 5, yours, selected" })
                .getAttribute("aria-pressed")
        ).toBe("true");
        expect(
            screen.getByRole("button", { name: "Seat 7, available" }).getAttribute("aria-pressed")
        ).toBe("false");
        expect(screen.getByRole("status").textContent).toBe("4 of 8 seats left, you are booking 2");
        expect(screen.getByText(/only 4 seats left/i)).toBeTruthy();
    });

    it("adds and removes guests from chair taps and respects the bounds", () => {
        const onGuestsChange = vi.fn();
        render(
            <SeatMap
                maxSeats={8}
                seatsRemaining={4}
                guests={2}
                maxGuests={3}
                onGuestsChange={onGuestsChange}
            />
        );

        fireEvent.click(screen.getByRole("button", { name: "Seat 7, available" }));
        // Seat 7 is the 3rd chair after the 4 taken ones, so 3 guests.
        expect(onGuestsChange).toHaveBeenLastCalledWith(3);

        fireEvent.click(screen.getByRole("button", { name: "Seat 8, available" }));
        // Capped at maxGuests (3), which is more than the current 2.
        expect(onGuestsChange).toHaveBeenLastCalledWith(3);

        fireEvent.click(screen.getByRole("button", { name: "Seat 6, yours, selected" }));
        expect(onGuestsChange).toHaveBeenLastCalledWith(1);

        fireEvent.click(screen.getByRole("button", { name: "Add one guest" }));
        expect(onGuestsChange).toHaveBeenLastCalledWith(3);
        fireEvent.click(screen.getByRole("button", { name: "Remove one guest" }));
        expect(onGuestsChange).toHaveBeenLastCalledWith(1);
    });

    it("disables the stepper at the limits and when locked", () => {
        const { rerender } = render(
            <SeatMap
                maxSeats={8}
                seatsRemaining={4}
                guests={1}
                maxGuests={4}
                onGuestsChange={vi.fn()}
            />
        );
        expect(
            (screen.getByRole("button", { name: "Remove one guest" }) as HTMLButtonElement).disabled
        ).toBe(true);

        rerender(
            <SeatMap
                maxSeats={8}
                seatsRemaining={4}
                guests={4}
                maxGuests={4}
                onGuestsChange={vi.fn()}
            />
        );
        expect(
            (screen.getByRole("button", { name: "Add one guest" }) as HTMLButtonElement).disabled
        ).toBe(true);

        rerender(
            <SeatMap
                maxSeats={8}
                seatsRemaining={4}
                guests={2}
                maxGuests={4}
                onGuestsChange={vi.fn()}
                disabled
                disabledReason="Locked for payment."
            />
        );
        expect(
            (screen.getByRole("button", { name: "Seat 7, available" }) as HTMLButtonElement)
                .disabled
        ).toBe(true);
        expect(screen.getByText("Locked for payment.")).toBeTruthy();
    });

    it("uses rows for mid-size rooms and a bar for very large ones", () => {
        const { rerender } = render(
            <SeatMap
                maxSeats={24}
                seatsRemaining={10}
                guests={1}
                maxGuests={10}
                onGuestsChange={vi.fn()}
            />
        );
        expect(screen.getByText("Front of the room")).toBeTruthy();
        expect(screen.getAllByRole("button", { name: /^Seat \d+,/ })).toHaveLength(24);

        rerender(
            <SeatMap
                maxSeats={300}
                seatsRemaining={120}
                guests={2}
                maxGuests={20}
                onGuestsChange={vi.fn()}
            />
        );
        // Never one chair per seat at this size: only the customer's own chairs are drawn.
        expect(screen.getAllByRole("button", { name: /^Seat \d+, yours/ })).toHaveLength(2);
        expect(screen.queryByText("Front of the room")).toBeNull();
        expect(screen.getByRole("button", { name: "Add a seat" })).toBeTruthy();
        expect(screen.queryByText(/only \d+ seats? left/i)).toBeNull();
    });

    it("renders nothing without capacity", () => {
        const { container } = render(
            <SeatMap
                maxSeats={0}
                seatsRemaining={0}
                guests={1}
                maxGuests={1}
                onGuestsChange={vi.fn()}
            />
        );
        expect(container.innerHTML).toBe("");
    });
});
