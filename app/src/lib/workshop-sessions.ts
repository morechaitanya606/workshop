/**
 * Pure helpers for workshop "sessions" (one date + start time + optional seat count each).
 *
 * Every session becomes its own `workshops` row. All dates and times are IST (+05:30), matching
 * `getWorkshopDateTime` in `booking-time.ts`. These helpers are strict about what we WRITE
 * (`YYYY-MM-DD` / `HH:MM`) and lenient about what we READ (see `normalizeSessionTime`).
 */

export const MAX_WORKSHOP_SESSIONS = 20;
export const IST_OFFSET = "+05:30";
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const STRICT_TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.\d+)?)?$/;
const LENIENT_TIME_RE = /^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(am|pm)?$/i;

export type SessionInput = {
    date: string;
    time: string;
    maxSeats?: number;
};

/** One row of the "Sessions / time slots" editor. Everything is a string, like the rest of the form. */
export type SessionSlotForm = {
    key: string;
    date: string;
    time: string;
    maxSeats: string;
};

export function isValidIsoDate(value: unknown): value is string {
    if (typeof value !== "string") return false;
    const match = ISO_DATE_RE.exec(value);
    if (!match) return false;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (month < 1 || month > 12 || day < 1) return false;
    const probe = new Date(Date.UTC(year, month - 1, day));
    return (
        probe.getUTCFullYear() === year &&
        probe.getUTCMonth() === month - 1 &&
        probe.getUTCDate() === day
    );
}

/**
 * Normalises a start time to `HH:MM`, or returns null when it is not a time.
 *
 * Strict mode (writes) accepts `HH:MM` and `HH:MM:SS` (Postgres `time` round trip) only.
 * Lenient mode (reads) additionally accepts `H:MM`, `7 PM` and `7:00 PM`, so legacy rows with
 * hand-typed times still resolve to an instant instead of silently disabling the booking cutoff.
 */
export function normalizeSessionTime(
    value: unknown,
    options: { lenient?: boolean } = {}
): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed) return null;

    const strict = STRICT_TIME_RE.exec(trimmed);
    if (strict) return `${strict[1]}:${strict[2]}`;
    if (!options.lenient) return null;

    const loose = LENIENT_TIME_RE.exec(trimmed);
    if (!loose) return null;
    let hours = Number(loose[1]);
    const minutes = loose[2] === undefined ? 0 : Number(loose[2]);
    const meridiem = loose[4]?.toLowerCase();
    if (minutes > 59) return null;
    if (meridiem) {
        if (hours < 1 || hours > 12) return null;
        if (meridiem === "pm" && hours < 12) hours += 12;
        if (meridiem === "am" && hours === 12) hours = 0;
    } else if (hours > 23) {
        return null;
    }
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** The instant a session starts (IST). Null when date or time is unusable. */
export function getSessionStart(date: string, time: string): Date | null {
    if (!isValidIsoDate(date)) return null;
    const normalizedTime = normalizeSessionTime(time);
    if (!normalizedTime) return null;
    const start = new Date(`${date}T${normalizedTime}:00${IST_OFFSET}`);
    return Number.isNaN(start.getTime()) ? null : start;
}

export function isSessionInPast(date: string, time: string, now: Date = new Date()): boolean {
    const start = getSessionStart(date, time);
    if (!start) return false;
    return start.getTime() < now.getTime();
}

/** Today's calendar date in IST as `YYYY-MM-DD`, for `min` on date inputs. */
export function getTodayIstDate(now: Date = new Date()): string {
    return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function addDaysToIsoDate(date: string, days: number): string | null {
    if (!isValidIsoDate(date)) return null;
    const [year, month, day] = date.split("-").map(Number);
    const next = new Date(Date.UTC(year, month - 1, day + days));
    return next.toISOString().slice(0, 10);
}

export function getSessionKey(session: { date: string; time: string }): string {
    return `${session.date}T${session.time}`;
}

/** Returns the `date time` pairs that appear more than once (each reported once). */
export function findDuplicateSessionKeys(sessions: Array<{ date: string; time: string }>) {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const session of sessions) {
        const key = getSessionKey(session);
        if (seen.has(key)) duplicates.add(key);
        seen.add(key);
    }
    return [...duplicates];
}

/**
 * "Repeat weekly for N weeks": takes the FIRST filled slot as the template and appends its
 * weekly occurrences for weeks 2..N, skipping any date+time already in the list and never
 * growing the list past `max`. Returns a new array; the input is untouched.
 */
export function expandWeeklyRepeat<T extends { date: string; time: string }>(
    slots: T[],
    weeks: number,
    createSlot: (base: T, date: string) => T,
    max: number = MAX_WORKSHOP_SESSIONS
): T[] {
    const template = slots.find(
        (slot) => isValidIsoDate(slot.date) && normalizeSessionTime(slot.time) !== null
    );
    if (!template) return slots;

    const totalWeeks = Math.max(1, Math.min(Math.trunc(weeks) || 1, max));
    const existing = new Set(
        slots.map((slot) => getSessionKey({ date: slot.date, time: slot.time }))
    );
    const next = [...slots];

    for (let week = 1; week < totalWeeks && next.length < max; week += 1) {
        const date = addDaysToIsoDate(template.date, week * 7);
        if (!date) continue;
        const key = getSessionKey({ date, time: template.time });
        if (existing.has(key)) continue;
        existing.add(key);
        next.push(createSlot(template, date));
    }

    return next;
}

export type SessionIssue = {
    /** Index into the sessions list, or null for a problem with the list as a whole. */
    index: number | null;
    field: "date" | "time" | "maxSeats" | "list";
    message: string;
};

/**
 * Validates a list of sessions for creation: 1..MAX entries, strict date/time, none in the past
 * (IST) and no duplicate date+time pairs. Shared by the zod schema and the form so both report
 * the same problems.
 */
export function validateSessionList(
    sessions: Array<{ date: string; time: string }>,
    now: Date = new Date()
): SessionIssue[] {
    const issues: SessionIssue[] = [];

    if (sessions.length === 0) {
        issues.push({
            index: null,
            field: "list",
            message: "Add at least one date and time.",
        });
        return issues;
    }
    if (sessions.length > MAX_WORKSHOP_SESSIONS) {
        issues.push({
            index: null,
            field: "list",
            message: `You can add at most ${MAX_WORKSHOP_SESSIONS} sessions at once.`,
        });
    }

    const seen = new Set<string>();
    sessions.forEach((session, index) => {
        const dateOk = isValidIsoDate(session.date);
        const time = normalizeSessionTime(session.time);

        if (!dateOk) {
            issues.push({
                index,
                field: "date",
                message: session.date ? "Enter a valid date (YYYY-MM-DD)." : "Date is required.",
            });
        }
        if (!time) {
            issues.push({
                index,
                field: "time",
                message: session.time ? "Enter a valid time (HH:MM)." : "Time is required.",
            });
        }
        if (!dateOk || !time) return;

        if (isSessionInPast(session.date, time, now)) {
            issues.push({
                index,
                field: "date",
                message: "This session is in the past (India time).",
            });
        }

        const key = getSessionKey({ date: session.date, time });
        if (seen.has(key)) {
            issues.push({
                index,
                field: "time",
                message: "Another slot already has this date and time.",
            });
        }
        seen.add(key);
    });

    return issues;
}

let slotCounter = 0;

export function createSessionSlot(initial: Partial<Omit<SessionSlotForm, "key">> = {}) {
    slotCounter += 1;
    const slot: SessionSlotForm = {
        key: `slot-${slotCounter}`,
        date: initial.date ?? "",
        time: initial.time ?? "",
        maxSeats: initial.maxSeats ?? "",
    };
    return slot;
}

/** Form slots -> the `sessions` array of the create payload (blank seat count is omitted). */
export function buildSessionsPayload(slots: SessionSlotForm[]): SessionInput[] {
    return slots.map((slot) => {
        const session: SessionInput = { date: slot.date.trim(), time: slot.time.trim() };
        const seats = slot.maxSeats.trim();
        if (seats) session.maxSeats = Number(seats);
        return session;
    });
}

type IssueLike = { path: ReadonlyArray<PropertyKey>; message: string };

/**
 * Maps zod issues under `sessions` to editor error keys:
 * `sessions` for list-level problems and `<index>.date|time|maxSeats` for a single slot.
 */
export function collectSessionErrors(issues: IssueLike[]): Record<string, string> {
    const errors: Record<string, string> = {};
    for (const issue of issues) {
        const [root, index, field] = issue.path;
        if (root !== "sessions") continue;
        const key =
            typeof index === "number"
                ? `${index}.${field !== undefined ? String(field) : "time"}`
                : "sessions";
        if (!errors[key]) errors[key] = issue.message;
    }
    return errors;
}

/** Same keys as `collectSessionErrors`, for issues produced by `validateSessionList`. */
export function sessionIssuesToErrors(issues: SessionIssue[]): Record<string, string> {
    const errors: Record<string, string> = {};
    for (const issue of issues) {
        const key = issue.index === null ? "sessions" : `${issue.index}.${issue.field}`;
        if (!errors[key]) errors[key] = issue.message;
    }
    return errors;
}
