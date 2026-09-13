/**
 * Upload the hero video renditions to the public `media` Supabase Storage bucket.
 *
 * Run from app/:  node scripts/upload-hero-media.mjs
 *
 * Reads SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL from .env.local. The key is
 * never printed. Re-running is safe: objects are upserted, so this doubles as a way to push
 * a re-encoded (smaller) rendition over an existing one.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "media";
const PREFIX = "hero";
const SOURCE_DIR = join(process.cwd(), "public", "videos");

/** Minimal .env.local reader - avoids adding a dotenv dependency for a one-off script. */
function readEnvLocal() {
    const out = {};
    let raw;
    try {
        raw = readFileSync(join(process.cwd(), ".env.local"), "utf8");
    } catch {
        return out;
    }
    for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }
        out[key] = value;
    }
    return out;
}

const fileEnv = readEnvLocal();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || fileEnv.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
    console.error(
        "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (checked env and .env.local)."
    );
    process.exit(1);
}

const CONTENT_TYPES = {
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
};

const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
});

const files = readdirSync(SOURCE_DIR).filter((name) => CONTENT_TYPES[extname(name).toLowerCase()]);

if (files.length === 0) {
    console.error(`No video files found in ${SOURCE_DIR}`);
    process.exit(1);
}

let failed = 0;
for (const name of files) {
    const body = readFileSync(join(SOURCE_DIR, name));
    const objectPath = `${PREFIX}/${name}`;
    const { error } = await supabase.storage.from(BUCKET).upload(objectPath, body, {
        contentType: CONTENT_TYPES[extname(name).toLowerCase()],
        upsert: true,
        // Hero renditions are immutable once shipped; a new cut gets a new filename.
        cacheControl: "31536000",
    });

    if (error) {
        failed += 1;
        console.error(`FAIL ${objectPath}: ${error.message}`);
        continue;
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
    console.log(
        `ok   ${objectPath}  ${(body.byteLength / 1048576).toFixed(1)} MB  ${data?.publicUrl ?? ""}`
    );
}

console.log(`\n${files.length - failed}/${files.length} uploaded to bucket "${BUCKET}".`);
process.exit(failed ? 1 : 0);
