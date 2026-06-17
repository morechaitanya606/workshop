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
 *
 * Throws if the source cannot be decoded; callers decide how to handle that.
 */
export async function convertImageToJpegOrPng(
    input: Buffer,
    source: { contentType: string; extension: string }
): Promise<NormalizedImage> {
    const decoded = isHeicLike(source.contentType, source.extension)
        ? await decodeHeicToJpeg(input)
        : input;

    const pipeline = sharp(decoded).rotate();
    const metadata = await pipeline.metadata();

    if (metadata.hasAlpha) {
        const buffer = await pipeline.png({ compressionLevel: 9 }).toBuffer();
        return { buffer, extension: "png", contentType: "image/png" };
    }

    const buffer = await pipeline.jpeg({ quality: 85, mozjpeg: true }).toBuffer();
    return { buffer, extension: "jpg", contentType: "image/jpeg" };
}
