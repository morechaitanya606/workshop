import { describe, expect, it } from "vitest";
import { parseDurationToMinutes } from "./calendar";

describe("Calendar Utilities", () => {
    describe("parseDurationToMinutes", () => {
        it("handles standard hour formats", () => {
            expect(parseDurationToMinutes("1 hour")).toBe(60);
            expect(parseDurationToMinutes("2 hours")).toBe(120);
            expect(parseDurationToMinutes("1.5 hours")).toBe(90);
        });

        it("handles minute formats", () => {
            expect(parseDurationToMinutes("30 minutes")).toBe(30);
            expect(parseDurationToMinutes("45 mins")).toBe(45);
        });

        it("handles mixed formats", () => {
            expect(parseDurationToMinutes("1 hour 30 minutes")).toBe(90);
            expect(parseDurationToMinutes("2h 45m")).toBe(165);
        });

        it("returns a fallback value for unrecognized formats", () => {
            expect(parseDurationToMinutes("Unknown format")).toBe(60);
        });
    });
});
