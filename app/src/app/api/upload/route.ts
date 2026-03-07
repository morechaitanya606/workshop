import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser, jsonError } from "@/lib/api-auth";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import crypto from "crypto";

export async function POST(request: NextRequest) {
    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    try {
        const formData = await request.formData();
        const file = formData.get("file") as File | null;

        if (!file) {
            return jsonError("No file provided.", 400);
        }

        const imageTypes = ["image/jpeg", "image/png", "image/webp"];
        const videoTypes = ["video/mp4", "video/webm", "video/quicktime", "video/x-m4v"];
        const isImage = imageTypes.includes(file.type);
        const isVideo = videoTypes.includes(file.type);

        if (!isImage && !isVideo) {
            return jsonError(
                "Invalid file type. Allowed: JPEG, PNG, WebP, MP4, WebM, MOV.",
                400
            );
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

        // Ensure public/uploads exists
        const uploadDir = join(process.cwd(), "public", "uploads");
        await mkdir(uploadDir, { recursive: true });

        // Generate a unique filename
        const ext = file.name.split(".").pop() || "jpg";
        const uniqueId = crypto.randomBytes(8).toString("hex");
        const filename = `${uniqueId}.${ext}`;
        const filePath = join(uploadDir, filename);

        await writeFile(filePath, buffer);

        // Return the public URL
        const url = `/uploads/${filename}`;

        return NextResponse.json({ url });
    } catch (error) {
        return jsonError("Upload failed.", 500, String(error));
    }
}
