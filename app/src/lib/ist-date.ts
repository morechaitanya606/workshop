const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * Calendar date (YYYY-MM-DD) in India Standard Time. Workshops are stored as plain local dates,
 * so splitting upcoming from past with the UTC date is wrong between 00:00 and 05:30 IST, when a
 * workshop happening "today" in Pune would already be classed as past.
 */
export function getIstTodayIso(now: Date = new Date()): string {
    return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}
