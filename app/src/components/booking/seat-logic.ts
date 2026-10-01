/**
 * Pure seat-map logic. No React, no Date/Math.random, so it is safe to call during render
 * (server and client always agree) and trivially unit-testable.
 *
 * The data model is a *count*, not named seats: the server only knows how many spaces a
 * workshop has, how many are booked and how many guests a hold covers. The chairs in the
 * UI are therefore a visual of those counts: `taken` chairs first, then the chairs the
 * customer is booking right now (`yours`), then whatever is still `available`.
 */

export type SeatState = "taken" | "available" | "yours";

/** Mirrors `bookingHoldSchema` (guests: 1..20) in `src/lib/validators.ts`. */
export const MAX_GUESTS_PER_BOOKING = 20;
/** Show the "Only N seats left" urgency badge at or below this many open seats. */
export const LOW_SEATS_THRESHOLD = 5;
/** Up to this capacity the chairs are drawn around a round table. */
export const TABLE_LAYOUT_MAX_SEATS = 12;
/** Up to this capacity the chairs are drawn in rows; beyond it we collapse to a bar. */
export const ROWS_LAYOUT_MAX_SEATS = 40;

export type SeatLayoutMode = "table" | "rows" | "compact";

function toInt(value: unknown, fallback = 0) {
    const numeric = typeof value === "number" ? value : Number(value);
    return Number.isFinite(numeric) ? Math.floor(numeric) : fallback;
}

function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
}

export type SeatCapacity = {
    /** Total spaces in the room. */
    capacity: number;
    /** Spaces still bookable (clamped into 0..capacity). */
    remaining: number;
    /** Spaces already booked by other people. */
    taken: number;
};

export function normalizeCapacity(input: {
    maxSeats: number;
    seatsRemaining: number;
}): SeatCapacity {
    const capacity = Math.max(0, toInt(input.maxSeats));
    const remaining = clamp(toInt(input.seatsRemaining), 0, capacity);
    return { capacity, remaining, taken: capacity - remaining };
}

/**
 * The most guests one booking may cover: the API cap, bounded by the seats left. Never below
 * the guests already held (a hold the customer already has is theirs) and never below 1.
 */
export function getMaxSelectableGuests(seatsRemaining: number, heldGuests = 0) {
    const remaining = Math.max(0, toInt(seatsRemaining));
    const held = Math.max(0, toInt(heldGuests));
    return Math.max(1, Math.min(MAX_GUESTS_PER_BOOKING, Math.max(remaining, held)));
}

/** Clamps a requested guest count into 1..max (non-numeric input becomes 1). */
export function clampGuests(requested: number, maxSelectable: number) {
    const max = Math.max(1, toInt(maxSelectable, 1));
    return clamp(toInt(requested, 1), 1, max);
}

export function computeSeatStates(input: {
    maxSeats: number;
    seatsRemaining: number;
    guests: number;
}): SeatState[] {
    const { capacity, remaining, taken } = normalizeCapacity(input);
    const yours = clamp(toInt(input.guests), 0, remaining);

    return Array.from({ length: capacity }, (_, index): SeatState => {
        if (index < taken) return "taken";
        if (index < taken + yours) return "yours";
        return "available";
    });
}

export type SeatSummary = SeatCapacity & {
    /** Chairs drawn as "yours". */
    yours: number;
    /** Open chairs left after the customer's own. */
    open: number;
};

export function summarizeSeats(input: {
    maxSeats: number;
    seatsRemaining: number;
    guests: number;
}): SeatSummary {
    const base = normalizeCapacity(input);
    const yours = clamp(toInt(input.guests), 0, base.remaining);
    return { ...base, yours, open: base.remaining - yours };
}

export function getSeatLayoutMode(capacity: number): SeatLayoutMode {
    const seats = Math.max(0, toInt(capacity));
    if (seats <= TABLE_LAYOUT_MAX_SEATS) return "table";
    if (seats <= ROWS_LAYOUT_MAX_SEATS) return "rows";
    return "compact";
}

export function shouldShowLowSeatsBadge(remaining: number) {
    const seats = toInt(remaining);
    return seats > 0 && seats <= LOW_SEATS_THRESHOLD;
}

export function seatAriaLabel(index: number, state: SeatState) {
    const label = state === "yours" ? "yours, selected" : state;
    return `Seat ${index + 1}, ${label}`;
}

/** Text for the polite live region, e.g. "4 of 12 seats left, you are booking 2". */
export function seatAnnouncement(input: SeatSummary) {
    const left = `${input.remaining} of ${input.capacity} ${input.capacity === 1 ? "seat" : "seats"} left`;
    return `${left}, you are booking ${input.yours}`;
}

/**
 * What a tap on a chair means, as the new guest count (or `null` for "nothing changes").
 *
 * - available chair: it becomes yours, and so does every open chair before it (the chairs
 *   you book are always one block right after the taken ones).
 * - your chair: it and the chairs after it are released, but never below 1 guest.
 * - taken chair: nothing.
 */
export function guestsAfterSeatClick(input: {
    states: SeatState[];
    index: number;
    maxGuests: number;
}): number | null {
    const { states, index } = input;
    const state = states[index];
    if (!state || state === "taken") return null;

    const firstOwnable = states.findIndex((seat) => seat !== "taken");
    if (firstOwnable === -1) return null;
    const current = states.filter((seat) => seat === "yours").length;

    const requested = state === "available" ? index - firstOwnable + 1 : index - firstOwnable;
    const next = clampGuests(requested, input.maxGuests);
    return next === current ? null : next;
}

/** Positions (percent of the square container) for chairs spaced evenly round a table. */
export function tableChairPositions(count: number, radiusPercent = 40) {
    const total = Math.max(0, toInt(count));
    return Array.from({ length: total }, (_, index) => {
        // Start at 12 o'clock and go clockwise. Rounded so server and browser always agree.
        const angle = (index / Math.max(total, 1)) * Math.PI * 2 - Math.PI / 2;
        return {
            left: Math.round((50 + Math.cos(angle) * radiusPercent) * 100) / 100,
            top: Math.round((50 + Math.sin(angle) * radiusPercent) * 100) / 100,
        };
    });
}

/** Percent widths for the compact bar: taken | yours | open. Always sums to 100. */
export function barSegments(summary: SeatSummary) {
    if (summary.capacity <= 0) return { taken: 0, yours: 0, open: 100 };
    const taken = Math.round((summary.taken / summary.capacity) * 1000) / 10;
    const yours = Math.round((summary.yours / summary.capacity) * 1000) / 10;
    return { taken, yours, open: Math.round((100 - taken - yours) * 10) / 10 };
}

/**
 * Pulls "how many seats are really left" out of a failed hold request. Duck-typed on the
 * `{ details: { availableSeats } }` shape the hold route returns so this stays pure.
 */
export function extractAvailableSeats(error: unknown): number | null {
    if (!error || typeof error !== "object") return null;
    const candidate = error as { details?: unknown; message?: unknown };

    if (candidate.details && typeof candidate.details === "object") {
        const details = candidate.details as Record<string, unknown>;
        const raw = details.availableSeats ?? details.available_seats ?? details.available;
        const numeric = typeof raw === "number" ? raw : Number(raw);
        if (raw !== undefined && raw !== null && Number.isFinite(numeric)) {
            return Math.max(0, Math.floor(numeric));
        }
    }

    const message = typeof candidate.message === "string" ? candidate.message : "";
    const match = /only\s+(\d+)\s+seat/i.exec(message);
    if (match?.[1]) return Math.max(0, Number.parseInt(match[1], 10));
    if (/sold out/i.test(message)) return 0;
    return null;
}
