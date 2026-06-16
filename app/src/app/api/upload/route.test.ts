import fs from "fs";
import os from "os";
import path from "path";
import { NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { requireSupabaseService } from "@/lib/api-helpers";
import { getPublicSupabaseConfig } from "@/lib/env";
import { assertRateLimit } from "@/lib/rate-limit";

vi.mock("@/lib/api-auth", () => ({
    requireAuthenticatedUser: vi.fn(),
    jsonError: vi.fn((message: string, status = 400, details?: unknown) =>
        NextResponse.json(
            {
                error: message,
                details: details ?? null,
            },
            { status }
        )
    ),
}));

vi.mock("@/lib/api-helpers", () => ({
    requireSupabaseService: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
    getPublicSupabaseConfig: vi.fn(() => ({ url: "https://example.supabase.co", key: "anon" })),
}));

vi.mock("@/lib/rate-limit", () => ({
    assertRateLimit: vi.fn(),
    getRateLimitKey: vi.fn(() => "upload-test-key"),
}));

const sharpMocks = vi.hoisted(() => ({
    toBuffer: vi.fn(),
}));

vi.mock("sharp", () => {
    const webp = vi.fn(() => ({ toBuffer: sharpMocks.toBuffer }));
    const rotate = vi.fn(() => ({ webp }));
    const factory = vi.fn(() => ({ rotate }));
    return { default: factory };
});

const heicConvertMock = vi.hoisted(() => ({
    convert: vi.fn(),
}));

vi.mock("heic-convert", () => ({ default: heicConvertMock.convert }));

describe("POST /api/upload", () => {
    let tempDir: string;
    let cwdSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "upload-route-test-"));
        cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tempDir);
        vi.stubEnv("NODE_ENV", "development");

        vi.mocked(requireAuthenticatedUser).mockResolvedValue({
            ok: true,
            user: { id: "user-1" } as any,
            accessToken: "token",
        });
        vi.mocked(assertRateLimit).mockResolvedValue({ ok: true } as any);
        vi.mocked(getPublicSupabaseConfig).mockReturnValue({
            url: "https://example.supabase.co",
            key: "anon",
        });
        sharpMocks.toBuffer.mockResolvedValue(Buffer.from("converted-webp-bytes"));
        heicConvertMock.convert.mockResolvedValue(new Uint8Array([10, 20, 30]));
    });

    afterEach(() => {
        cwdSpy.mockRestore();
        fs.rmSync(tempDir, { recursive: true, force: true });
        vi.unstubAllEnvs();
        vi.clearAllMocks();
    });

    it("falls back to local public storage in development when the uploads bucket is missing", async () => {
        const upload = vi.fn().mockResolvedValue({
            error: { message: "Bucket not found" },
        });
        const serviceClient = {
            storage: {
                from: vi.fn(() => ({
                    upload,
                })),
            },
        };

        vi.mocked(requireSupabaseService).mockReturnValue({
            ok: true,
            client: serviceClient as any,
        });

        const request = {
            formData: vi.fn().mockResolvedValue({
                get(name: string) {
                    if (name === "file") {
                        return {
                            name: "avatar.png",
                            size: 4,
                            type: "image/png",
                            arrayBuffer: vi
                                .fn()
                                .mockResolvedValue(new Uint8Array([1, 2, 3, 4]).buffer),
                        };
                    }

                    return null;
                },
            }),
        } as any;

        const response = await POST(request);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.url).toMatch(/^\/uploads\/uploads\/user-1\/.+\.png$/);
        expect(fs.existsSync(path.join(tempDir, "public", ...String(body.path).split("/")))).toBe(
            true
        );
    });

    it("converts HEIC images to WebP when the browser omits a MIME type", async () => {
        const upload = vi.fn().mockResolvedValue({
            error: { message: "Bucket not found" },
        });
        const serviceClient = {
            storage: {
                from: vi.fn(() => ({
                    upload,
                })),
            },
        };

        vi.mocked(requireSupabaseService).mockReturnValue({
            ok: true,
            client: serviceClient as any,
        });

        const request = {
            formData: vi.fn().mockResolvedValue({
                get(name: string) {
                    if (name === "file") {
                        return {
                            name: "workshop-photo.HEIC",
                            size: 4,
                            type: "",
                            arrayBuffer: vi
                                .fn()
                                .mockResolvedValue(new Uint8Array([1, 2, 3, 4]).buffer),
                        };
                    }

                    return null;
                },
            }),
        } as any;

        const response = await POST(request);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(sharpMocks.toBuffer).toHaveBeenCalled();
        expect(body.url).toMatch(/^\/uploads\/uploads\/user-1\/.+\.webp$/);
        expect(fs.existsSync(path.join(tempDir, "public", ...String(body.path).split("/")))).toBe(
            true
        );
    });

    it("uploads converted HEIF images with the image/webp content type", async () => {
        const upload = vi.fn().mockResolvedValue({ error: null });
        const getPublicUrl = vi.fn(() => ({
            data: { publicUrl: "https://example.supabase.co/storage/v1/object/public/photo.webp" },
        }));
        const serviceClient = {
            storage: {
                from: vi.fn(() => ({
                    upload,
                    getPublicUrl,
                })),
            },
        };

        vi.mocked(requireSupabaseService).mockReturnValue({
            ok: true,
            client: serviceClient as any,
        });

        const request = {
            formData: vi.fn().mockResolvedValue({
                get(name: string) {
                    if (name === "file") {
                        return {
                            name: "workshop-photo.heif",
                            size: 4,
                            type: "image/heif",
                            arrayBuffer: vi
                                .fn()
                                .mockResolvedValue(new Uint8Array([1, 2, 3, 4]).buffer),
                        };
                    }

                    return null;
                },
            }),
        } as any;

        const response = await POST(request);

        expect(response.status).toBe(200);
        expect(upload).toHaveBeenCalledWith(
            expect.stringMatching(/^user-1\/.+\.webp$/),
            expect.any(Buffer),
            expect.objectContaining({ contentType: "image/webp" })
        );
    });

    it("stores the original HEIC file when conversion fails", async () => {
        heicConvertMock.convert.mockRejectedValueOnce(new Error("unsupported HEIC payload"));
        const upload = vi.fn().mockResolvedValue({ error: { message: "Bucket not found" } });
        const serviceClient = {
            storage: {
                from: vi.fn(() => ({
                    upload,
                })),
            },
        };

        vi.mocked(requireSupabaseService).mockReturnValue({
            ok: true,
            client: serviceClient as any,
        });

        const request = {
            formData: vi.fn().mockResolvedValue({
                get(name: string) {
                    if (name === "file") {
                        return {
                            name: "workshop-photo.heic",
                            size: 4,
                            type: "image/heic",
                            arrayBuffer: vi
                                .fn()
                                .mockResolvedValue(new Uint8Array([1, 2, 3, 4]).buffer),
                        };
                    }

                    return null;
                },
            }),
        } as any;

        const response = await POST(request);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.url).toMatch(/^\/uploads\/uploads\/user-1\/.+\.heic$/);
    });

    it("rejects unsupported upload file types before storage writes", async () => {
        const serviceClient = {
            storage: {
                from: vi.fn(),
            },
        };

        vi.mocked(requireSupabaseService).mockReturnValue({
            ok: true,
            client: serviceClient as any,
        });

        const request = {
            formData: vi.fn().mockResolvedValue({
                get(name: string) {
                    if (name === "file") {
                        return {
                            name: "notes.txt",
                            size: 4,
                            type: "text/plain",
                            arrayBuffer: vi.fn(),
                        };
                    }

                    return null;
                },
            }),
        } as any;

        const response = await POST(request);
        const body = await response.json();

        expect(response.status).toBe(400);
        expect(body.error).toBe(
            "Invalid file type. Allowed: image files (JPEG, PNG, WebP, GIF, AVIF, HEIC/HEIF, BMP, TIFF, SVG, ICO, JP2, JXL, RAW) and videos (MP4, WebM, MOV, M4V)."
        );
        expect(serviceClient.storage.from).not.toHaveBeenCalled();
    });
});
