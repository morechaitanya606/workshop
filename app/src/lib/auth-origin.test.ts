import { describe, expect, it } from "vitest";
import { sanitizeInternalRedirect } from "./auth-origin";

const APP_ORIGIN = "https://onlyworkshops.com";

describe("sanitizeInternalRedirect", () => {
    it("keeps an ordinary in-app path, query and hash intact", () => {
        expect(sanitizeInternalRedirect("/booking?workshop=w1#seats", APP_ORIGIN)).toBe(
            "/booking?workshop=w1#seats"
        );
    });

    it.each([null, undefined, "", "not-a-path", "https://evil.example/steal"])(
        "falls back to / for %p",
        (input) => {
            expect(sanitizeInternalRedirect(input, APP_ORIGIN)).toBe("/");
        }
    );

    /**
     * The whole reason this helper exists. Each of these passes a
     * `startsWith("/") && !startsWith("//") && !includes("\\")` string filter, and the URL
     * parser then resolves it off-origin -- handing an attacker the page the user lands on
     * immediately after their session cookies are set.
     */
    it.each([
        ["protocol-relative", "//evil.example/steal"],
        ["triple slash", "///evil.example/steal"],
        ["tab-stripped protocol-relative", "/\t/evil.example/steal"],
        ["newline-stripped protocol-relative", "/\n/evil.example/steal"],
        ["carriage-return-stripped", "/\r/evil.example/steal"],
        ["backslash treated as slash", "/\\evil.example/steal"],
        ["backslash after slash", "/\\\\evil.example/steal"],
        ["scheme-relative with credentials", "/\t/user:pass@evil.example"],
        // These resolve ON-origin -- the ".." pops a segment inside the base -- but leave a
        // pathname of "//evil.example/...", which is protocol-relative to whatever parses
        // the returned string next (the Next router, NextResponse.redirect).
        ["dot-segment leaving a protocol-relative path", "/..//evil.example/steal"],
        ["deeper dot-segments", "/a/b/../../..//evil.example"],
    ])("refuses to leave the app origin: %s", (_name, input) => {
        const result = sanitizeInternalRedirect(input, APP_ORIGIN);

        expect(result.startsWith("/")).toBe(true);
        expect(new URL(result, APP_ORIGIN).origin).toBe(APP_ORIGIN);
        expect(result).toBe("/");
    });

    it("normalises away control characters rather than echoing the caller's string", () => {
        // "/explore\t/x" parses to "/explore/x"; the returned value is rebuilt from the parse,
        // so nothing downstream re-parses a string with a different meaning than we checked.
        expect(sanitizeInternalRedirect("/explore\t/x", APP_ORIGIN)).toBe("/explore/x");
    });

    it("falls back when the origin itself is unusable", () => {
        expect(sanitizeInternalRedirect("/explore", "not-a-url")).toBe("/");
    });

    it("returns a value that is still same-origin when re-parsed by another parser", () => {
        // The contract callers rely on: whatever comes back can be handed to router.push or
        // NextResponse.redirect without re-validating it. One origin check on the RESOLVED
        // url is not enough, because the rebuilt path is what actually gets re-parsed.
        const inputs = [
            "/booking?workshop=w1",
            "/..//evil.example/steal",
            "/a/b/../../..//evil.example",
            "/a/../../b",
            "//evil.example",
        ];

        for (const input of inputs) {
            const result = sanitizeInternalRedirect(input, APP_ORIGIN);
            expect(new URL(result, APP_ORIGIN).origin).toBe(APP_ORIGIN);
        }
    });
});
