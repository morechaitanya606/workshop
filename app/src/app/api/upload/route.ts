import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser, jsonError } from "@/lib/api-auth";
import crypto from "crypto";
import { assertRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { requireSupabaseService } from "@/lib/api-helpers";
import { getPublicSupabaseConfig } from "@/lib/env";

const DEFAULT_BUCKET = "uploads";
const DEFAULT_SIGNED_URL_TTL_SECONDS = 60 * 10;

function buildObjectPath(userId: string, ext: string) {
    const uniqueId = crypto.randomBytes(16).toString("hex");
    const safeExt = ext.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10) || "bin";
    return `${userId}/${uniqueId}.${safeExt}`;
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

        const imageTypes = ["image/jpeg", "image/png", "image/webp"];
        const videoTypes = ["video/mp4", "video/webm", "video/quicktime", "video/x-m4v"];
        const isImage = imageTypes.includes(file.type);
        const isVideo = videoTypes.includes(file.type);

        if (!isImage && !isVideo) {
            return jsonError("Invalid file type. Allowed: JPEG, PNG, WebP, MP4, WebM, MOV.", 400);
        }

        const maxBytes = isVideo ? 50 * 1024 * 1024 : 5 * 1024 * 1024;
        if (file.size > maxBytes) {
            return jsonError(
                isVideo ? "Video size exceeds 50MB limit." : "Image size exceeds 5MB limit.",
                400
            );
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        const ext = (file.name.split(".").pop() || "").toLowerCase();
        const objectPath = buildObjectPath(auth.user.id, ext || (isVideo ? "mp4" : "jpg"));
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

        const contentType = file.type || (isVideo ? "video/mp4" : "image/jpeg");
        const { error: uploadError } = await service.client.storage
            .from(bucket)
            .upload(objectPath, buffer, {
                contentType,
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
