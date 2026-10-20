import Image from "next/image";

/** `sizes` of the photo shown inside the gallery lightboxes. */
export const LIGHTBOX_IMAGE_SIZES = "(max-width: 640px) 92vw, (max-width: 1024px) 88vw, 1100px";

/**
 * Starts downloading the lightbox photos next to the one on screen, so Next/Previous are instant.
 *
 * `sizes` must equal the visible lightbox image's, so the browser requests the very same
 * optimizer URL and the real image paints from cache. `display: none` images still load when
 * they are not `loading="lazy"`. Only render this while a lightbox is open: preloading on hover
 * fetched a large image for every thumbnail the pointer crossed while scrolling.
 */
export function PreloadImages({ srcs, sizes }: { srcs: readonly string[]; sizes: string }) {
    // A gallery can list the same photo twice, and the URL is the React key.
    const unique = [...new Set(srcs)];
    if (unique.length === 0) return null;

    return (
        <div aria-hidden="true" className="hidden">
            {unique.map((src) => (
                <Image
                    key={src}
                    src={src}
                    alt=""
                    width={1100}
                    height={733}
                    sizes={sizes}
                    loading="eager"
                    fetchPriority="low"
                />
            ))}
        </div>
    );
}
