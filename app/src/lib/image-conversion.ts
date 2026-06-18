import sharp from "sharp";

// HEIC/HEIF (the default iPhone photo format) and a number of other "exotic"
// image formats either cannot be rendered by browsers or are rejected by
// Supabase Storage buckets that restrict MIME types. To guarantee a portable,
// universally displayable result we normalise EVERY uploaded image to a
// standard web raster format: PNG when the source has transparency, otherwise
// JPEG. JPEG/PNG inputs are already acceptable and are passed through untouched.

const HEIC_EXTENSIONS = new Set(["heic", "heics", "heif", "heifs", "hif"]);
const HEIC_CONTENT_TYPES = new Set([
    "image/heic",
    "image/heic-sequence",
    "image/heif",
    "image/heif-sequence",
]);

// Formats that already satisfy the JPEG/PNG requirement and need no conversion.
const STANDARD_CONTENT_TYPES = new Set(["image/jpeg", "image/png"]);
const STANDARD_EXTENSIONS = new Set(["jpg", "jpeg", "png"]);

export type NormalizedImageFormat = {
    extension: "jpg" | "png";
    contentType: "image/jpeg" | "image/png";
};

export type NormalizedImage = NormalizedImageFormat & {
    buffer: Buffer;
};

export function isHeicLike(contentType: string, extension: string) {
    return HEIC_CONTENT_TYPES.has(contentType) || HEIC_EXTENSIONS.has(extension);
}

/**
 * Returns true when the image is already a standard web format (JPEG/PNG) and
 * therefore does not need to be transcoded.
 */
export function isStandardWebImage(contentType: string, extension: string) {
    return STANDARD_CONTENT_TYPES.has(contentType) || STANDARD_EXTENSIONS.has(extension);
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
    // sharp's prebuilt binaries can encode JPEG/PNG but cannot decode HEIC/HEVC
    // (the HEVC decoder is omitted for licensing reasons), so decode with the
    // pure-JS heic-convert first, then hand the JPEG bytes to sharp.
    const heicConvert = (await import("heic-convert")).default;
    const decoded = await heicConvert({ buffer, format: "JPEG", quality: 0.92 });
    return Buffer.from(decoded);
}

/**
 * Convert any supported image buffer to JPEG or PNG.
 *
 * - HEIC/HEIF is decoded to JPEG first (sharp cannot decode it directly).
 * - Images with an alpha channel become PNG so transparency is preserved.
 * - Everything else becomes JPEG.
 * - EXIF orientation is applied via `.rotate()` so phone photos are upright.
 * - When `cropAspect` is provided, the image is center-cropped to that aspect
 *   ratio (e.g. 5:4) before encoding.
 *
 * Throws if the source cannot be decoded; callers decide how to handle that.
 */
export async function convertImageToJpegOrPng(
    input: Buffer,
    source: { contentType: string; extension: string },
    options?: { cropAspect?: CropAspect }
): Promise<NormalizedImage> {
    const decoded = isHeicLike(source.contentType, source.extension)
        ? await decodeHeicToJpeg(input)
        : input;

    let pipeline = sharp(decoded).rotate();

    if (options?.cropAspect) {
        // Bake EXIF rotation first so the crop math uses upright dimensions,
        // then center-crop to the requested aspect ratio.
        const rotated = await pipeline.toBuffer();
        const cropped = await cropToAspect(rotated, options.cropAspect);
        pipeline = sharp(cropped);
    }

    const metadata = await pipeline.metadata();

    if (metadata.hasAlpha) {
        const buffer = await pipeline.png({ compressionLevel: 9 }).toBuffer();
        return { buffer, extension: "png", contentType: "image/png" };
    }

    const buffer = await pipeline.jpeg({ quality: 85, mozjpeg: true }).toBuffer();
    return { buffer, extension: "jpg", contentType: "image/jpeg" };
}
