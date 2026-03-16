export const BOOKING_CUTOFF_HOURS = 3;

export function getWorkshopDateTime(date: string, time?: string | null) {
    if (!date) return null;
    const safeTime = (time && time.trim()) || "00:00";
    const workshopDateTime = new Date(`${date}T${safeTime}:00`);
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
