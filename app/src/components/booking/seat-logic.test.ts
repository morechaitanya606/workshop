import { describe, expect, it } from "vitest";
import {
    barSegments,
    clampGuests,
    computeSeatStates,
    extractAvailableSeats,
    getMaxSelectableGuests,
    getSeatLayoutMode,
    guestsAfterSeatClick,
    MAX_GUESTS_PER_BOOKING,
    normalizeCapacity,
    seatAnnouncement,
    seatAriaLabel,
    shouldShowLowSeatsBadge,
    summarizeSeats,
    tableChairPositions,
} from "./seat-logic";

describe("normalizeCapacity", () => {
    it("derives taken seats from capacity and seats remaining", () => {
        expect(normalizeCapacity({ maxSeats: 12, seatsRemaining: 4 })).toEqual({
            capacity: 12,
            remaining: 4,
            taken: 8,
        });
    });

    it("clamps inconsistent or invalid input instead of throwing", () => {
        expect(normalizeCapacity({ maxSeats: 10, seatsRemaining: 99 })).toEqual({
            capacity: 10,
            remaining: 10,
            taken: 0,
        });
        expect(normalizeCapacity({ maxSeats: 10, seatsRemaining: -3 }).remaining).toBe(0);
        expect(normalizeCapacity({ maxSeats: Number.NaN, seatsRemaining: 2 })).toEqual({
            capacity: 0,
            remaining: 0,
            taken: 0,
        });
    });
});

describe("computeSeatStates", () => {
    it("orders chairs as taken, yours, then available", () => {
        expect(computeSeatStates({ maxSeats: 6, seatsRemaining: 4, guests: 2 })).toEqual([
            "taken",
            "taken",
            "yours",
            "yours",
            "available",
            "available",
        ]);
    });

    it("never draws more of your chairs than there are seats left", () => {
        const states = computeSeatStates({ maxSeats: 5, seatsRemaining: 2, guests: 9 });
        expect(states.filter((state) => state === "yours")).toHaveLength(2);
        expect(states.filter((state) => state === "taken")).toHaveLength(3);
    });

    it("handles a sold-out room and an empty room", () => {
        expect(
            computeSeatStates({ maxSeats: 3, seatsRemaining: 0, guests: 1 }).every(
                (state) => state === "taken"
            )
        ).toBe(true);
        expect(
            computeSeatStates({ maxSeats: 3, seatsRemaining: 3, guests: 0 }).every(
                (state) => state === "available"
            )
        ).toBe(true);
        expect(computeSeatStates({ maxSeats: 0, seatsRemaining: 0, guests: 1 })).toEqual([]);
    });
});

describe("guest clamps", () => {
    it("bounds the per-booking maximum by seats left and the API cap", () => {
        expect(getMaxSelectableGuests(4)).toBe(4);
        expect(getMaxSelectableGuests(500)).toBe(MAX_GUESTS_PER_BOOKING);
    });

    it("is never below 1, nor below the guests already held", () => {
        expect(getMaxSelectableGuests(0)).toBe(1);
        expect(getMaxSelectableGuests(1, 3)).toBe(3);
        expect(getMaxSelectableGuests(0, 25)).toBe(MAX_GUESTS_PER_BOOKING);
    });

    it("clamps requested guests into 1..max", () => {
        expect(clampGuests(0, 5)).toBe(1);
        expect(clampGuests(-4, 5)).toBe(1);
        expect(clampGuests(3, 5)).toBe(3);
        expect(clampGuests(9, 5)).toBe(5);
        expect(clampGuests(Number.NaN, 5)).toBe(1);
        expect(clampGuests(2.9, 5)).toBe(2);
    });
});

describe("guestsAfterSeatClick", () => {
    // taken, taken, yours, yours, available, available
    const states = computeSeatStates({ maxSeats: 6, seatsRemaining: 4, guests: 2 });

    it("ignores taken chairs", () => {
        expect(guestsAfterSeatClick({ states, index: 0, maxGuests: 4 })).toBeNull();
    });

    it("books up to and including a tapped available chair", () => {
        expect(guestsAfterSeatClick({ states, index: 4, maxGuests: 4 })).toBe(3);
        expect(guestsAfterSeatClick({ states, index: 5, maxGuests: 4 })).toBe(4);
    });

    it("never exceeds the maximum", () => {
        expect(guestsAfterSeatClick({ states, index: 5, maxGuests: 3 })).toBe(3);
    });

    it("releases a tapped chair of yours and the ones after it, but keeps at least one", () => {
        expect(guestsAfterSeatClick({ states, index: 3, maxGuests: 4 })).toBe(1);
        // Releasing the first of your chairs would drop to 0 -> clamps to 1 -> no change.
        const three = computeSeatStates({ maxSeats: 6, seatsRemaining: 4, guests: 3 });
        expect(guestsAfterSeatClick({ states: three, index: 4, maxGuests: 4 })).toBe(2);
        expect(guestsAfterSeatClick({ states: three, index: 2, maxGuests: 4 })).toBe(1);
    });

    it("returns null when nothing would change", () => {
        const one = computeSeatStates({ maxSeats: 6, seatsRemaining: 4, guests: 1 });
        expect(guestsAfterSeatClick({ states: one, index: 2, maxGuests: 4 })).toBeNull();
    });
});

describe("layout and summary helpers", () => {
    it("picks a layout by capacity", () => {
        expect(getSeatLayoutMode(1)).toBe("table");
        expect(getSeatLayoutMode(12)).toBe("table");
        expect(getSeatLayoutMode(13)).toBe("rows");
        expect(getSeatLayoutMode(40)).toBe("rows");
        expect(getSeatLayoutMode(41)).toBe("compact");
    });

    it("shows the urgency badge only for 1..5 seats", () => {
        expect(shouldShowLowSeatsBadge(0)).toBe(false);
        expect(shouldShowLowSeatsBadge(1)).toBe(true);
        expect(shouldShowLowSeatsBadge(5)).toBe(true);
        expect(shouldShowLowSeatsBadge(6)).toBe(false);
    });

    it("builds screen-reader text", () => {
        const summary = summarizeSeats({ maxSeats: 12, seatsRemaining: 4, guests: 2 });
        expect(summary).toMatchObject({ capacity: 12, remaining: 4, taken: 8, yours: 2, open: 2 });
        expect(seatAnnouncement(summary)).toBe("4 of 12 seats left, you are booking 2");
        expect(seatAriaLabel(4, "available")).toBe("Seat 5, available");
        expect(seatAriaLabel(0, "taken")).toBe("Seat 1, taken");
        expect(seatAriaLabel(2, "yours")).toBe("Seat 3, yours, selected");
    });

    it("places table chairs deterministically, starting at 12 o'clock", () => {
        const positions = tableChairPositions(4);
        expect(positions).toEqual([
            { left: 50, top: 10 },
            { left: 90, top: 50 },
            { left: 50, top: 90 },
            { left: 10, top: 50 },
        ]);
        expect(tableChairPositions(0)).toEqual([]);
    });

    it("keeps compact bar segments within 100%", () => {
        const segments = barSegments(
            summarizeSeats({ maxSeats: 200, seatsRemaining: 50, guests: 4 })
        );
        expect(segments.taken + segments.yours + segments.open).toBeCloseTo(100, 0);
        expect(barSegments(summarizeSeats({ maxSeats: 0, seatsRemaining: 0, guests: 1 }))).toEqual({
            taken: 0,
            yours: 0,
            open: 100,
        });
    });
});

describe("extractAvailableSeats", () => {
    it("reads availableSeats from error details", () => {
        expect(extractAvailableSeats({ message: "x", details: { availableSeats: 3 } })).toBe(3);
        expect(extractAvailableSeats({ details: { availableSeats: 0 } })).toBe(0);
    });

    it("falls back to the message", () => {
        expect(extractAvailableSeats({ message: "Only 2 seats left for this workshop." })).toBe(2);
        expect(extractAvailableSeats({ message: "This workshop is sold out." })).toBe(0);
    });

    it("returns null when there is nothing to read", () => {
        expect(extractAvailableSeats(new Error("boom"))).toBeNull();
        expect(extractAvailableSeats(null)).toBeNull();
    });
});
