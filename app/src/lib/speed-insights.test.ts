import { describe, expect, it } from "vitest";
import { speedInsightsRoute } from "./speed-insights";

describe("speedInsightsRoute", () => {
    it("groups dynamic pages under their route pattern", () => {
        expect(speedInsightsRoute("/workshop/pottery-101", { id: "pottery-101" })).toBe(
            "/workshop/[id]"
        );
        expect(speedInsightsRoute("/host/workshops/abc/edit", { id: "abc" })).toBe(
            "/host/workshops/[id]/edit"
        );
    });

    it("leaves static pages and missing params alone", () => {
        expect(speedInsightsRoute("/explore", {})).toBe("/explore");
        expect(speedInsightsRoute("/explore", null)).toBe("/explore");
    });

    it("only replaces whole segments", () => {
        expect(speedInsightsRoute("/communities/art-club", { slug: "art" })).toBe(
            "/communities/art-club"
        );
    });

    it("names catch-all params with a spread", () => {
        expect(
            speedInsightsRoute("/blog/2026/10/launch", { parts: ["2026", "10", "launch"] })
        ).toBe("/blog/[...parts]");
    });

    it("treats regex characters in params literally", () => {
        expect(speedInsightsRoute("/workshop/a.b", { id: "a.b" })).toBe("/workshop/[id]");
        expect(speedInsightsRoute("/workshop/axb", { id: "a.b" })).toBe("/workshop/axb");
    });
});
