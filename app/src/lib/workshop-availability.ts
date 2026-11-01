/**
 * The admin "Bookings closed" switch.
 *
 * The owner switches a workshop off once it has enough bookings. A closed workshop stays
 * visible everywhere (cards, its page, the sitemap) but shows "Bookings closed" (never "Sold
 * out": seats may remain), no Book button and no offers, and no new booking can start: hold
 * creation and checkout order creation answer 409 { code: "BOOKINGS_CLOSED" }. Existing
 * bookings are untouched, and an order created before the switch is still confirmed (never
 * refunded for this).
 *
 * Stored without a migration in the platform setting "closed_workshop_ids": a JSON array of
 * workshop ids. It is PUBLIC (on PUBLIC_SETTING_KEYS), so client pages read it from the
 * platform settings context with closedWorkshopIdsFromSettings(settings). A missing or
 * malformed value means "nothing closed" (today's behaviour).
 *
 * Not to be confused with isBookingClosedNow (src/lib/booking-time.ts), the automatic cut-off a
 * few hours before the start. Pure and client-safe.
 */

export const CLOSED_WORKSHOPS_SETTING_KEY = "closed_workshop_ids";
/** Every id ships to every visitor with the settings: keep the list short (remove past ones). */
export const CLOSED_WORKSHOPS_MAX = 500;
/** Same limit as the booking validators (validators.ts). */
export const WORKSHOP_ID_MAX_LENGTH = 120;

/** The 409 body that hold and order creation return: { code, message }. */
export const BOOKINGS_CLOSED_CODE = "BOOKINGS_CLOSED";
export const BOOKINGS_CLOSED_MESSAGE = "Bookings for this workshop are closed.";
/** What cards and pages show instead of seats or a Book button. */
export const BOOKINGS_CLOSED_LABEL = "Bookings closed";

/**
 * workshops.id is text: "<slug>-<timestamp>" today (workshop-utils.ts), uuids or other simple
 * ids on older rows. Letters, digits and . _ : - only, so an id is always safe in a URL, a
 * query filter or a log line.
 */
const WORKSHOP_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** A trimmed workshop id that may be stored in the setting, or null. Case is kept (text ids). */
export function normalizeWorkshopId(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const id = value.trim();
    if (!id || id.length > WORKSHOP_ID_MAX_LENGTH || !WORKSHOP_ID_PATTERN.test(id)) return null;
    return id;
}

/**
 * Reads the stored value (an array, or the same as JSON text). Never throws: entries that are
 * not workshop ids are skipped, and anything else reads as nothing closed.
 */
export function parseClosedWorkshopIds(raw: unknown): Set<string> {
    let value = raw;
    if (typeof value === "string") {
        try {
            value = JSON.parse(value);
        } catch {
            return new Set();
        }
    }
    const items: unknown[] = Array.isArray(value)
        ? value
        : value instanceof Set
          ? [...(value as Set<unknown>)]
          : [];

    const ids = new Set<string>();
    for (const item of items) {
        if (ids.size >= CLOSED_WORKSHOPS_MAX) break;
        const id = normalizeWorkshopId(item);
        if (id) ids.add(id);
    }
    return ids;
}

/** The closed ids from a platform settings object (the settings context, or cached settings). */
export function closedWorkshopIdsFromSettings(settings: unknown): Set<string> {
    if (typeof settings !== "object" || settings === null || Array.isArray(settings)) {
        return new Set();
    }
    return parseClosedWorkshopIds(
        (settings as Record<string, unknown>)[CLOSED_WORKSHOPS_SETTING_KEY]
    );
}

/**
 * True when the admin switched this workshop's bookings off. `closed` may be a Set from
 * parseClosedWorkshopIds / loadClosedWorkshopIds, an array of ids, or the raw setting value.
 */
export function isBookingClosed(
    workshopId: string | null | undefined,
    closed: ReadonlySet<string> | ReadonlyArray<string> | unknown
): boolean {
    const id = normalizeWorkshopId(workshopId);
    if (!id) return false;
    if (closed instanceof Set) return closed.has(id);
    return parseClosedWorkshopIds(closed).has(id);
}

/**
 * Strict validation for an admin write of "closed_workshop_ids" (used by validateSettingsPatch):
 * an array of workshop ids, at most CLOSED_WORKSHOPS_MAX. Returns the trimmed ids, duplicates
 * removed, in their original order.
 */
export function validateClosedWorkshopIds(value: unknown): Result<string[]> {
    if (!Array.isArray(value)) {
        return { ok: false, error: "Closed workshops must be a list of workshop ids." };
    }
    const ids: string[] = [];
    for (const item of value) {
        const id = normalizeWorkshopId(item);
        if (!id) return { ok: false, error: "Closed workshops must contain only workshop ids." };
        if (!ids.includes(id)) ids.push(id);
    }
    if (ids.length > CLOSED_WORKSHOPS_MAX) {
        return {
            ok: false,
            error: `At most ${CLOSED_WORKSHOPS_MAX} workshops can have bookings closed. Remove past workshops first.`,
        };
    }
    return { ok: true, value: ids };
}

/**
 * A read of the stored list: what readClosedWorkshopIds (workshop-availability-server.ts)
 * returns. `ok: false` means the read FAILED, and its empty `ids` must never be written back.
 */
export type ClosedWorkshopsRead = {
    ok: boolean;
    ids: ReadonlySet<string> | ReadonlyArray<string>;
};

export type BookingsClosedUpdate =
    | { ok: true; value: string[] }
    | {
          ok: false;
          /** READ_FAILED: answer 503 "Try again"; the others: 400. */
          code: "READ_FAILED" | "UNKNOWN_WORKSHOP" | "LIST_FULL";
          error: string;
      };

/**
 * The next stored list after switching one workshop's bookings off (closed: true) or back on,
 * for the admin route's read-modify-write. Pass the result of a FRESH read with the service
 * role (readClosedWorkshopIds), never the cached settings or the settings context, which can be
 * stale and would reopen a workshop closed since.
 *
 * A write needs a successful read: when the read failed (`ok` is not true) this refuses with
 * READ_FAILED, and the route must not upsert anything. Otherwise a database hiccup while
 * closing workshop B would store [B] and silently reopen every other closed workshop. A missing
 * row reads as ok with no ids, the only empty list that may be written over.
 *
 * Idempotent; unreadable stored entries are dropped. Fails (rather than silently reopening
 * another workshop) when the list is full. Two toggles saved at the same moment can still
 * overwrite each other (read-modify-write, no compare-and-set): acceptable for a single owner;
 * the admin switch should stay disabled while its save is in flight.
 */
export function withBookingsClosed(
    read: ClosedWorkshopsRead,
    workshopId: string,
    closed: boolean
): BookingsClosedUpdate {
    if (typeof read !== "object" || read === null || read.ok !== true) {
        return {
            ok: false,
            code: "READ_FAILED",
            error: "Could not read the closed workshops, so nothing was changed. Try again.",
        };
    }
    const id = normalizeWorkshopId(workshopId);
    if (!id) return { ok: false, code: "UNKNOWN_WORKSHOP", error: "Unknown workshop." };
    const ids = [...parseClosedWorkshopIds(read.ids)].filter((existing) => existing !== id);
    if (closed) {
        if (ids.length >= CLOSED_WORKSHOPS_MAX) {
            return {
                ok: false,
                code: "LIST_FULL",
                error: `At most ${CLOSED_WORKSHOPS_MAX} workshops can have bookings closed. Remove past workshops first.`,
            };
        }
        ids.push(id);
    }
    return { ok: true, value: ids };
}
