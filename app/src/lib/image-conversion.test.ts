import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { convertImageToWebp } from "./image-conversion";

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

describe("convertImageToWebp", () => {
    it("emits WebP", async () => {
        const input = await makeImage(800, 600);
        const out = await convertImageToWebp(input, { contentType: "image/png", extension: "png" });
        const meta = await sharp(out.buffer).metadata();
        expect(out.contentType).toBe("image/webp");
        expect(out.extension).toBe("webp");
        expect(meta.format).toBe("webp");
    });

    it("center-crops a very wide image to 5:4", async () => {
        const input = await makeImage(1000, 400);
        const out = await convertImageToWebp(
            input,
            { contentType: "image/png", extension: "png" },
            { cropAspect: { width: 5, height: 4 } }
        );
        const meta = await sharp(out.buffer).metadata();
        expect(Math.abs(ratio(meta) - 1.25)).toBeLessThan(0.02);
    });

    it("center-crops a tall image to 5:4", async () => {
        const input = await makeImage(400, 1000);
        const out = await convertImageToWebp(
            input,
            { contentType: "image/png", extension: "png" },
            { cropAspect: { width: 5, height: 4 } }
        );
        const meta = await sharp(out.buffer).metadata();
        expect(Math.abs(ratio(meta) - 1.25)).toBeLessThan(0.02);
    });

    it("preserves transparency", async () => {
        const input = await makeImage(1000, 400, true);
        const out = await convertImageToWebp(
            input,
            { contentType: "image/png", extension: "png" },
            { cropAspect: { width: 5, height: 4 } }
        );
        const meta = await sharp(out.buffer).metadata();
        expect(meta.format).toBe("webp");
        expect(meta.hasAlpha).toBe(true);
        expect(Math.abs(ratio(meta) - 1.25)).toBeLessThan(0.02);
    });

    it("does not crop when no aspect is requested", async () => {
        const input = await makeImage(800, 600);
        const out = await convertImageToWebp(input, {
            contentType: "image/png",
            extension: "png",
        });
        const meta = await sharp(out.buffer).metadata();
        expect(Math.abs(ratio(meta) - 800 / 600)).toBeLessThan(0.02);
    });

    it("scales oversized images down but never up", async () => {
        const big = await convertImageToWebp(await makeImage(4000, 3000), {
            contentType: "image/png",
            extension: "png",
        });
        const bigMeta = await sharp(big.buffer).metadata();
        expect(Math.max(bigMeta.width ?? 0, bigMeta.height ?? 0)).toBeLessThanOrEqual(2560);

        const small = await convertImageToWebp(await makeImage(300, 200), {
            contentType: "image/png",
            extension: "png",
        });
        const smallMeta = await sharp(small.buffer).metadata();
        expect(smallMeta.width).toBe(300);
    });

    it("re-encodes WebP input rather than passing it through", async () => {
        // Noise, stored losslessly, so the lossy re-encode is guaranteed to produce new bytes.
        const noise = Buffer.alloc(64 * 64 * 3);
        for (let index = 0; index < noise.length; index += 1) noise[index] = (index * 37) % 251;
        const webpInput = await sharp(noise, { raw: { width: 64, height: 64, channels: 3 } })
            .webp({ lossless: true })
            .toBuffer();
        const out = await convertImageToWebp(webpInput, {
            contentType: "image/webp",
            extension: "webp",
        });
        expect(out.buffer.equals(webpInput)).toBe(false);
        expect((await sharp(out.buffer).metadata()).format).toBe("webp");
    });

    it("rejects bytes that are not an image", async () => {
        await expect(
            convertImageToWebp(Buffer.from("<html>not an image</html>"), {
                contentType: "image/jpeg",
                extension: "jpg",
            })
        ).rejects.toThrow();
    });
});
