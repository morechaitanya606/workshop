/**
 * Serialise a JSON-LD payload for embedding inside a `<script type="application/ld+json">` tag.
 *
 * `JSON.stringify` alone is not safe there: a value such as `</script><script>alert(1)</script>`
 * (a workshop title or description a host controls) would close the script element early. The
 * characters below are replaced with their `\uXXXX` escapes, which are identical to the original
 * characters once the JSON is parsed but can never terminate the script block or an HTML comment.
 */
const JSON_LD_ESCAPES: Record<string, string> = {
    "<": "\\u003c",
    ">": "\\u003e",
    "&": "\\u0026",
    "\u2028": "\\u2028",
    "\u2029": "\\u2029",
};

export function serializeJsonLd(value: unknown): string {
    const json = JSON.stringify(value) ?? "null";
    return json.replace(/[<>&\u2028\u2029]/g, (char) => JSON_LD_ESCAPES[char]);
}
