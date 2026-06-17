import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser, jsonError } from "@/lib/api-auth";
import crypto from "crypto";
import { assertRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { requireSupabaseService } from "@/lib/api-helpers";
import { getPublicSupabaseConfig } from "@/lib/env";
import { convertImageToJpegOrPng, isStandardWebImage } from "@/lib/image-conversion";

const DEFAULT_BUCKET = "uploads";
const DEFAULT_SIGNED_URL_TTL_SECONDS = 60 * 10;
const UPLOAD_TYPE_ERROR_MESSAGE =
    "Invalid file type. Allowed: image files (JPEG, PNG, WebP, GIF, AVIF, HEIC/HEIF, BMP, TIFF, SVG, ICO, JP2, JXL, RAW) and videos (MP4, WebM, MOV, M4V).";
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
    svg: "image/svg+xml",
    svgz: "image/svg+xml",
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

function isImageContentType(contentType: string) {
    return contentType.startsWith("image/");
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
        return {
            kind: "video" as const,
            extension: extension || "mp4",
            contentType: VIDEO_TYPES.has(contentType)
                ? contentType
                : VIDEO_CONTENT_TYPE_BY_EXTENSION[extension] || "video/mp4",
        };
    }

    return null;
}

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
    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    const rateLimitResult = await assertRateLimit({
        key: getRateLimitKey(request, "upload", auth.user.id),
        limit: 30,
        windowMs: 5 * 60_000,
        message: "Upload rate limit exceeded. Please try again in a few minutes.",
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

        if (!file) {
            return jsonError("No file provided.", 400);
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

        // Normalise every image to a standard web format (JPEG, or PNG when the
        // source has transparency). JPEG/PNG inputs are already acceptable and
        // are left untouched. This guarantees the stored file renders in all
        // browsers and is accepted by Supabase Storage buckets that restrict
        // MIME types. If decoding fails (e.g. an unsupported/corrupt file), fall
        // back to storing the original bytes rather than failing the upload.
        if (
            fileInfo.kind === "image" &&
            !isStandardWebImage(fileInfo.contentType, fileInfo.extension)
        ) {
            try {
                const normalized = await convertImageToJpegOrPng(buffer, {
                    contentType: fileInfo.contentType,
                    extension: fileInfo.extension,
                });
                buffer = normalized.buffer;
                uploadExtension = normalized.extension;
                uploadContentType = normalized.contentType;
            } catch (conversionError) {
                console.error("Image conversion to JPEG/PNG failed; storing original.", {
                    name: file.name,
                    error:
                        conversionError instanceof Error
                            ? conversionError.message
                            : conversionError,
                });
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
                500,
                uploadError.message
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
        return jsonError("Upload failed.", 500, String(error));
    }
}
