/**
 * Check vercel.json before Vercel does.
 *
 * Run from app/:  npm run vercel:validate
 *
 * `vercel.json`'s schema declares `additionalProperties: false`, so an unrecognised top-level
 * key is not an inert comment -- Vercel rejects the configuration and the deployment fails
 * before it builds. A `_regionNote` key holding a perfectly sensible explanation did exactly
 * that here, and nothing caught it: typecheck, lint, the test suite and `next build` never
 * read this file, so the first sign was a red deployment.
 *
 * Tries the published schema first so new Vercel keys are picked up automatically, and falls
 * back to a snapshot when the network is unavailable. Either way the answer is deterministic:
 * an unknown key fails.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCHEMA_URL = "https://openapi.vercel.sh/vercel.json";
const CONFIG = join(dirname(fileURLToPath(import.meta.url)), "..", "vercel.json");

/**
 * Snapshot of the schema's top-level properties, taken 2026-09-13. Only used when the live
 * schema cannot be fetched. If Vercel adds a key and you are offline, this is the list to
 * extend -- the failure message says so.
 */
const KNOWN_KEYS = new Set([
    "$schema",
    "buildCommand",
    "cleanUrls",
    "crons",
    "devCommand",
    "framework",
    "functions",
    "git",
    "headers",
    "ignoreCommand",
    "images",
    "installCommand",
    "outputDirectory",
    "public",
    "redirects",
    "regions",
    "rewrites",
    "trailingSlash",
]);

async function fetchSchemaKeys() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    try {
        const response = await fetch(SCHEMA_URL, { signal: controller.signal });
        if (!response.ok) return null;
        const schema = await response.json();
        const keys = Object.keys(schema?.properties ?? {});
        return keys.length ? new Set([...keys, "$schema"]) : null;
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

let raw;
try {
    raw = readFileSync(CONFIG, "utf8");
} catch {
    console.log("no vercel.json; nothing to check");
    process.exit(0);
}

let config;
try {
    config = JSON.parse(raw);
} catch (error) {
    console.error(`vercel.json is not valid JSON: ${error.message}`);
    process.exit(1);
}

const live = await fetchSchemaKeys();
const allowed = live ?? KNOWN_KEYS;
const source = live ? "published schema" : "local snapshot (schema unreachable)";

const unknown = Object.keys(config).filter((key) => !allowed.has(key));

if (unknown.length) {
    console.error(
        [
            `vercel.json has ${unknown.length} key(s) Vercel does not recognise: ${unknown.join(", ")}`,
            "",
            "The schema sets additionalProperties: false, so Vercel will reject this",
            "configuration and the deployment will fail before it builds.",
            "",
            "JSON has no comments. If you are documenting a decision, put it in DEPLOYMENT.md.",
            live ? "" : "If Vercel genuinely added this key, extend KNOWN_KEYS in this script.",
        ]
            .filter(Boolean)
            .join("\n")
    );
    process.exit(1);
}

console.log(`vercel.json: ${Object.keys(config).length} top-level keys, all valid (${source}).`);
