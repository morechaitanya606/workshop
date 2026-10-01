/**
 * Sanitise free-text user input before it is interpolated into a PostgREST `.or()` filter.
 *
 * `.or("a.ilike.%x%,b.ilike.%x%")` is parsed by PostgREST itself: a comma starts a new filter,
 * parentheses open logic groups, and `*`, `%`, `\` and `"` are pattern/escape/quote characters.
 * Stripping only `%` let a caller smuggle `x,id.neq.0` (extra filter) or `x),or(...` into the
 * query. Removing every structural character leaves a plain search needle.
 */
export const MAX_SEARCH_TERM_LENGTH = 80;

// Structural PostgREST characters (filter separator, logic groups, quoting, escaping) plus the
// `%` / `*` wildcards. `_` is deliberately kept: it is a single-character LIKE wildcard that can
// only widen a match, and it is common in e-mail addresses people search for.
const UNSAFE_SEARCH_CHARS = /[%*,()\\"]/g;

export function sanitizeSearchTerm(raw: unknown, maxLength = MAX_SEARCH_TERM_LENGTH): string {
    if (typeof raw !== "string") {
        return "";
    }

    return raw
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .replace(UNSAFE_SEARCH_CHARS, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maxLength)
        .trim();
}

/**
 * Builds the value for `query.or(...)`: `col1.ilike.%term%,col2.ilike.%term%`.
 * Returns null when nothing searchable survives sanitisation so callers skip the filter
 * instead of sending an unbounded `%%` match.
 */
export function buildIlikeOrFilter(columns: readonly string[], raw: unknown): string | null {
    const term = sanitizeSearchTerm(raw);
    if (!term || columns.length === 0) {
        return null;
    }

    return columns.map((column) => `${column}.ilike.%${term}%`).join(",");
}
