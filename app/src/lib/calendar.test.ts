import { describe, expect, it } from "vitest";
import { parseDurationToMinutes, generateICSContent } from "./calendar";

describe("Calendar Utilities", () => {
    describe("generateICSContent", () => {
        it("generates valid ICS content with a UID", () => {
            const data = {
                title: "Test Workshop",
                description: "Test Description",
                location: "Test Location",
                startDate: "2023-10-27",
                startTime: "10:00",
                durationMinutes: 60,
            };
            const ics = generateICSContent(data);
            expect(ics).toContain("BEGIN:VCALENDAR");
            expect(ics).toContain("BEGIN:VEVENT");
            expect(ics).toContain("UID:");
            expect(ics).toContain("@onlyworkshops.com");
            expect(ics).toContain("END:VEVENT");
            expect(ics).toContain("END:VCALENDAR");

            const uidLine = ics.split("\r\n").find((line) => line.startsWith("UID:"));
            expect(uidLine).toBeDefined();
            // UID:20231027T100000Z-50c8e79e-f00e-4363-9529-688325a77610@onlyworkshops.com
            // We check for the UUID part: 8-4-4-4-12 hex chars
            const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
            expect(uidLine).toMatch(uuidPattern);
        });
    });

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
