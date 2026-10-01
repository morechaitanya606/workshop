import { describe, expect, it } from "vitest";
import {
    MAX_WORKSHOP_SESSIONS,
    addDaysToIsoDate,
    buildSessionsPayload,
    collectSessionErrors,
    createSessionSlot,
    expandWeeklyRepeat,
    getSessionStart,
    getTodayIstDate,
    isSessionInPast,
    isValidIsoDate,
    normalizeSessionTime,
    validateSessionList,
} from "@/lib/workshop-sessions";
import { getWorkshopDateTime, isBookingClosedNow } from "@/lib/booking-time";

describe("isValidIsoDate", () => {
    it("accepts real calendar dates only", () => {
        expect(isValidIsoDate("2099-02-28")).toBe(true);
        expect(isValidIsoDate("2096-02-29")).toBe(true);
        expect(isValidIsoDate("2099-02-29")).toBe(false);
        expect(isValidIsoDate("2099-13-01")).toBe(false);
        expect(isValidIsoDate("2099-1-1")).toBe(false);
        expect(isValidIsoDate("12/05/2099")).toBe(false);
        expect(isValidIsoDate("")).toBe(false);
    });
});

describe("normalizeSessionTime", () => {
    it("is strict about HH:MM on writes", () => {
        expect(normalizeSessionTime("19:00")).toBe("19:00");
        expect(normalizeSessionTime("19:00:00")).toBe("19:00");
        expect(normalizeSessionTime("07:05")).toBe("07:05");
        expect(normalizeSessionTime("7:00")).toBeNull();
        expect(normalizeSessionTime("7:00 PM")).toBeNull();
        expect(normalizeSessionTime("24:00")).toBeNull();
        expect(normalizeSessionTime("12:60")).toBeNull();
        expect(normalizeSessionTime("")).toBeNull();
    });

    it("is lenient on reads", () => {
        const lenient = { lenient: true };
        expect(normalizeSessionTime("7:00", lenient)).toBe("07:00");
        expect(normalizeSessionTime("7:00 PM", lenient)).toBe("19:00");
        expect(normalizeSessionTime("7 pm", lenient)).toBe("19:00");
        expect(normalizeSessionTime("12:30 AM", lenient)).toBe("00:30");
        expect(normalizeSessionTime("12:30 PM", lenient)).toBe("12:30");
        expect(normalizeSessionTime("13:00 PM", lenient)).toBeNull();
        expect(normalizeSessionTime("soon", lenient)).toBeNull();
    });
});

describe("IST helpers", () => {
    it("treats session times as IST (+05:30)", () => {
        expect(getSessionStart("2099-01-01", "10:00")?.toISOString()).toBe(
            "2099-01-01T04:30:00.000Z"
        );
        expect(getSessionStart("2099-01-01", "7:00 PM")).toBeNull();
    });

    it("detects past sessions against a supplied clock", () => {
        const now = new Date("2099-01-01T04:30:00.000Z"); // 10:00 IST
        expect(isSessionInPast("2099-01-01", "09:59", now)).toBe(true);
        expect(isSessionInPast("2099-01-01", "10:01", now)).toBe(false);
    });

    it("computes today's date in IST, not UTC", () => {
        // 20:00 UTC on 31 Dec is already 1 Jan 01:30 in IST.
        expect(getTodayIstDate(new Date("2098-12-31T20:00:00.000Z"))).toBe("2099-01-01");
    });

    it("adds days across month boundaries", () => {
        expect(addDaysToIsoDate("2099-01-30", 7)).toBe("2099-02-06");
        expect(addDaysToIsoDate("nope", 1)).toBeNull();
    });
});

describe("validateSessionList", () => {
    const now = new Date("2099-01-01T00:00:00.000Z");

    it("requires at least one session", () => {
        expect(validateSessionList([], now)).toEqual([
            expect.objectContaining({ index: null, field: "list" }),
        ]);
    });

    it("flags bad date, bad time, past and duplicate slots per index", () => {
        const issues = validateSessionList(
            [
                { date: "2099-03-01", time: "10:00" },
                { date: "2099-03-01", time: "10:00" },
                { date: "2098-03-01", time: "10:00" },
                { date: "2099-03-02", time: "7:00 PM" },
                { date: "03/03/2099", time: "10:00" },
            ],
            now
        );
        expect(issues).toEqual([
            expect.objectContaining({ index: 1, field: "time" }),
            expect.objectContaining({ index: 2, field: "date" }),
            expect.objectContaining({ index: 3, field: "time" }),
            expect.objectContaining({ index: 4, field: "date" }),
        ]);
    });

    it("treats HH:MM and HH:MM:SS of the same minute as duplicates", () => {
        const issues = validateSessionList(
            [
                { date: "2099-03-01", time: "10:00" },
                { date: "2099-03-01", time: "10:00:00" },
            ],
            now
        );
        expect(issues).toHaveLength(1);
        expect(issues[0].index).toBe(1);
    });

    it("caps the list size", () => {
        const many = Array.from({ length: MAX_WORKSHOP_SESSIONS + 1 }, (_, i) => ({
            date: addDaysToIsoDate("2099-03-01", i) as string,
            time: "10:00",
        }));
        expect(validateSessionList(many, now).some((issue) => issue.field === "list")).toBe(true);
    });
});

describe("expandWeeklyRepeat", () => {
    const make = (date: string, time = "10:00") => ({ date, time });
    const create = (base: { date: string; time: string }, date: string) => ({
        date,
        time: base.time,
    });

    it("repeats the first filled slot weekly for N weeks in total", () => {
        const result = expandWeeklyRepeat([make("2099-03-01")], 4, create);
        expect(result.map((slot) => slot.date)).toEqual([
            "2099-03-01",
            "2099-03-08",
            "2099-03-15",
            "2099-03-22",
        ]);
    });

    it("skips occurrences that already exist and respects the cap", () => {
        const result = expandWeeklyRepeat([make("2099-03-01"), make("2099-03-08")], 3, create);
        expect(result.map((slot) => slot.date)).toEqual(["2099-03-01", "2099-03-08", "2099-03-15"]);

        const capped = expandWeeklyRepeat([make("2099-03-01")], 50, create, 5);
        expect(capped).toHaveLength(5);
    });

    it("does nothing without a complete template slot", () => {
        const slots = [make("", "")];
        expect(expandWeeklyRepeat(slots, 4, create)).toBe(slots);
    });
});

describe("form <-> payload helpers", () => {
    it("omits blank seat counts and trims", () => {
        const a = createSessionSlot({ date: " 2099-03-01 ", time: "10:00", maxSeats: "" });
        const b = createSessionSlot({ date: "2099-03-02", time: "11:00", maxSeats: "8" });
        expect(a.key).not.toBe(b.key);
        expect(buildSessionsPayload([a, b])).toEqual([
            { date: "2099-03-01", time: "10:00" },
            { date: "2099-03-02", time: "11:00", maxSeats: 8 },
        ]);
    });

    it("maps zod issue paths to editor error keys", () => {
        expect(
            collectSessionErrors([
                { path: ["sessions"], message: "list" },
                { path: ["sessions", 2, "date"], message: "bad date" },
                { path: ["sessions", 2, "date"], message: "ignored second" },
                { path: ["title"], message: "unrelated" },
            ])
        ).toEqual({ sessions: "list", "2.date": "bad date" });
    });
});

describe("booking cutoff reads stored time formats (audit finding)", () => {
    it("resolves Postgres HH:MM:SS and 12-hour strings instead of returning null", () => {
        expect(getWorkshopDateTime("2099-01-01", "19:00:00")?.toISOString()).toBe(
            "2099-01-01T13:30:00.000Z"
        );
        expect(getWorkshopDateTime("2099-01-01", "7:00 PM")?.toISOString()).toBe(
            "2099-01-01T13:30:00.000Z"
        );
        const justBefore = new Date("2099-01-01T10:29:59.000Z"); // 3h before 19:00 IST - 1s
        const atCutoff = new Date("2099-01-01T10:30:00.000Z");
        expect(isBookingClosedNow("2099-01-01", "7:00 PM", justBefore)).toBe(false);
        expect(isBookingClosedNow("2099-01-01", "7:00 PM", atCutoff)).toBe(true);
    });
});
