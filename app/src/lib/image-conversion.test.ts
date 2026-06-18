import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { convertImageToJpegOrPng } from "./image-conversion";

async function makeImage(width: number, height: number, withAlpha = false) {
    return sharp({
        create: {
            width,
            height,
            channels: withAlpha ? 4 : 3,
            background: withAlpha ? { r: 0, g: 0, b: 0, alpha: 0 } : { r: 10, g: 20, b: 30 },
        },
    })
        .png()
        .toBuffer();
}

function ratio(meta: sharp.Metadata) {
    return (meta.width ?? 0) / (meta.height ?? 1);
}

describe("convertImageToJpegOrPng", () => {
    it("center-crops a very wide image to 5:4", async () => {
        const input = await makeImage(1000, 400);
        const out = await convertImageToJpegOrPng(
            input,
            { contentType: "image/png", extension: "png" },
            { cropAspect: { width: 5, height: 4 } }
        );
        const meta = await sharp(out.buffer).metadata();
        expect(out.contentType).toBe("image/jpeg");
        expect(Math.abs(ratio(meta) - 1.25)).toBeLessThan(0.02);
    });

    it("center-crops a tall image to 5:4", async () => {
        const input = await makeImage(400, 1000);
        const out = await convertImageToJpegOrPng(
            input,
            { contentType: "image/png", extension: "png" },
            { cropAspect: { width: 5, height: 4 } }
        );
        const meta = await sharp(out.buffer).metadata();
        expect(Math.abs(ratio(meta) - 1.25)).toBeLessThan(0.02);
    });

    it("preserves transparency by emitting PNG when cropping", async () => {
        const input = await makeImage(1000, 400, true);
        const out = await convertImageToJpegOrPng(
            input,
            { contentType: "image/png", extension: "png" },
            { cropAspect: { width: 5, height: 4 } }
        );
        const meta = await sharp(out.buffer).metadata();
        expect(out.contentType).toBe("image/png");
        expect(Math.abs(ratio(meta) - 1.25)).toBeLessThan(0.02);
    });

    it("does not crop when no aspect is requested", async () => {
        const input = await makeImage(800, 600);
        const out = await convertImageToJpegOrPng(input, {
            contentType: "image/png",
            extension: "png",
        });
        const meta = await sharp(out.buffer).metadata();
        expect(Math.abs(ratio(meta) - 800 / 600)).toBeLessThan(0.02);
    });
});
