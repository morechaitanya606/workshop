import { describe, expect, it } from "vitest";

import {
    BOOKINGS_CLOSED_CODE,
    BOOKINGS_CLOSED_LABEL,
    BOOKINGS_CLOSED_MESSAGE,
    CLOSED_WORKSHOPS_MAX,
    CLOSED_WORKSHOPS_SETTING_KEY,
    closedWorkshopIdsFromSettings,
    isBookingClosed,
    normalizeWorkshopId,
    parseClosedWorkshopIds,
    validateClosedWorkshopIds,
    withBookingsClosed,
    WORKSHOP_ID_MAX_LENGTH,
    type ClosedWorkshopsRead,
} from "@/lib/workshop-availability";

const POTTERY = "pottery-wheel-1760000000000";
const BAKING = "sourdough-baking-1760000000001-20261101-1100";
const UUID = "11111111-1111-4111-8111-111111111111";

function ids(count: number) {
    return Array.from({ length: count }, (_, index) => `workshop-${index}`);
}

describe("constants", () => {
    it("names the setting and the 409 body", () => {
        expect(CLOSED_WORKSHOPS_SETTING_KEY).toBe("closed_workshop_ids");
        expect(BOOKINGS_CLOSED_CODE).toBe("BOOKINGS_CLOSED");
        expect(BOOKINGS_CLOSED_MESSAGE).toBe("Bookings for this workshop are closed.");
        // Seats may remain: never "Sold out".
        expect(BOOKINGS_CLOSED_LABEL).toBe("Bookings closed");
        expect(CLOSED_WORKSHOPS_MAX).toBe(500);
    });
});

describe("normalizeWorkshopId", () => {
    it("accepts today's slug ids, uuids and simple older ids, trimmed, case kept", () => {
        expect(normalizeWorkshopId(POTTERY)).toBe(POTTERY);
        expect(normalizeWorkshopId(BAKING)).toBe(BAKING);
        expect(normalizeWorkshopId(UUID)).toBe(UUID);
        expect(normalizeWorkshopId(`  ${POTTERY}\n`)).toBe(POTTERY);
        expect(normalizeWorkshopId("Workshop_1.v2:a")).toBe("Workshop_1.v2:a");
        expect(normalizeWorkshopId("x".repeat(WORKSHOP_ID_MAX_LENGTH))).toHaveLength(120);
    });

    it.each([
        ["null", null],
        ["undefined", undefined],
        ["a number", 42],
        ["an object", { id: POTTERY }],
        ["empty text", ""],
        ["spaces only", "   "],
        ["an id with a space", "pottery wheel"],
        ["an id with a comma", "a,b"],
        ["an id with a slash", "a/b"],
        ["an id with quotes", 'a"b'],
        ["an id starting with a dash", "-pottery"],
        ["a long id", "x".repeat(WORKSHOP_ID_MAX_LENGTH + 1)],
    ])("rejects %s", (_label, value) => {
        expect(normalizeWorkshopId(value)).toBeNull();
    });
});

describe("parseClosedWorkshopIds", () => {
    it.each([null, undefined, 7, true, {}, { [POTTERY]: true }, "garbage", "{}", "", "null"])(
        "reads %j as nothing closed",
        (raw) => {
            expect(parseClosedWorkshopIds(raw)).toEqual(new Set());
        }
    );

    it("reads an array, skipping entries that are not workshop ids", () => {
        expect(
            parseClosedWorkshopIds([POTTERY, 7, null, "bad id", ` ${BAKING} `, POTTERY])
        ).toEqual(new Set([POTTERY, BAKING]));
    });

    it("also reads a value stored as JSON text, or a Set", () => {
        expect(parseClosedWorkshopIds(JSON.stringify([POTTERY, UUID]))).toEqual(
            new Set([POTTERY, UUID])
        );
        expect(parseClosedWorkshopIds(new Set([BAKING, "bad id"]))).toEqual(new Set([BAKING]));
    });

    it("keeps at most CLOSED_WORKSHOPS_MAX ids", () => {
        const parsed = parseClosedWorkshopIds(ids(CLOSED_WORKSHOPS_MAX + 20));
        expect(parsed.size).toBe(CLOSED_WORKSHOPS_MAX);
        expect(parsed.has("workshop-0")).toBe(true);
        expect(parsed.has(`workshop-${CLOSED_WORKSHOPS_MAX}`)).toBe(false);
    });
});

describe("closedWorkshopIdsFromSettings", () => {
    it("reads the key from a settings object", () => {
        expect(
            closedWorkshopIdsFromSettings({ service_fee: 99, closed_workshop_ids: [POTTERY] })
        ).toEqual(new Set([POTTERY]));
    });

    it.each([null, undefined, "x", [[POTTERY]], {}, { service_fee: 99 }])(
        "reads %j as nothing closed",
        (settings) => {
            expect(closedWorkshopIdsFromSettings(settings)).toEqual(new Set());
        }
    );
});

describe("isBookingClosed", () => {
    it("checks a Set, an array or the raw setting value", () => {
        const closed = parseClosedWorkshopIds([POTTERY]);
        expect(isBookingClosed(POTTERY, closed)).toBe(true);
        expect(isBookingClosed(BAKING, closed)).toBe(false);
        expect(isBookingClosed(POTTERY, [POTTERY, BAKING])).toBe(true);
        expect(isBookingClosed(UUID, [POTTERY])).toBe(false);
        expect(isBookingClosed(POTTERY, JSON.stringify([POTTERY]))).toBe(true);
    });

    it("matches whole ids only, and trims the id it is given", () => {
        expect(isBookingClosed("pottery-wheel", [POTTERY])).toBe(false);
        expect(isBookingClosed(` ${POTTERY} `, new Set([POTTERY]))).toBe(true);
    });

    it("is false (open, today's behaviour) for a missing or malformed setting or id", () => {
        expect(isBookingClosed(POTTERY, null)).toBe(false);
        expect(isBookingClosed(POTTERY, undefined)).toBe(false);
        expect(isBookingClosed(POTTERY, "garbage")).toBe(false);
        expect(isBookingClosed(POTTERY, { [POTTERY]: true })).toBe(false);
        expect(isBookingClosed(null, [POTTERY])).toBe(false);
        expect(isBookingClosed(undefined, [POTTERY])).toBe(false);
        expect(isBookingClosed("", [""])).toBe(false);
    });
});

describe("validateClosedWorkshopIds", () => {
    it("returns the trimmed ids, duplicates removed, in order", () => {
        expect(validateClosedWorkshopIds([` ${POTTERY} `, UUID, POTTERY])).toEqual({
            ok: true,
            value: [POTTERY, UUID],
        });
        expect(validateClosedWorkshopIds([])).toEqual({ ok: true, value: [] });
    });

    it.each([
        ["an object", { [POTTERY]: true }],
        ["text", POTTERY],
        ["null", null],
        ["a number id", [42]],
        ["an empty id", [""]],
        ["an id with spaces", ["pottery 1"]],
        ["a long id", ["x".repeat(WORKSHOP_ID_MAX_LENGTH + 1)]],
    ])("rejects %s", (_label, value) => {
        expect(validateClosedWorkshopIds(value).ok).toBe(false);
    });

    it("caps the list at CLOSED_WORKSHOPS_MAX distinct ids", () => {
        expect(validateClosedWorkshopIds(ids(CLOSED_WORKSHOPS_MAX)).ok).toBe(true);
        expect(validateClosedWorkshopIds(ids(CLOSED_WORKSHOPS_MAX + 1)).ok).toBe(false);
        // Duplicates do not count towards the cap.
        expect(
            validateClosedWorkshopIds([...ids(CLOSED_WORKSHOPS_MAX), "workshop-0"])
        ).toMatchObject({ ok: true });
    });
});

describe("withBookingsClosed", () => {
    /** A successful fresh read of the stored list (what readClosedWorkshopIds returns). */
    function read(stored: unknown): ClosedWorkshopsRead {
        return { ok: true, ids: stored as ClosedWorkshopsRead["ids"] };
    }

    it("closes a workshop, idempotently, keeping the others", () => {
        expect(withBookingsClosed(read([BAKING]), POTTERY, true)).toEqual({
            ok: true,
            value: [BAKING, POTTERY],
        });
        expect(withBookingsClosed(read([POTTERY, BAKING]), POTTERY, true)).toEqual({
            ok: true,
            value: [BAKING, POTTERY],
        });
        expect(withBookingsClosed(read(new Set([BAKING])), POTTERY, true)).toEqual({
            ok: true,
            value: [BAKING, POTTERY],
        });
    });

    it("may write over a missing row (a successful read with no ids)", () => {
        expect(withBookingsClosed(read(new Set()), POTTERY, true)).toEqual({
            ok: true,
            value: [POTTERY],
        });
        expect(withBookingsClosed(read([]), POTTERY, true)).toEqual({
            ok: true,
            value: [POTTERY],
        });
        expect(withBookingsClosed(read(new Set()), POTTERY, false)).toEqual({
            ok: true,
            value: [],
        });
    });

    it("reopens a workshop, idempotently", () => {
        expect(withBookingsClosed(read([POTTERY, BAKING]), POTTERY, false)).toEqual({
            ok: true,
            value: [BAKING],
        });
        expect(withBookingsClosed(read([BAKING]), POTTERY, false)).toEqual({
            ok: true,
            value: [BAKING],
        });
        expect(withBookingsClosed(read("garbage"), POTTERY, false)).toEqual({
            ok: true,
            value: [],
        });
    });

    it("drops unreadable stored entries, and the result always validates", () => {
        const next = withBookingsClosed(read([7, "bad id", BAKING]), ` ${POTTERY} `, true);
        expect(next).toEqual({ ok: true, value: [BAKING, POTTERY] });
        if (next.ok) expect(validateClosedWorkshopIds(next.value).ok).toBe(true);
    });

    it("refuses with READ_FAILED, writing nothing, when the read failed", () => {
        // A failed read must never be written back: that would reopen every closed workshop.
        for (const closed of [true, false]) {
            expect(
                withBookingsClosed({ ok: false, ids: new Set([BAKING]) }, POTTERY, closed)
            ).toEqual({
                ok: false,
                code: "READ_FAILED",
                error: "Could not read the closed workshops, so nothing was changed. Try again.",
            });
            expect(
                withBookingsClosed({ ok: false, ids: new Set() }, POTTERY, closed)
            ).toMatchObject({ ok: false, code: "READ_FAILED" });
        }
        // Anything that is not a successful read counts as failed, checked before the id.
        for (const bad of [
            null,
            undefined,
            {},
            [BAKING],
            { ids: [BAKING] },
            { ok: "true", ids: [] },
        ]) {
            expect(withBookingsClosed(bad as never, POTTERY, true)).toMatchObject({
                ok: false,
                code: "READ_FAILED",
            });
        }
        expect(withBookingsClosed({ ok: false, ids: [] }, "bad id", true)).toMatchObject({
            code: "READ_FAILED",
        });
    });

    it("refuses an unknown workshop id with UNKNOWN_WORKSHOP", () => {
        for (const id of ["bad id", "", "   ", "x".repeat(WORKSHOP_ID_MAX_LENGTH + 1)]) {
            expect(withBookingsClosed(read([BAKING]), id, true)).toEqual({
                ok: false,
                code: "UNKNOWN_WORKSHOP",
                error: "Unknown workshop.",
            });
        }
        expect(withBookingsClosed(read([BAKING]), "bad id", false)).toMatchObject({
            code: "UNKNOWN_WORKSHOP",
        });
    });

    it("refuses to close one more with LIST_FULL; closing again or reopening still works", () => {
        const full = read(ids(CLOSED_WORKSHOPS_MAX));
        const refused = withBookingsClosed(full, POTTERY, true);
        expect(refused).toMatchObject({ ok: false, code: "LIST_FULL" });
        expect(!refused.ok && refused.error).toContain("Remove past workshops first");

        expect(withBookingsClosed(full, "workshop-3", true)).toMatchObject({ ok: true });
        const again = withBookingsClosed(full, "workshop-3", true);
        expect(again.ok && again.value).toHaveLength(CLOSED_WORKSHOPS_MAX);
        const reopened = withBookingsClosed(full, "workshop-3", false);
        expect(reopened.ok && reopened.value).toHaveLength(CLOSED_WORKSHOPS_MAX - 1);
        // One below the cap: closing one more fills it.
        const almost = withBookingsClosed(read(ids(CLOSED_WORKSHOPS_MAX - 1)), POTTERY, true);
        expect(almost.ok && almost.value).toHaveLength(CLOSED_WORKSHOPS_MAX);
    });
});
