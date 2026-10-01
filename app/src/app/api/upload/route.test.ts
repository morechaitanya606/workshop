import fs from "fs";
import os from "os";
import path from "path";
import { NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { getUserRole, requireAuthenticatedUser } from "@/lib/api-auth";
import { requireSupabaseService } from "@/lib/api-helpers";
import { getPublicSupabaseConfig } from "@/lib/env";
import { assertQuota, assertRateLimit } from "@/lib/rate-limit";

vi.mock("@/lib/api-auth", () => ({
    requireAuthenticatedUser: vi.fn(),
    getUserRole: vi.fn(),
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
    assertQuota: vi.fn(),
    getRateLimitKey: vi.fn(() => "upload-test-key"),
}));

const sharpMocks = vi.hoisted(() => ({
    toBuffer: vi.fn(),
}));

vi.mock("sharp", () => {
    const output = { toBuffer: sharpMocks.toBuffer };
    const webp = vi.fn(() => output);
    const resize = vi.fn(() => ({ webp }));
    const rotate = vi.fn(() => ({ resize }));
    const factory = vi.fn(() => ({ rotate, resize }));
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
        vi.mocked(assertQuota).mockResolvedValue({ ok: true } as any);
        vi.mocked(getUserRole).mockResolvedValue("user");
        vi.mocked(getPublicSupabaseConfig).mockReturnValue({
            url: "https://example.supabase.co",
            key: "anon",
        });
        sharpMocks.toBuffer.mockResolvedValue(Buffer.from("converted-image-bytes"));
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
        expect(body.url).toMatch(/^\/uploads\/uploads\/user-1\/.+\.webp$/);
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
            data: { publicUrl: "https://example.supabase.co/storage/v1/object/public/photo.jpg" },
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

    it("rejects the upload when conversion fails instead of storing the original", async () => {
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

        // Persisting bytes sharp could not decode meant an unverified payload was stored
        // under a caller-influenced content type. Unprocessable input is now refused.
        expect(response.status).toBe(400);
        expect(body.error).toMatch(/could not be processed/i);
        expect(upload).not.toHaveBeenCalled();
    });

    it("re-encodes images that are already WebP", async () => {
        const upload = vi.fn().mockResolvedValue({ error: { message: "Bucket not found" } });
        const serviceClient = {
            storage: { from: vi.fn(() => ({ upload })) },
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
                            name: "photo.webp",
                            size: 4,
                            type: "image/webp",
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
    });

    it("converts images with transparency to WebP", async () => {
        const upload = vi.fn().mockResolvedValue({ error: { message: "Bucket not found" } });
        const serviceClient = {
            storage: { from: vi.fn(() => ({ upload })) },
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
                            name: "logo.gif",
                            size: 4,
                            type: "image/gif",
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
        expect(body.url).toMatch(/^\/uploads\/uploads\/user-1\/.+\.webp$/);
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
            "Invalid file type. Allowed: image files (JPEG, PNG, WebP, GIF, AVIF, HEIC/HEIF, BMP, TIFF, ICO, JP2, JXL, RAW) and videos (MP4, WebM, MOV, M4V)."
        );
        expect(serviceClient.storage.from).not.toHaveBeenCalled();
    });

    describe("videos and quota", () => {
        const MP4_BYTES = new Uint8Array([
            0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0,
        ]);
        const WEBM_BYTES = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 1, 0]);

        function createVideoRequest(name: string, type: string, bytes: Uint8Array) {
            return {
                formData: vi.fn().mockResolvedValue({
                    get(field: string) {
                        if (field === "file") {
                            return {
                                name,
                                size: bytes.byteLength,
                                type,
                                arrayBuffer: vi.fn().mockResolvedValue(bytes.buffer),
                            };
                        }
                        return null;
                    },
                }),
            } as any;
        }

        function mockStorage() {
            const upload = vi.fn().mockResolvedValue({ error: null });
            const getPublicUrl = vi.fn(() => ({
                data: { publicUrl: "https://example.supabase.co/storage/v1/object/public/v" },
            }));
            vi.mocked(requireSupabaseService).mockReturnValue({
                ok: true,
                client: { storage: { from: vi.fn(() => ({ upload, getPublicUrl })) } } as any,
            });
            return upload;
        }

        it("stores a genuine MP4 as-is", async () => {
            const upload = mockStorage();

            const response = await POST(createVideoRequest("clip.mp4", "video/mp4", MP4_BYTES));

            expect(response.status).toBe(200);
            expect(upload).toHaveBeenCalledWith(
                expect.stringMatching(/^user-1\/.+\.mp4$/),
                expect.any(Buffer),
                expect.objectContaining({ contentType: "video/mp4" })
            );
        });

        it("stores a genuine WebM", async () => {
            const upload = mockStorage();

            const response = await POST(createVideoRequest("clip.webm", "video/webm", WEBM_BYTES));

            expect(response.status).toBe(200);
            expect(upload).toHaveBeenCalled();
        });

        it("rejects a non-video payload renamed to .mp4", async () => {
            const upload = mockStorage();
            const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");

            const response = await POST(createVideoRequest("clip.mp4", "video/mp4", html));
            const body = await response.json();

            expect(response.status).toBe(400);
            expect(body.error).toMatch(/could not be verified/i);
            expect(upload).not.toHaveBeenCalled();
            expect(assertQuota).not.toHaveBeenCalled();
        });

        it("rejects an MP4 that claims to be WebM", async () => {
            const upload = mockStorage();

            const response = await POST(createVideoRequest("clip.webm", "video/webm", MP4_BYTES));

            expect(response.status).toBe(400);
            expect(upload).not.toHaveBeenCalled();
        });

        it("never echoes a caller-chosen extension into the storage path", async () => {
            const upload = mockStorage();

            const response = await POST(createVideoRequest("clip.php", "video/mp4", MP4_BYTES));

            expect(response.status).toBe(200);
            expect(upload).toHaveBeenCalledWith(
                expect.stringMatching(/^user-1\/.+\.mp4$/),
                expect.any(Buffer),
                expect.anything()
            );
        });

        it("returns 429 once the daily byte quota is spent", async () => {
            const upload = mockStorage();
            vi.mocked(assertQuota).mockResolvedValue({
                ok: false,
                response: NextResponse.json({ error: "Daily upload limit" }, { status: 429 }),
            } as any);

            const response = await POST(createVideoRequest("clip.mp4", "video/mp4", MP4_BYTES));

            expect(response.status).toBe(429);
            expect(upload).not.toHaveBeenCalled();
            expect(assertQuota).toHaveBeenCalledWith(
                expect.objectContaining({
                    amount: MP4_BYTES.byteLength,
                    limit: 200 * 1024 * 1024,
                    windowMs: 24 * 60 * 60_000,
                })
            );
        });

        it("waives an exceeded quota for admins only", async () => {
            const upload = mockStorage();
            vi.mocked(assertQuota).mockResolvedValue({
                ok: false,
                response: NextResponse.json({ error: "Daily upload limit" }, { status: 429 }),
            } as any);
            vi.mocked(getUserRole).mockResolvedValue("admin");

            const response = await POST(createVideoRequest("clip.mp4", "video/mp4", MP4_BYTES));

            expect(response.status).toBe(200);
            expect(upload).toHaveBeenCalled();
        });

        it("does not waive a quota store outage (503) even for admins", async () => {
            const upload = mockStorage();
            vi.mocked(assertQuota).mockResolvedValue({
                ok: false,
                response: NextResponse.json({ error: "unavailable" }, { status: 503 }),
            } as any);
            vi.mocked(getUserRole).mockResolvedValue("admin");

            const response = await POST(createVideoRequest("clip.mp4", "video/mp4", MP4_BYTES));

            expect(response.status).toBe(503);
            expect(upload).not.toHaveBeenCalled();
        });
    });
});
