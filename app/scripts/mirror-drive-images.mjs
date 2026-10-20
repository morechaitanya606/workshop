/**
 * Copy every Google Drive photo the site shows into Supabase Storage, then point the database
 * rows at the copy.
 *
 * Why: Drive thumbnails are not a CDN. Each one costs ~1-1.5s to produce before Vercel can even
 * start resizing it, Google rate-limits hot-linking, and `sz=w1200` caps the resolution. Storage
 * objects are served from Cloudflare's edge in ~0.3s and are stored here at full quality.
 *
 * Run from app/ (reads the live database, so DRY RUN is the default):
 *   node --env-file=.env.local scripts/mirror-drive-images.mjs            # report only
 *   node --env-file=.env.local scripts/mirror-drive-images.mjs --apply    # copy + update rows
 *   node --env-file=.env.local scripts/mirror-drive-images.mjs --apply --limit=5
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 *
 * Idempotent: the storage path is derived from the Drive file id (`mirrored/drive-<id>.webp`),
 * so a re-run reuses what is already uploaded and only rewrites rows that still hold a Drive
 * URL. Originals in Drive are never touched. A photo that cannot be fetched (file no longer
 * shared, quota page) is reported and its row is left alone.
 */
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const BUCKET = "uploads";
const DRIVE_FETCH_WIDTH = 2400;
const MAX_DIMENSION = 2560;
const WEBP_QUALITY = 80;
const PAGE_SIZE = 500;

/** [table, column, isArray]: every column the site renders as a photo. */
const TARGETS = [
    ["community_photos", "image_url", false],
    ["workshops", "cover_image", false],
    ["workshops", "gallery_images", true],
    ["workshops", "host_avatar", false],
    ["workshops", "location_images", true],
    ["workshop_templates", "cover_image", false],
    ["workshop_templates", "gallery_images", true],
    ["workshop_templates", "location_images", true],
    ["communities", "cover_image", false],
    ["hosts", "avatar_url", false],
    ["host_profiles", "avatar", false],
    ["profiles", "avatar_url", false],
    ["workshop_feedback", "photos", true],
];

const APPLY = process.argv.includes("--apply");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const LIMIT = limitArg ? Number.parseInt(limitArg.slice("--limit=".length), 10) : Infinity;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!supabaseUrl || !serviceKey) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see --env-file).");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

/** Drive file id from a thumbnail / file / open URL, or null if this is not a Drive URL. */
function driveIdOf(value) {
    if (typeof value !== "string") return null;
    let url;
    try {
        url = new URL(value);
    } catch {
        return null;
    }
    const host = url.hostname.toLowerCase();
    if (host !== "drive.google.com" && host !== "docs.google.com") return null;
    return (
        url.searchParams.get("id") ||
        url.pathname.match(/\/file\/d\/([\w-]+)/)?.[1] ||
        url.pathname.match(/\/d\/([\w-]+)/)?.[1] ||
        null
    );
}

const mirroredUrls = new Map(); // drive id -> public URL, or null when it failed
let copied = 0;
let reused = 0;
let failed = 0;

async function mirror(driveId) {
    if (mirroredUrls.has(driveId)) return mirroredUrls.get(driveId);

    const objectPath = `mirrored/drive-${driveId}.webp`;
    const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
    const publicUrl = publicUrlData.publicUrl;

    // Already uploaded by an earlier run (or an interrupted one).
    const head = await fetch(publicUrl, { method: "HEAD" });
    if (head.ok) {
        reused += 1;
        mirroredUrls.set(driveId, publicUrl);
        return publicUrl;
    }

    try {
        const response = await fetch(
            `https://drive.google.com/thumbnail?id=${driveId}&sz=w${DRIVE_FETCH_WIDTH}`,
            { redirect: "follow", signal: AbortSignal.timeout(30_000) }
        );
        const contentType = response.headers.get("content-type") || "";
        if (!response.ok || !contentType.startsWith("image/")) {
            throw new Error(`Drive answered ${response.status} ${contentType}`);
        }

        const buffer = await sharp(Buffer.from(await response.arrayBuffer()))
            .rotate()
            .resize({
                width: MAX_DIMENSION,
                height: MAX_DIMENSION,
                fit: "inside",
                withoutEnlargement: true,
            })
            .webp({ quality: WEBP_QUALITY, effort: 5 })
            .toBuffer();

        const { error } = await supabase.storage.from(BUCKET).upload(objectPath, buffer, {
            contentType: "image/webp",
            cacheControl: "31536000",
            upsert: false,
        });
        if (error) throw error;

        copied += 1;
        mirroredUrls.set(driveId, publicUrl);
        console.log(`  copied  ${driveId}  ${(buffer.byteLength / 1024).toFixed(0)} KB`);
        return publicUrl;
    } catch (error) {
        failed += 1;
        mirroredUrls.set(driveId, null);
        console.warn(`  FAILED  ${driveId}: ${error instanceof Error ? error.message : error}`);
        return null;
    }
}

async function* rowsOf(table, column) {
    for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await supabase
            .from(table)
            .select(`id, ${column}`)
            .order("id")
            .range(from, from + PAGE_SIZE - 1);
        if (error) throw new Error(`${table}.${column}: ${error.message}`);
        for (const row of data) yield row;
        if (data.length < PAGE_SIZE) return;
    }
}

console.log(APPLY ? "APPLY: copying photos and updating rows\n" : "DRY RUN: nothing is changed\n");

let touchedRows = 0;
let driveReferences = 0;
let budget = LIMIT;

for (const [table, column, isArray] of TARGETS) {
    let tableRefs = 0;
    console.log(`${table}.${column}`);

    for await (const row of rowsOf(table, column)) {
        const current = row[column];
        const values = isArray ? (Array.isArray(current) ? current : []) : [current];
        const ids = values.map(driveIdOf);
        const refs = ids.filter(Boolean).length;
        if (refs === 0) continue;

        tableRefs += refs;
        driveReferences += refs;
        if (!APPLY || budget <= 0) continue;
        budget -= 1;

        const next = [];
        for (const [index, value] of values.entries()) {
            const id = ids[index];
            next.push(id ? ((await mirror(id)) ?? value) : value);
        }

        const changed = next.some((value, index) => value !== values[index]);
        if (!changed) continue;

        const { error } = await supabase
            .from(table)
            .update({ [column]: isArray ? next : next[0] })
            .eq("id", row.id);
        if (error) {
            console.warn(`  could not update ${table} ${row.id}: ${error.message}`);
            continue;
        }
        touchedRows += 1;
    }

    console.log(`  ${tableRefs} Drive photo(s)\n`);
}

console.log(`${driveReferences} Drive photo reference(s) found across the site.`);
if (APPLY) {
    console.log(
        `${copied} uploaded, ${reused} already in storage, ${failed} failed; ` +
            `${touchedRows} row(s) updated.`
    );
    console.log("Rerun to retry failures. Pages refresh within 60s (ISR); no deploy is needed.");
} else {
    console.log("Re-run with --apply to copy them and update the rows.");
}
process.exit(failed ? 1 : 0);
