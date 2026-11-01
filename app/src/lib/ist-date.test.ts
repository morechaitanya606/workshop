import { describe, expect, it } from "vitest";
import { addDaysIso, getIstTodayIso, isDateBetween, istWeekendRange } from "./ist-date";

describe("getIstTodayIso", () => {
    it("rolls over to the next day after 18:30 UTC", () => {
        expect(getIstTodayIso(new Date("2026-10-01T18:29:59Z"))).toBe("2026-10-01");
        expect(getIstTodayIso(new Date("2026-10-01T18:30:00Z"))).toBe("2026-10-02");
    });

    it("matches the UTC date in the middle of the UTC day", () => {
        expect(getIstTodayIso(new Date("2026-10-01T09:00:00Z"))).toBe("2026-10-01");
    });

    it("handles month and year boundaries", () => {
        expect(getIstTodayIso(new Date("2026-12-31T20:00:00Z"))).toBe("2027-01-01");
    });
});

describe("addDaysIso", () => {
    it("crosses month and year boundaries", () => {
        expect(addDaysIso("2026-10-30", 3)).toBe("2026-11-02");
        expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01");
        expect(addDaysIso("2026-10-24", 0)).toBe("2026-10-24");
    });
});

describe("istWeekendRange", () => {
    it("points to the coming Saturday and Sunday from Monday to Friday", () => {
        // 19 Oct 2026 is a Monday, 23 Oct a Friday.
        expect(istWeekendRange("2026-10-19")).toEqual({ from: "2026-10-24", to: "2026-10-25" });
        expect(istWeekendRange("2026-10-23")).toEqual({ from: "2026-10-24", to: "2026-10-25" });
    });

    it("starts today on a Saturday and is just today on a Sunday", () => {
        expect(istWeekendRange("2026-10-24")).toEqual({ from: "2026-10-24", to: "2026-10-25" });
        expect(istWeekendRange("2026-10-25")).toEqual({ from: "2026-10-25", to: "2026-10-25" });
    });

    it("handles a weekend that spans two months", () => {
        // 29 Oct 2026 is a Thursday; the weekend is 31 Oct and 1 Nov.
        expect(istWeekendRange("2026-10-29")).toEqual({ from: "2026-10-31", to: "2026-11-01" });
    });
});

describe("isDateBetween", () => {
    it("includes both ends and ignores the time part", () => {
        expect(isDateBetween("2026-10-24", "2026-10-24", "2026-10-25")).toBe(true);
        expect(isDateBetween("2026-10-25T09:00:00", "2026-10-24", "2026-10-25")).toBe(true);
        expect(isDateBetween("2026-10-26", "2026-10-24", "2026-10-25")).toBe(false);
        expect(isDateBetween("", "2026-10-24", "2026-10-25")).toBe(false);
        expect(isDateBetween(undefined, "2026-10-24", "2026-10-25")).toBe(false);
    });
});
