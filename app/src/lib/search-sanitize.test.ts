import { describe, expect, it } from "vitest";
import { buildIlikeOrFilter, MAX_SEARCH_TERM_LENGTH, sanitizeSearchTerm } from "./search-sanitize";

describe("sanitizeSearchTerm", () => {
    it("keeps ordinary text and collapses whitespace", () => {
        expect(sanitizeSearchTerm("  pottery   class ")).toBe("pottery class");
    });

    it("strips PostgREST structural characters so extra filters cannot be injected", () => {
        const term = sanitizeSearchTerm('x,id.neq.0),or(email.ilike.*"\\');
        expect(term).not.toMatch(/[,()*"\\%]/);
        expect(term).toBe("xid.neq.0or" + "email.ilike.");
    });

    it("strips % and * wildcards but keeps apostrophes and underscores", () => {
        expect(sanitizeSearchTerm("100%*off O'Brien john_doe")).toBe("100off O'Brien john_doe");
    });

    it("caps the length", () => {
        expect(sanitizeSearchTerm("a".repeat(500)).length).toBe(MAX_SEARCH_TERM_LENGTH);
    });

    it("returns an empty string for non-strings", () => {
        expect(sanitizeSearchTerm(undefined)).toBe("");
        expect(sanitizeSearchTerm(42)).toBe("");
    });
});

describe("buildIlikeOrFilter", () => {
    it("builds an or() expression over the given columns", () => {
        expect(buildIlikeOrFilter(["title", "city"], "paint")).toBe(
            "title.ilike.%paint%,city.ilike.%paint%"
        );
    });

    it("returns null when nothing searchable remains", () => {
        expect(buildIlikeOrFilter(["title"], ",(),%")).toBeNull();
    });
});
