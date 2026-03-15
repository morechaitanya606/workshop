import { describe, expect, it } from "vitest";
import {
    normalizeWorkshopVideoUrlInput,
    normalizeWorkshopImageUrlInput,
    isDirectVideoFileUrl,
} from "./workshop-media";

describe("normalizeWorkshopVideoUrlInput", () => {
    it("returns empty string for empty or whitespace input", () => {
        expect(normalizeWorkshopVideoUrlInput("")).toBe("");
        expect(normalizeWorkshopVideoUrlInput("   ")).toBe("");
    });

    it("normalizes Google Drive URLs to preview format", () => {
        const testCases = [
            "https://drive.google.com/file/d/1abc-123_XYZ/view",
            "https://drive.google.com/file/d/1abc-123_XYZ/view?usp=sharing",
            "https://docs.google.com/file/d/1abc-123_XYZ/preview",
            "https://drive.google.com/open?id=1abc-123_XYZ",
            "https://drive.google.com/uc?id=1abc-123_XYZ",
            "https://drive.google.com/d/1abc-123_XYZ/view",
        ];

        testCases.forEach((url) => {
            expect(normalizeWorkshopVideoUrlInput(url)).toBe(
                "https://drive.google.com/file/d/1abc-123_XYZ/preview"
            );
        });
    });

    it("normalizes YouTube URLs to embed format", () => {
        const testCases = [
            {
                input: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                expected: "https://www.youtube.com/embed/dQw4w9WgXcQ",
            },
            {
                input: "https://youtube.com/watch?v=dQw4w9WgXcQ&t=10s",
                expected: "https://www.youtube.com/embed/dQw4w9WgXcQ",
            },
            {
                input: "https://youtu.be/dQw4w9WgXcQ",
                expected: "https://www.youtube.com/embed/dQw4w9WgXcQ",
            },
            {
                input: "https://www.youtube.com/shorts/dQw4w9WgXcQ",
                expected: "https://www.youtube.com/embed/dQw4w9WgXcQ",
            },
            {
                input: "https://www.youtube.com/embed/dQw4w9WgXcQ",
                expected: "https://www.youtube.com/embed/dQw4w9WgXcQ",
            },
        ];

        testCases.forEach(({ input, expected }) => {
            expect(normalizeWorkshopVideoUrlInput(input)).toBe(expected);
        });
    });

    it("returns trimmed original for other URLs or strings", () => {
        expect(normalizeWorkshopVideoUrlInput("  https://example.com/video.mp4  ")).toBe(
            "https://example.com/video.mp4"
        );
        expect(normalizeWorkshopVideoUrlInput("some-random-string")).toBe("some-random-string");
    });
});

describe("normalizeWorkshopImageUrlInput", () => {
    it("returns empty string for empty or whitespace input", () => {
        expect(normalizeWorkshopImageUrlInput("")).toBe("");
        expect(normalizeWorkshopImageUrlInput("   ")).toBe("");
    });

    it("normalizes Google Drive URLs to direct view format", () => {
        const url = "https://drive.google.com/file/d/1abc-123_XYZ/view";
        expect(normalizeWorkshopImageUrlInput(url)).toBe(
            "https://drive.google.com/uc?export=view&id=1abc-123_XYZ"
        );
    });

    it("returns trimmed original for non-Drive URLs", () => {
        expect(normalizeWorkshopImageUrlInput("  https://example.com/image.png  ")).toBe(
            "https://example.com/image.png"
        );
    });
});

describe("isDirectVideoFileUrl", () => {
    it("returns true for supported video extensions", () => {
        expect(isDirectVideoFileUrl("video.mp4")).toBe(true);
        expect(isDirectVideoFileUrl("video.webm")).toBe(true);
        expect(isDirectVideoFileUrl("video.ogg")).toBe(true);
        expect(isDirectVideoFileUrl("video.mov")).toBe(true);
        expect(isDirectVideoFileUrl("video.m4v")).toBe(true);
    });

    it("is case-insensitive", () => {
        expect(isDirectVideoFileUrl("VIDEO.MP4")).toBe(true);
        expect(isDirectVideoFileUrl("Video.WebM")).toBe(true);
    });

    it("handles URLs with query parameters", () => {
        expect(isDirectVideoFileUrl("https://example.com/v.mp4?token=123")).toBe(true);
    });

    it("returns false for unsupported extensions or invalid input", () => {
        expect(isDirectVideoFileUrl("image.jpg")).toBe(false);
        expect(isDirectVideoFileUrl("video.avi")).toBe(false);
        expect(isDirectVideoFileUrl("")).toBe(false);
        expect(isDirectVideoFileUrl(null)).toBe(false);
        expect(isDirectVideoFileUrl(undefined)).toBe(false);
    });
});
