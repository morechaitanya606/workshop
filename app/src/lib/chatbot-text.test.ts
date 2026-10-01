import { describe, expect, it } from "vitest";
import { getSafeChatHref, parseChatMessageContent } from "@/lib/chatbot-text";

describe("getSafeChatHref", () => {
    it("allows same-site paths, http(s), mailto and tel", () => {
        expect(getSafeChatHref("/workshop/abc")).toEqual({
            href: "/workshop/abc",
            kind: "internal",
        });
        expect(getSafeChatHref("/explore?category=Pottery&page=1")?.kind).toBe("internal");
        expect(getSafeChatHref("https://example.com/a")).toEqual({
            href: "https://example.com/a",
            kind: "external",
        });
        expect(getSafeChatHref("http://example.com")?.kind).toBe("external");
        expect(getSafeChatHref("mailto:hello@onlyworkshop.com")?.kind).toBe("contact");
        expect(getSafeChatHref("tel:+917028478109")?.kind).toBe("contact");
    });

    it.each([
        "javascript:alert(1)",
        "JaVaScRiPt:alert(1)",
        "data:text/html;base64,PHNjcmlwdD4=",
        "vbscript:msgbox(1)",
        "//evil.example.com",
        "/\\evil.example.com",
        "ftp://example.com",
        "workshop/abc",
        "",
        "/path with space",
        "/a\nb",
    ])("rejects %j", (href) => {
        expect(getSafeChatHref(href)).toBeNull();
    });
});

describe("parseChatMessageContent", () => {
    it("splits text, bold and links", () => {
        expect(parseChatMessageContent("See **Pottery** at [View](/workshop/p1) now")).toEqual([
            { type: "text", text: "See " },
            { type: "bold", text: "Pottery" },
            { type: "text", text: " at " },
            { type: "link", label: "View", href: "/workshop/p1", kind: "internal" },
            { type: "text", text: " now" },
        ]);
    });

    it("degrades an unsafe link to its label", () => {
        const segments = parseChatMessageContent("[Click me](javascript:alert(1))");
        expect(segments.some((segment) => segment.type === "link")).toBe(false);
        expect(segments[0]).toEqual({ type: "text", text: "Click me" });
    });

    it("leaves plain text alone", () => {
        expect(parseChatMessageContent("Just text (no link) [brackets]")).toEqual([
            { type: "text", text: "Just text (no link) [brackets]" },
        ]);
    });
});
