export type PixelCrop = { x: number; y: number; width: number; height: number };

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.addEventListener("load", () => resolve(image));
        image.addEventListener("error", (event) => reject(event));
        image.src = src;
    });
}

/**
 * Draws the given pixel crop region of an image to a canvas and returns it as a
 * File. `crop` coordinates are in the source image's natural pixels (which is
 * exactly what react-easy-crop's `croppedAreaPixels` provides).
 */
export async function getCroppedFile(
    imageSrc: string,
    crop: PixelCrop,
    fileName: string,
    mimeType: "image/jpeg" | "image/png" = "image/jpeg"
): Promise<File> {
    const image = await loadImage(imageSrc);

    const width = Math.max(1, Math.round(crop.width));
    const height = Math.max(1, Math.round(crop.height));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        throw new Error("Could not get canvas context for cropping.");
    }

    ctx.drawImage(
        image,
        Math.round(crop.x),
        Math.round(crop.y),
        width,
        height,
        0,
        0,
        width,
        height
    );

    const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((result) => resolve(result), mimeType, 0.92);
    });
    if (!blob) {
        throw new Error("Could not export cropped image.");
    }

    const ext = mimeType === "image/png" ? "png" : "jpg";
    const baseName = fileName.replace(/\.[^.]+$/, "") || "image";
    return new File([blob], `${baseName}.${ext}`, { type: mimeType });
}
