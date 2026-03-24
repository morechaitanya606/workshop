import { describe, expect, it } from "vitest";
import { generateGoogleCalendarUrl, generateICSContent, parseDurationToMinutes } from "./calendar";

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

        it("formats calendar timestamps without relying on fragile string replacement", () => {
            const ics = generateICSContent({
                title: "Evening Session",
                description: "Hands-on workshop",
                location: "Studio 9",
                startDate: "2026-03-28",
                startTime: "6:30 PM",
                durationMinutes: 90,
            });

            const dtstartLine = ics.split("\r\n").find((line) => line.startsWith("DTSTART:"));
            const dtendLine = ics.split("\r\n").find((line) => line.startsWith("DTEND:"));

            expect(dtstartLine).toMatch(/^DTSTART:\d{8}T\d{6}Z$/);
            expect(dtendLine).toMatch(/^DTEND:\d{8}T\d{6}Z$/);
        });
    });

    describe("generateGoogleCalendarUrl", () => {
        it("handles ambiguous local date strings by falling back to local wall-clock parsing", () => {
            const url = generateGoogleCalendarUrl({
                title: "Morning Pottery",
                description: "Clay basics",
                location: "Pottery Lab",
                startDate: "2026-04-05",
                startTime: "09:15",
                durationMinutes: 120,
            });

            expect(url).toContain("action=TEMPLATE");
            expect(url).toMatch(/dates=\d{8}T\d{6}Z%2F\d{8}T\d{6}Z/);
        });

        it("accepts times that already include explicit timezone offsets", () => {
            const url = generateGoogleCalendarUrl({
                title: "Late Evening Session",
                description: "Long-form workshop",
                location: "Studio Loft",
                startDate: "2026-04-05",
                startTime: "21:00:00+05:30",
                durationMinutes: 60,
            });

            expect(url).toMatch(/dates=\d{8}T\d{6}Z%2F\d{8}T\d{6}Z/);
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
