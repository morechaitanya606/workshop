import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { getUserRole, requireAuthenticatedUser, jsonError } from "@/lib/api-auth";
import crypto from "crypto";
import { assertQuota, assertRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { requireSupabaseService } from "@/lib/api-helpers";
import { getPublicSupabaseConfig } from "@/lib/env";
import { convertImageToWebp, type CropAspect } from "@/lib/image-conversion";

const DEFAULT_BUCKET = "uploads";
const ALLOWED_UPLOAD_BUCKETS = new Set([DEFAULT_BUCKET]);
const DEFAULT_SIGNED_URL_TTL_SECONDS = 60 * 10;
const UPLOAD_TYPE_ERROR_MESSAGE =
    "Invalid file type. Allowed: image files (JPEG, PNG, WebP, GIF, AVIF, HEIC/HEIF, BMP, TIFF, ICO, JP2, JXL, RAW) and videos (MP4, WebM, MOV, M4V).";
const IMAGE_CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    jpe: "image/jpeg",
    jfif: "image/jpeg",
    png: "image/png",
    apng: "image/apng",
    webp: "image/webp",
    gif: "image/gif",
    avif: "image/avif",
    heic: "image/heic",
    heics: "image/heic-sequence",
    heif: "image/heif",
    heifs: "image/heif-sequence",
    hif: "image/heif",
    bmp: "image/bmp",
    dib: "image/bmp",
    tif: "image/tiff",
    tiff: "image/tiff",
    // SVG is deliberately absent: it is a script-bearing document, not a raster image,
    // and the conversion fallback below stores unconvertible input verbatim.
    ico: "image/vnd.microsoft.icon",
    cur: "image/x-icon",
    icns: "image/icns",
    jp2: "image/jp2",
    j2k: "image/jp2",
    jpf: "image/jpx",
    jpx: "image/jpx",
    jpm: "image/jpm",
    jxl: "image/jxl",
    tga: "image/x-tga",
    psd: "image/vnd.adobe.photoshop",
    dds: "image/vnd.ms-dds",
    dng: "image/x-adobe-dng",
    cr2: "image/x-canon-cr2",
    cr3: "image/x-canon-cr3",
    crw: "image/x-canon-crw",
    nef: "image/x-nikon-nef",
    nrw: "image/x-nikon-nrw",
    arw: "image/x-sony-arw",
    srf: "image/x-sony-srf",
    sr2: "image/x-sony-sr2",
    raf: "image/x-fuji-raf",
    orf: "image/x-olympus-orf",
    rw2: "image/x-panasonic-rw2",
    pef: "image/x-pentax-pef",
    srw: "image/x-samsung-srw",
};
const VIDEO_CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    m4v: "video/x-m4v",
};
const VIDEO_TYPES = new Set(Object.values(VIDEO_CONTENT_TYPE_BY_EXTENSION));
const IMAGE_EXTENSIONS = new Set(Object.keys(IMAGE_CONTENT_TYPE_BY_EXTENSION));
const VIDEO_EXTENSIONS = new Set(Object.keys(VIDEO_CONTENT_TYPE_BY_EXTENSION));

/** Content types that must never be accepted, whatever the extension claims. */
const BLOCKED_IMAGE_CONTENT_TYPES = new Set(["image/svg+xml", "image/svg"]);

function isImageContentType(contentType: string) {
    return contentType.startsWith("image/") && !BLOCKED_IMAGE_CONTENT_TYPES.has(contentType);
}

// Parses a crop request like "5:4" into an aspect ratio. Returns null for
// missing/invalid values so uploads without a crop are unaffected.
function parseCropAspect(value: FormDataEntryValue | null): CropAspect | null {
    if (typeof value !== "string") return null;
    const match = value.trim().match(/^(\d+)\s*:\s*(\d+)$/);
    if (!match) return null;
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (!width || !height) return null;
    return { width, height };
}

function getImageExtensionFromContentType(contentType: string) {
    if (!isImageContentType(contentType)) {
        return null;
    }

    const knownExtension = Object.entries(IMAGE_CONTENT_TYPE_BY_EXTENSION).find(
        ([, value]) => value === contentType
    )?.[0];
    if (knownExtension) {
        return knownExtension;
    }

    return contentType
        .slice("image/".length)
        .split("+")[0]
        .replace(/[^a-z0-9]/g, "")
        .slice(0, 10);
}

function buildObjectPath(userId: string, ext: string) {
    const uniqueId = crypto.randomBytes(16).toString("hex");
    const safeExt = ext.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10) || "bin";
    // BUG-9 fix: Sanitize userId to prevent directory traversal
    const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || "unknown";
    return `${safeUserId}/${uniqueId}.${safeExt}`;
}

function getSafeExtension(fileName: string) {
    return (fileName.split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getUploadFileInfo(file: File) {
    const contentType = file.type.trim().toLowerCase();
    const extension = getSafeExtension(file.name);

    if (isImageContentType(contentType) || IMAGE_EXTENSIONS.has(extension)) {
        const inferredExtension =
            extension || getImageExtensionFromContentType(contentType) || "jpg";

        return {
            kind: "image" as const,
            extension: inferredExtension,
            contentType: isImageContentType(contentType)
                ? contentType
                : IMAGE_CONTENT_TYPE_BY_EXTENSION[extension] || "image/jpeg",
        };
    }

    if (VIDEO_TYPES.has(contentType) || VIDEO_EXTENSIONS.has(extension)) {
        const resolvedContentType = VIDEO_TYPES.has(contentType)
            ? contentType
            : VIDEO_CONTENT_TYPE_BY_EXTENSION[extension] || "video/mp4";

        return {
            kind: "video" as const,
            // The stored extension must be one of ours. Echoing the caller's (`x.php` sent as
            // video/mp4) put an attacker-chosen extension into the storage path.
            extension: VIDEO_EXTENSIONS.has(extension)
                ? extension
                : getVideoExtensionFromContentType(resolvedContentType),
            contentType: resolvedContentType,
        };
    }

    return null;
}

function getVideoExtensionFromContentType(contentType: string) {
    return (
        Object.entries(VIDEO_CONTENT_TYPE_BY_EXTENSION).find(
            ([, value]) => value === contentType
        )?.[0] || "mp4"
    );
}

type VideoContainer = "isobmff" | "ebml";

function getVideoContainerFamily(extensionOrType: { extension: string; contentType: string }) {
    // Both signals must point at the same family; if either is webm and the other is not, the
    // upload is internally inconsistent and is refused by the caller.
    const families = new Set<VideoContainer>();
    if (VIDEO_EXTENSIONS.has(extensionOrType.extension)) {
        families.add(extensionOrType.extension === "webm" ? "ebml" : "isobmff");
    }
    if (VIDEO_TYPES.has(extensionOrType.contentType)) {
        families.add(extensionOrType.contentType === "video/webm" ? "ebml" : "isobmff");
    }
    return families;
}

/** Container sniffed from the first bytes: `ftyp` box (MP4/MOV/M4V) or EBML header (WebM). */
function sniffVideoContainer(buffer: Buffer): VideoContainer | null {
    if (buffer.length >= 12 && buffer.toString("latin1", 4, 8) === "ftyp") {
        return "isobmff";
    }
    if (
        buffer.length >= 4 &&
        buffer[0] === 0x1a &&
        buffer[1] === 0x45 &&
        buffer[2] === 0xdf &&
        buffer[3] === 0xa3
    ) {
        return "ebml";
    }
    return null;
}

function videoMatchesDeclaredType(
    buffer: Buffer,
    declared: { extension: string; contentType: string }
) {
    const sniffed = sniffVideoContainer(buffer);
    if (!sniffed) return false;

    const families = getVideoContainerFamily(declared);
    return families.size === 1 && families.has(sniffed);
}

/** 200MB of uploads per user per day. Admins are exempt (see POST). */
const DAILY_UPLOAD_QUOTA_BYTES = 200 * 1024 * 1024;
const DAILY_UPLOAD_QUOTA_WINDOW_MS = 24 * 60 * 60_000;

function buildLocalUploadPath(bucket: string, objectPath: string) {
    const safeBucket = bucket.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || DEFAULT_BUCKET;
    const relativePath = path
        .join("uploads", safeBucket, ...objectPath.split("/"))
        .replace(/\\/g, "/");

    return {
        relativePath,
        absolutePath: path.join(process.cwd(), "public", ...relativePath.split("/")),
    };
}

async function persistLocalUpload(bucket: string, objectPath: string, buffer: Buffer) {
    const { absolutePath, relativePath } = buildLocalUploadPath(bucket, objectPath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, buffer);

    return {
        bucket,
        path: relativePath,
        url: `/${relativePath}`,
        signedUrl: null,
        expiresInSeconds: null,
        access: "public" as const,
    };
}

export async function POST(request: NextRequest) {
    // Address-keyed limit BEFORE authentication: requireAuthenticatedUser is a network call to
    // Supabase Auth, so without this an unauthenticated flood buys one remote call per request.
    const ipLimit = await assertRateLimit({
        key: getRateLimitKey(request, "upload-ip"),
        limit: 60,
        windowMs: 5 * 60_000,
        message: "Upload rate limit exceeded. Please try again in a few minutes.",
    });
    if (!ipLimit.ok) {
        return ipLimit.response;
    }

    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    const rateLimitResult = await assertRateLimit({
        key: getRateLimitKey(request, "upload", auth.user.id),
        limit: 30,
        windowMs: 5 * 60_000,
        message: "Upload rate limit exceeded. Please try again in a few minutes.",
        // Uploads decode/re-encode media: do not lift the ceiling if the shared store is down.
        strict: true,
    });
    if (!rateLimitResult.ok) {
        return rateLimitResult.response;
    }

    try {
        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        const bucket = String(formData.get("bucket") || DEFAULT_BUCKET).trim() || DEFAULT_BUCKET;
        const access = String(formData.get("access") || "public")
            .trim()
            .toLowerCase();
        const wantsSignedUrl = access === "private" || access === "signed";
        const cropAspect = parseCropAspect(formData.get("crop"));

        if (!file) {
            return jsonError("No file provided.", 400);
        }

        if (!ALLOWED_UPLOAD_BUCKETS.has(bucket)) {
            return jsonError("Upload bucket is not allowed.", 400);
        }

        const fileInfo = getUploadFileInfo(file);
        if (!fileInfo) {
            return jsonError(UPLOAD_TYPE_ERROR_MESSAGE, 400);
        }

        const isVideo = fileInfo.kind === "video";
        const maxBytes = isVideo ? 50 * 1024 * 1024 : 5 * 1024 * 1024;
        if (file.size > maxBytes) {
            return jsonError(
                isVideo ? "Video size exceeds 50MB limit." : "Image size exceeds 5MB limit.",
                400
            );
        }

        const bytes = await file.arrayBuffer();
        let buffer: Buffer = Buffer.from(bytes);
        let uploadExtension = fileInfo.extension;
        let uploadContentType = fileInfo.contentType;

        // Images are proven by re-encoding below. Videos are stored verbatim, so their
        // container must be proven from the bytes: anything else (an HTML page, an executable)
        // renamed `.mp4` would otherwise be served from our storage under a video type.
        if (isVideo && !videoMatchesDeclaredType(buffer, fileInfo)) {
            return jsonError(
                "This video could not be verified. Upload a real MP4, WebM, MOV or M4V file.",
                400
            );
        }

        // Per-user daily byte budget. Without it one account could push 30 x 50MB every five
        // minutes into our storage bill. Charged only for payloads that passed validation.
        const quota = await assertQuota({
            key: getRateLimitKey(request, "upload-bytes", auth.user.id),
            amount: Math.max(file.size, buffer.byteLength),
            limit: DAILY_UPLOAD_QUOTA_BYTES,
            windowMs: DAILY_UPLOAD_QUOTA_WINDOW_MS,
            message: "Daily upload limit reached (200MB). Please try again tomorrow.",
        });
        if (!quota.ok) {
            // Only an exceeded quota (429) can be waived; an unavailable store (503) cannot.
            const waived =
                quota.response.status === 429 && (await getUserRole(auth.user.id)) === "admin";
            if (!waived) {
                return quota.response;
            }
        }

        // Every image is re-encoded as WebP (optionally cropped to e.g. 5:4 first): smaller
        // files, transparency kept, renders in all browsers, and it is accepted by buckets
        // that restrict MIME types. Re-encoding even WebP/JPEG/PNG input proves the bytes are
        // a real image and drops EXIF (GPS) metadata.
        if (fileInfo.kind === "image") {
            try {
                const normalized = await convertImageToWebp(
                    buffer,
                    {
                        contentType: fileInfo.contentType,
                        extension: fileInfo.extension,
                    },
                    cropAspect ? { cropAspect } : undefined
                );
                buffer = normalized.buffer;
                uploadExtension = normalized.extension;
                uploadContentType = normalized.contentType;
            } catch (conversionError) {
                // Storing the original on failure meant any file sharp could not decode
                // was persisted verbatim under a caller-influenced content type. If we
                // cannot prove what the bytes are, we do not keep them.
                console.error("Image conversion to WebP failed; rejecting upload.", {
                    name: file.name,
                    error:
                        conversionError instanceof Error
                            ? conversionError.message
                            : conversionError,
                });
                return jsonError(
                    "This image could not be processed. Please upload a JPEG, PNG or WebP.",
                    400
                );
            }
        }

        const objectPath = buildObjectPath(auth.user.id, uploadExtension);
        const config = getPublicSupabaseConfig();
        const canUseLocalFallback = process.env.NODE_ENV !== "production";

        const service = requireSupabaseService();
        if (!service.ok) {
            if (!canUseLocalFallback) {
                return service.response;
            }
            const localUpload = await persistLocalUpload(bucket, objectPath, buffer);
            return NextResponse.json({
                ...localUpload,
                supabaseUrl: config?.url || null,
            });
        }

        const { error: uploadError } = await service.client.storage
            .from(bucket)
            .upload(objectPath, buffer, {
                contentType: uploadContentType,
                upsert: false,
            });

        if (uploadError) {
            if (canUseLocalFallback) {
                const localUpload = await persistLocalUpload(bucket, objectPath, buffer);
                return NextResponse.json({
                    ...localUpload,
                    supabaseUrl: config?.url || null,
                });
            }
            return jsonError(
                "Upload failed. Ensure the Supabase Storage bucket exists and server env vars are set.",
                500
            );
        }

        // Prefer public URL if bucket is public; otherwise return a stable path the client can use
        // with a signed URL mechanism later (not implemented here).
        const { data: publicUrlData } = service.client.storage
            .from(bucket)
            .getPublicUrl(objectPath);
        const publicUrl = publicUrlData?.publicUrl || null;

        let signedUrl: string | null = null;
        if (wantsSignedUrl || !publicUrl) {
            const { data, error } = await service.client.storage
                .from(bucket)
                .createSignedUrl(objectPath, DEFAULT_SIGNED_URL_TTL_SECONDS);
            if (error) {
                return jsonError(
                    "Upload succeeded, but signed URL could not be created. Ensure bucket policies allow read access via signed URLs.",
                    500,
                    error.message
                );
            }
            signedUrl = data?.signedUrl || null;
        }

        return NextResponse.json({
            bucket,
            path: objectPath,
            url: publicUrl,
            signedUrl,
            expiresInSeconds: signedUrl ? DEFAULT_SIGNED_URL_TTL_SECONDS : null,
            access: wantsSignedUrl ? "private" : "public",
            supabaseUrl: config?.url || null,
        });
    } catch (error) {
        // Reported, not returned: the caller gets a generic message while the detail
        // goes to Sentry. Echoing String(error) leaked storage paths and driver text.
        Sentry.captureException(error, {
            tags: { layer: "api", route: "upload" },
            extra: { userId: auth.user.id },
        });
        return jsonError("Upload failed.", 500);
    }
}
