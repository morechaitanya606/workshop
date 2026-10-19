import { describe, expect, it } from "vitest";
import { googleMapsLinkOf, isWebUrl } from "./workshop-media";

describe("isWebUrl", () => {
    it("spots a pasted link in an address field", () => {
        expect(isWebUrl("https://maps.app.goo.gl/UXEiDjhdRibZegzu5")).toBe(true);
        expect(isWebUrl("  http://example.com ")).toBe(true);
    });

    it("leaves postal addresses alone", () => {
        expect(isWebUrl("S-4 Plot No 1, Baner Rd, Pune 411069")).toBe(false);
        expect(isWebUrl("")).toBe(false);
        expect(isWebUrl(null)).toBe(false);
        expect(isWebUrl(undefined)).toBe(false);
    });
});

describe("googleMapsLinkOf", () => {
    it("keeps Google Maps links", () => {
        expect(googleMapsLinkOf("https://maps.app.goo.gl/UXEiDjhdRibZegzu5")).toBe(
            "https://maps.app.goo.gl/UXEiDjhdRibZegzu5"
        );
        expect(googleMapsLinkOf("https://www.google.com/maps/place/Pune")).toBe(
            "https://www.google.com/maps/place/Pune"
        );
        expect(googleMapsLinkOf("https://goo.gl/maps/abc123")).toBe("https://goo.gl/maps/abc123");
        expect(googleMapsLinkOf("https://www.google.co.in/maps/place/Baner")).toBe(
            "https://www.google.co.in/maps/place/Baner"
        );
    });

    it("rejects other sites, plain http and non-map Google pages", () => {
        expect(googleMapsLinkOf("https://example.com/maps")).toBeNull();
        expect(googleMapsLinkOf("http://maps.app.goo.gl/abc")).toBeNull();
        expect(googleMapsLinkOf("https://www.google.com/search?q=pune")).toBeNull();
        expect(googleMapsLinkOf("https://maps.google.com/url?q=https://example.com")).toBeNull();
        expect(googleMapsLinkOf("https://www.google.com/mapsfoo")).toBeNull();
        expect(googleMapsLinkOf("Baner Rd, Pune")).toBeNull();
        expect(googleMapsLinkOf(null)).toBeNull();
    });
});
