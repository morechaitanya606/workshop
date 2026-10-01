import { describe, expect, it } from "vitest";
import { serializeJsonLd } from "./json-ld";

describe("serializeJsonLd", () => {
    it("escapes characters that could break out of a script tag", () => {
        const payload = { name: "</script><script>alert(1)</script>", note: "a & b <!-- c" };
        const out = serializeJsonLd(payload);

        expect(out).not.toContain("<");
        expect(out).not.toContain(">");
        expect(out).not.toContain("&");
    });

    it("round-trips to the original value", () => {
        const payload = {
            "@type": "Event",
            name: "Pottery </script> & more \u2028\u2029",
            nested: [1, true, null, { a: "<b>" }],
        };

        expect(JSON.parse(serializeJsonLd(payload))).toEqual(payload);
    });

    it("escapes the JS line separators", () => {
        const out = serializeJsonLd({ text: "a\u2028b\u2029c" });

        expect(out).not.toMatch(/[\u2028\u2029]/);
        expect(out).toContain("\\u2028");
        expect(out).toContain("\\u2029");
    });

    it("falls back to null for undefined input", () => {
        expect(serializeJsonLd(undefined)).toBe("null");
    });
});
