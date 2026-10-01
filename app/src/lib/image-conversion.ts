import sharp from "sharp";

// Every uploaded image is normalised to WebP: it is smaller than JPEG/PNG at the same
// quality, keeps transparency (so logos need no separate PNG path), and every current browser
// renders it. HEIC/HEIF (the default iPhone photo format) and other "exotic" formats either
// cannot be rendered by browsers or are rejected by storage buckets that restrict MIME types.
//
// WebP uploads are re-encoded too rather than passed through. That validates the bytes really
// are an image, and sharp drops EXIF on output, so GPS coordinates in phone photos are not
// published with the file.

const HEIC_EXTENSIONS = new Set(["heic", "heics", "heif", "heifs", "hif"]);
const HEIC_CONTENT_TYPES = new Set([
    "image/heic",
    "image/heic-sequence",
    "image/heif",
    "image/heif-sequence",
]);

/** Nothing on the site renders wider than this; phone photos are often 4000px+. */
const MAX_DIMENSION = 2560;
const WEBP_QUALITY = 80;

export type NormalizedImage = {
    buffer: Buffer;
    extension: "webp";
    contentType: "image/webp";
};

export function isHeicLike(contentType: string, extension: string) {
    return HEIC_CONTENT_TYPES.has(contentType) || HEIC_EXTENSIONS.has(extension);
}

export type CropAspect = { width: number; height: number };

/**
 * Center-crop an image buffer to the given aspect ratio at maximum resolution
 * (no upscaling/resampling — just an extract of the largest matching rectangle).
 */
async function cropToAspect(buffer: Buffer, aspect: CropAspect): Promise<Buffer> {
    const meta = await sharp(buffer).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (!width || !height) {
        return buffer;
    }

    const target = aspect.width / aspect.height;
    const current = width / height;

    let cropW = width;
    let cropH = height;
    if (current > target) {
        // Too wide — trim the sides.
        cropW = Math.round(height * target);
    } else if (current < target) {
        // Too tall — trim top/bottom.
        cropH = Math.round(width / target);
    } else {
        return buffer;
    }

    const left = Math.max(0, Math.floor((width - cropW) / 2));
    const top = Math.max(0, Math.floor((height - cropH) / 2));
    cropW = Math.min(cropW, width - left);
    cropH = Math.min(cropH, height - top);

    return sharp(buffer).extract({ left, top, width: cropW, height: cropH }).toBuffer();
}

async function decodeHeicToJpeg(buffer: Buffer): Promise<Buffer> {
    // sharp's prebuilt binaries can encode JPEG/PNG/WebP but cannot decode HEIC/HEVC
    // (the HEVC decoder is omitted for licensing reasons), so decode with the
    // pure-JS heic-convert first, then hand the JPEG bytes to sharp.
    const heicConvert = (await import("heic-convert")).default;
    const decoded = await heicConvert({ buffer, format: "JPEG", quality: 0.92 });
    return Buffer.from(decoded);
}

/**
 * Convert any supported image buffer to WebP.
 *
 * - HEIC/HEIF is decoded to JPEG first (sharp cannot decode it directly).
 * - Alpha is preserved natively by WebP.
 * - EXIF orientation is applied via `.rotate()` so phone photos are upright.
 * - When `cropAspect` is provided, the image is center-cropped to that aspect
 *   ratio (e.g. 5:4) before encoding.
 * - Images larger than MAX_DIMENSION on either side are scaled down (never up).
 *
 * Throws if the source cannot be decoded; callers decide how to handle that.
 */
export async function convertImageToWebp(
    input: Buffer,
    source: { contentType: string; extension: string },
    options?: { cropAspect?: CropAspect }
): Promise<NormalizedImage> {
    const decoded = isHeicLike(source.contentType, source.extension)
        ? await decodeHeicToJpeg(input)
        : input;

    let upright: Buffer | null = null;
    if (options?.cropAspect) {
        // Bake EXIF rotation first so the crop math uses upright dimensions,
        // then center-crop to the requested aspect ratio.
        const rotated = await sharp(decoded).rotate().toBuffer();
        upright = await cropToAspect(rotated, options.cropAspect);
    }

    const pipeline = upright ? sharp(upright) : sharp(decoded).rotate();

    const buffer = await pipeline
        .resize({
            width: MAX_DIMENSION,
            height: MAX_DIMENSION,
            fit: "inside",
            withoutEnlargement: true,
        })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer();

    return { buffer, extension: "webp", contentType: "image/webp" };
}
