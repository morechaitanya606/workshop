import { createHash } from "node:crypto";
import { convertImageToWebp } from "./image-conversion";
import type { SupabaseServerClient } from "./supabase-server";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "./supabase-server";
import { extractGoogleDriveFileId } from "./workshop-media";

/**
 * Pasted image links (Google Drive, Google Photos, Unsplash) are copied into Supabase Storage
 * when a form is saved, and the copy's URL is stored instead.
 *
 * Why: Drive is not a CDN. Its thumbnails take 1-1.5 s each, Google rate-limits hot-linking, and
 * the `sz=w1200` thumbnail the site used caps the resolution. The copy is fetched at 2400 px,
 * stored as WebP (up to 2560 px, the same as direct uploads) and served from the CDN.
 *
 * Drive copies use the same object names as scripts/mirror-drive-images.mjs, so a photo that is
 * saved twice (or was already mirrored by the script) is stored once. If a copy fails (file not
 * shared, Drive slow), the original link is kept and the save still goes through.
 */

const BUCKET = "uploads";
const DRIVE_FETCH_WIDTH = 2400;
const SOURCE_TIMEOUT_MS = 15_000;
const HEAD_TIMEOUT_MS = 5_000;
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const CONCURRENCY = 4;
const DRIVE_ID_RE = /^[\w-]{10,200}$/;

/** Hosts whose images are copied. Everything else (our storage, site paths) is left alone. */
function isCopiedHost(hostname: string) {
    return (
        hostname === "drive.usercontent.google.com" ||
        hostname.endsWith(".googleusercontent.com") ||
        hostname === "images.unsplash.com"
    );
}

export type ImageMirrorPlan = { sourceUrl: string; objectPath: string };

/** What to download and where to store it, or null when `value` should be kept as it is. */
export function planImageMirror(value: string): ImageMirrorPlan | null {
    const trimmed = value.trim();
    if (!trimmed || trimmed.startsWith("/")) return null;

    let url: URL;
    try {
        url = new URL(trimmed);
    } catch {
        return null;
    }
    if (url.protocol !== "https:") return null;

    const host = url.hostname.toLowerCase();
    if (host === "drive.google.com" || host === "docs.google.com") {
        const driveId = extractGoogleDriveFileId(trimmed);
        if (!driveId || !DRIVE_ID_RE.test(driveId)) return null;
        return {
            sourceUrl: `https://drive.google.com/thumbnail?id=${driveId}&sz=w${DRIVE_FETCH_WIDTH}`,
            objectPath: `mirrored/drive-${driveId}.webp`,
        };
    }

    if (!isCopiedHost(host)) return null;

    if (host === "images.unsplash.com") {
        // Unsplash resizes on request: ask for the large rendition, not the thumbnail.
        url.searchParams.set("w", String(DRIVE_FETCH_WIDTH));
        url.searchParams.delete("h");
    }
    const sourceUrl = url.toString();
    const hash = createHash("sha256").update(sourceUrl).digest("hex").slice(0, 32);
    return { sourceUrl, objectPath: `mirrored/url-${hash}.webp` };
}

function describeError(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}

/** The storage URL of a copy of `value`, or `value` itself when it is kept or the copy fails. */
export async function mirrorImageUrl(value: string, client: SupabaseServerClient) {
    const plan = planImageMirror(value);
    if (!plan) return value;

    const { data } = client.storage.from(BUCKET).getPublicUrl(plan.objectPath);
    const publicUrl = data.publicUrl;

    try {
        const head = await fetch(publicUrl, {
            method: "HEAD",
            signal: AbortSignal.timeout(HEAD_TIMEOUT_MS),
        });
        if (head.ok) return publicUrl;
    } catch {
        // Not reachable right now: try to copy it anyway.
    }

    try {
        const response = await fetch(plan.sourceUrl, {
            redirect: "follow",
            signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS),
        });
        const contentType = (response.headers.get("content-type") || "")
            .split(";")[0]
            .trim()
            .toLowerCase();
        if (!response.ok || !contentType.startsWith("image/")) {
            throw new Error(`source answered ${response.status} ${contentType || "(no type)"}`);
        }
        // Vector logos and animations would lose what makes them what they are as a WebP still.
        if (contentType === "image/svg+xml" || contentType === "image/gif") return value;

        const declaredBytes = Number(response.headers.get("content-length") || 0);
        if (declaredBytes > MAX_SOURCE_BYTES) throw new Error("source image is too large");
        const input = Buffer.from(await response.arrayBuffer());
        if (input.byteLength > MAX_SOURCE_BYTES) throw new Error("source image is too large");

        const { buffer } = await convertImageToWebp(input, {
            contentType,
            extension: contentType.split("/")[1] ?? "",
        });

        const { error } = await client.storage.from(BUCKET).upload(plan.objectPath, buffer, {
            contentType: "image/webp",
            // The name is derived from the source, which never changes: the file is immutable.
            cacheControl: "31536000",
            upsert: false,
        });
        // Another save copied the same photo a moment ago: that copy is just as good.
        if (error && !/exist|duplicate/i.test(error.message)) throw error;

        return publicUrl;
    } catch (error) {
        console.warn("Could not copy an image link into storage; keeping the link.", {
            url: value,
            error: describeError(error),
        });
        return value;
    }
}

async function mapWithConcurrency<T, R>(
    items: readonly T[],
    limit: number,
    task: (item: T) => Promise<R>
) {
    const results = new Array<R>(items.length);
    let next = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) {
            const index = next++;
            results[index] = await task(items[index]);
        }
    });
    await Promise.all(workers);
    return results;
}

/**
 * Replaces the image links in `data[field]` (a string or a string array) with storage copies,
 * in place. Call it right after a form is validated and before the row is written.
 */
export async function mirrorImageFields<T extends object>(
    data: T,
    fields: readonly (keyof T)[],
    client?: SupabaseServerClient
) {
    const record = data as Record<string, unknown>;
    const keys = fields.map(String);
    const urls = new Set<string>();
    for (const key of keys) {
        const value = record[key];
        if (typeof value === "string") urls.add(value);
        if (Array.isArray(value)) {
            for (const item of value) if (typeof item === "string") urls.add(item);
        }
    }
    const pending = [...urls].filter((url) => planImageMirror(url) !== null);
    if (pending.length === 0) return;
    // Local setups without the service key keep the links as they are.
    if (!client && !isSupabaseServiceConfigured) return;

    const storage = client ?? createSupabaseServiceClient();
    const copies = await mapWithConcurrency(pending, CONCURRENCY, (url) =>
        mirrorImageUrl(url, storage)
    );
    const copyOf = new Map(pending.map((url, index) => [url, copies[index]]));
    const swap = (item: unknown) => (typeof item === "string" ? (copyOf.get(item) ?? item) : item);

    for (const key of keys) {
        const value = record[key];
        if (typeof value === "string") record[key] = swap(value);
        else if (Array.isArray(value)) record[key] = value.map(swap);
    }
}
