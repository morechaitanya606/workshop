const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * Calendar date (YYYY-MM-DD) in India Standard Time. Workshops are stored as plain local dates,
 * so splitting upcoming from past with the UTC date is wrong between 00:00 and 05:30 IST, when a
 * workshop happening "today" in Pune would already be classed as past.
 */
export function getIstTodayIso(now: Date = new Date()): string {
    return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** `2026-10-22` + 3 -> `2026-10-25`: plain calendar arithmetic, no time zone involved. */
export function addDaysIso(dateIso: string, days: number): string {
    return new Date(Date.parse(`${dateIso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * The Saturday and Sunday people mean by "this weekend" on an IST date: the coming one from
 * Monday to Friday, today and tomorrow on a Saturday, and just today on a Sunday.
 */
export function istWeekendRange(todayIso: string): { from: string; to: string } {
    const weekday = new Date(`${todayIso}T00:00:00Z`).getUTCDay(); // 0 Sunday ... 6 Saturday
    if (weekday === 0) return { from: todayIso, to: todayIso };
    const saturday = addDaysIso(todayIso, 6 - weekday);
    return { from: saturday, to: addDaysIso(saturday, 1) };
}

/** Whether a `YYYY-MM-DD` (or longer) date falls between `from` and `to`, both included. */
export function isDateBetween(date: string | null | undefined, from: string, to: string) {
    const day = date?.trim().slice(0, 10) ?? "";
    return /^\d{4}-\d{2}-\d{2}$/.test(day) && day >= from && day <= to;
}
