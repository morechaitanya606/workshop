import { describe, expect, it } from "vitest";
import { normalizePathname } from "./use-site-pathname";

describe("normalizePathname", () => {
    it("folds the ISR homepage alias into /", () => {
        expect(normalizePathname("/index")).toBe("/");
    });

    it("leaves every other path alone", () => {
        expect(normalizePathname("/")).toBe("/");
        expect(normalizePathname("/explore")).toBe("/explore");
        expect(normalizePathname("/index/extra")).toBe("/index/extra");
        expect(normalizePathname("/workshops/pune")).toBe("/workshops/pune");
    });
});
