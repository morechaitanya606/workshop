import { describe, expect, it } from "vitest";
import { getIstTodayIso } from "./ist-date";

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
