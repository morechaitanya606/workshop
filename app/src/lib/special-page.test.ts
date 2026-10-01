import { describe, expect, it } from "vitest";
import { isSpecialPageActive } from "./special-page";

describe("isSpecialPageActive", () => {
    const settings = { enabled: true, visible_until: "2026-05-09" };

    it("stays active through the whole IST day of visible_until", () => {
        // 2026-05-09 23:59 IST == 18:29 UTC the same day.
        expect(isSpecialPageActive(settings, new Date("2026-05-09T18:29:00Z"))).toBe(true);
    });

    it("ends at IST midnight, not UTC midnight", () => {
        // 2026-05-10 00:00 IST == 2026-05-09 18:30 UTC.
        expect(isSpecialPageActive(settings, new Date("2026-05-09T18:30:00Z"))).toBe(false);
    });

    it("is inactive when disabled", () => {
        expect(
            isSpecialPageActive({ ...settings, enabled: false }, new Date("2026-01-01T00:00:00Z"))
        ).toBe(false);
    });
});
