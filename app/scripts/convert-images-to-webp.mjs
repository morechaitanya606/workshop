/**
 * Convert the raster images under public/ (JPG, JPEG, PNG, HEIC, HEIF) to WebP.
 *
 * Run from app/:
 *   node scripts/convert-images-to-webp.mjs --dry-run   # report only
 *   node scripts/convert-images-to-webp.mjs             # convert and delete the originals
 *   node scripts/convert-images-to-webp.mjs --keep      # convert, keep the originals
 *
 * Idempotent: a file that already has a .webp sibling is skipped, and a re-run after a
 * conversion finds nothing left to do.
 *
 * Left alone on purpose (see KEEP_AS_IS):
 *   - og-default.jpg / summer-family-retreat-og.jpg: link-preview crawlers (WhatsApp,
 *     LinkedIn, older Facebook/Twitter scrapers) do not reliably render WebP og:images.
 *   - icon.png: the apple-touch-icon must be PNG on iOS, and it is also the Organization
 *     JSON-LD logo.
 *
 * HEIC/HEIF cannot be decoded by sharp's prebuilt binaries (the HEVC decoder is omitted for
 * licensing reasons), so they go through the pure-JS heic-convert first, same as the upload
 * route does.
 */
import { readFile, writeFile, readdir, stat, unlink } from "node:fs/promises";
import { join, extname, basename, dirname, relative, sep } from "node:path";
import sharp from "sharp";

const ROOT = join(process.cwd(), "public");
const DRY_RUN = process.argv.includes("--dry-run");
const KEEP_ORIGINALS = process.argv.includes("--keep");

const CONVERTIBLE = new Set([".jpg", ".jpeg", ".png", ".heic", ".heif"]);
const HEIC_EXTENSIONS = new Set([".heic", ".heif"]);
const KEEP_AS_IS = new Set([
    "images/og-default.jpg",
    "images/summer-family-retreat-og.jpg",
    "images/icon.png",
]);
/** Skip generated/user-upload folders; they are gitignored and not ours to rewrite. */
const SKIP_DIRS = new Set(["uploads", "videos", ".well-known"]);

/** Phone photos are 4000px+; nothing on the site renders wider than this. */
const MAX_DIMENSION = 2560;
const WEBP_QUALITY = 80;

async function* walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            if (!SKIP_DIRS.has(entry.name)) yield* walk(join(dir, entry.name));
        } else {
            yield join(dir, entry.name);
        }
    }
}

/** "IMG_0138.HEIC.heif" -> "IMG_0138.webp", "photo.jpeg" -> "photo.webp" */
function webpPathFor(file) {
    const ext = extname(file);
    let stem = basename(file, ext);
    if (HEIC_EXTENSIONS.has(extname(stem).toLowerCase())) {
        stem = basename(stem, extname(stem));
    }
    return join(dirname(file), `${stem}.webp`);
}

async function decode(file) {
    const input = await readFile(file);
    if (!HEIC_EXTENSIONS.has(extname(file).toLowerCase())) return input;

    const heicConvert = (await import("heic-convert")).default;
    return Buffer.from(await heicConvert({ buffer: input, format: "JPEG", quality: 0.92 }));
}

async function toWebp(file) {
    const source = await decode(file);
    const base = () => sharp(source).rotate().resize({
        width: MAX_DIMENSION,
        height: MAX_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
    });

    const lossy = await base().webp({ quality: WEBP_QUALITY, effort: 6 }).toBuffer();

    // Flat graphics (logos) are often smaller as lossless WebP than lossy, and the lossy
    // version bands on gradients, so take whichever is smaller.
    if (extname(file).toLowerCase() === ".png") {
        const lossless = await base().webp({ lossless: true, effort: 6 }).toBuffer();
        return lossless.byteLength < lossy.byteLength ? lossless : lossy;
    }

    return lossy;
}

const mb = (bytes) => (bytes / 1048576).toFixed(2);

let converted = 0;
let skipped = 0;
let failed = 0;
let beforeBytes = 0;
let afterBytes = 0;
const renames = [];

for await (const file of walk(ROOT)) {
    const ext = extname(file).toLowerCase();
    if (!CONVERTIBLE.has(ext)) continue;

    const rel = relative(ROOT, file).split(sep).join("/");
    if (KEEP_AS_IS.has(rel)) {
        skipped += 1;
        continue;
    }

    const target = webpPathFor(file);
    const targetRel = relative(ROOT, target).split(sep).join("/");

    try {
        const originalSize = (await stat(file)).size;

        if (DRY_RUN) {
            console.log(`would convert  ${rel}  (${mb(originalSize)} MB) -> ${targetRel}`);
            beforeBytes += originalSize;
            converted += 1;
            continue;
        }

        const output = await toWebp(file);
        // Two sources can map to one name (photo.jpg + photo.png). Refuse to overwrite.
        try {
            await stat(target);
            console.warn(`SKIP ${rel}: ${targetRel} already exists`);
            skipped += 1;
            continue;
        } catch {
            // target is free
        }

        await writeFile(target, output);
        if (!KEEP_ORIGINALS) await unlink(file);

        beforeBytes += originalSize;
        afterBytes += output.byteLength;
        converted += 1;
        renames.push([rel, targetRel]);
        console.log(`ok  ${rel}  ${mb(originalSize)} -> ${mb(output.byteLength)} MB`);
    } catch (error) {
        failed += 1;
        console.error(`FAIL ${rel}: ${error instanceof Error ? error.message : error}`);
    }
}

console.log(
    `\n${converted} converted, ${skipped} skipped, ${failed} failed.` +
        (DRY_RUN
            ? `\n${mb(beforeBytes)} MB of source images would be converted.`
            : `\n${mb(beforeBytes)} MB -> ${mb(afterBytes)} MB.`)
);

if (renames.length > 0) {
    console.log("\nFiles whose URL changed (update any hard-coded references):");
    for (const [from, to] of renames) console.log(`  /${from}  ->  /${to}`);
}

process.exit(failed ? 1 : 0);
