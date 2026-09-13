export const BOOKING_CUTOFF_HOURS = 3;

export function getWorkshopDateTime(date: string, time?: string | null) {
    if (!date) return null;
    const safeTime = (time && time.trim()) || "00:00";
    // Append IST offset to ensure consistent parsing regardless of server TZ
    const isoString = `${date}T${safeTime}:00+05:30`;
    const workshopDateTime = new Date(isoString);
    if (Number.isNaN(workshopDateTime.getTime())) {
        return null;
    }
    return workshopDateTime;
}

export function isBookingClosedNow(
    date: string,
    time?: string | null,
    now: Date = new Date(),
    cutoffHours: number = BOOKING_CUTOFF_HOURS
) {
    const workshopDateTime = getWorkshopDateTime(date, time);
    if (!workshopDateTime) return false;
    const cutoffMs = cutoffHours * 60 * 60 * 1000;
    return now.getTime() >= workshopDateTime.getTime() - cutoffMs;
}

export type EarlyBirdInput = {
    /** Price per guest, in rupees. */
    price: number;
    guests: number;
    enabled?: boolean | null;
    discountType?: string | null;
    discountValue?: number | null;
    daysAfterListing?: number | null;
    /** Workshop `created_at`. */
    createdAt?: string | Date | null;
    now?: Date;
};

/**
 * Early-bird discount, in rupees.
 *
 * This MUST stay byte-for-byte equivalent to the SQL in
 * `confirm_booking_from_hold` (20260714193000_early_bird_checkout_totals.sql), because that
 * RPC recomputes the value and raises EARLY_BIRD_DISCOUNT_MISMATCH if the caller disagrees —
 * after the payment has been captured. Specifically:
 *
 *  - eligibility uses `ceil(days between UTC day-truncated now and created_at) <= daysAfterListing`
 *    (UTC, not local midnight — a local-midnight comparison is off by one at the boundary);
 *  - percentage uses `floor(subtotal * value / 100)`; fixed is `value * guests`;
 *  - the result is clamped to [0, subtotal].
 */
export function computeEarlyBirdDiscount(input: EarlyBirdInput): number {
    const guests = Math.max(0, Math.trunc(Number(input.guests) || 0));
    const price = Math.max(0, Number(input.price) || 0);
    const subtotal = price * guests;
    const value = Math.max(0, Number(input.discountValue) || 0);
    const daysAfterListing = Math.max(0, Number(input.daysAfterListing) || 0);

    if (!input.enabled || value <= 0 || daysAfterListing <= 0 || !input.createdAt) {
        return 0;
    }

    const createdAt = input.createdAt instanceof Date ? input.createdAt : new Date(input.createdAt);
    if (Number.isNaN(createdAt.getTime())) return 0;

    const now = input.now ?? new Date();

    // date_trunc('day', ...) in UTC, matching Postgres.
    const truncUtcDay = (value: Date) =>
        Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());

    const elapsedDays = Math.ceil(
        (truncUtcDay(now) - truncUtcDay(createdAt)) / (1000 * 60 * 60 * 24)
    );

    if (elapsedDays > daysAfterListing) return 0;

    const discount =
        input.discountType === "fixed" ? value * guests : Math.floor((subtotal * value) / 100);

    return Math.min(subtotal, Math.max(discount, 0));
}
