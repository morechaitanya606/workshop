import { normalizeSessionTime } from "@/lib/workshop-sessions";

export const BOOKING_CUTOFF_HOURS = 3;

/**
 * How long a seat hold lasts while the visitor pays. The hold route passes it to
 * create_booking_hold, the booking page counts it down, and the chatbot quotes it.
 */
export const BOOKING_HOLD_MINUTES = 8;

export function getWorkshopDateTime(date: string, time?: string | null) {
    if (!date) return null;
    // Lenient on read: "19:00:00" (Postgres time), "7:00" and "7:00 PM" all resolve instead of
    // producing an invalid date that silently disables the booking cutoff.
    const rawTime = (time && time.trim()) || "00:00";
    const safeTime = normalizeSessionTime(rawTime, { lenient: true }) ?? rawTime;
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

/**
 * Early Bird maths moved to the shared pricing module (src/lib/pricing.ts), which mirrors
 * `confirm_booking_from_hold` (latest: 20261001110400_confirm_booking_approval_check.sql).
 * Re-exported here so existing imports keep working.
 */
export { computeEarlyBirdDiscount, type EarlyBirdInput } from "@/lib/pricing";
