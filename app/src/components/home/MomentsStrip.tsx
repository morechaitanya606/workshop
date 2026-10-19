"use client";

import Image from "next/image";
import Link from "next/link";

/** One photo in the rows, and the page it opens. */
export type MomentPhoto = {
    id: string;
    src: string;
    alt: string;
    href: string;
};

/** Below this the rows look sparse; callers fall back to something else. */
export const MIN_MOMENTS_PHOTOS = 4;
/** One half of the looping track must be wider than the widest screen, or the loop shows a gap. */
const MIN_TILES_PER_HALF = 14;

/**
 * Tile widths are fixed, so `sizes` is exact: the optimizer is asked for the next width up from
 * the tile at the visitor's pixel ratio (e.g. 208px at 2x -> the 640 variant), never the full
 * viewport. Heights are fixed per breakpoint (h-52 / h-64), which is what makes the strip a
 * mosaic: portrait and landscape tiles alternate.
 */
const TILE_SHAPES = [
    { className: "w-40 sm:w-52", sizes: "(max-width: 640px) 160px, 208px" },
    { className: "w-60 sm:w-80", sizes: "(max-width: 640px) 240px, 320px" },
    { className: "w-44 sm:w-56", sizes: "(max-width: 640px) 176px, 224px" },
] as const;

function Tile({
    photo,
    shapeIndex,
    decorative,
}: {
    photo: MomentPhoto;
    shapeIndex: number;
    decorative: boolean;
}) {
    const shape = TILE_SHAPES[shapeIndex % TILE_SHAPES.length];

    return (
        <Link
            href={photo.href}
            // The looping copy repeats the same photos: keep it out of the tab order and the
            // accessibility tree, the first copy already links there.
            tabIndex={decorative ? -1 : undefined}
            aria-label={decorative ? undefined : `View ${photo.alt}`}
            title={photo.alt}
            className={`group relative block h-52 shrink-0 overflow-hidden rounded-2xl bg-cream-100 shadow-sm sm:h-64 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta ${shape.className}`}
        >
            <Image
                src={photo.src}
                alt={decorative ? "" : photo.alt}
                fill
                sizes={shape.sizes}
                quality={70}
                loading="lazy"
                className="object-cover transition-transform duration-500 ease-out group-hover:scale-105"
            />
            <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2.5 pt-8 text-left text-xs font-inter font-semibold text-white opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                {photo.alt}
            </span>
        </Link>
    );
}

function Row({
    photos,
    reverse,
    shouldReduceMotion,
    className = "",
}: {
    photos: MomentPhoto[];
    reverse?: boolean;
    shouldReduceMotion: boolean;
    className?: string;
}) {
    const repeat = Math.max(1, Math.ceil(MIN_TILES_PER_HALF / photos.length));
    const half = Array.from({ length: repeat }, () => photos).flat();

    if (shouldReduceMotion) {
        // No animation: a plain swipeable row, one copy of each photo.
        return (
            <div className={`flex snap-x gap-3 overflow-x-auto pb-1 scrollbar-hide ${className}`}>
                {photos.map((photo, index) => (
                    <div key={photo.id} className="snap-start">
                        <Tile photo={photo} shapeIndex={index} decorative={false} />
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div
            className={`overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)] ${className}`}
        >
            {/* The track pauses while the pointer is over it (globals.css), so a photo can be
                clicked without chasing it. */}
            <div
                className={`moments-marquee-track flex min-w-max gap-3 pr-3 ${
                    reverse ? "moments-marquee-track-reverse" : ""
                }`}
            >
                {[0, 1].map((copy) =>
                    half.map((photo, index) => (
                        <div
                            key={`${copy}-${index}`}
                            aria-hidden={copy === 1 || undefined}
                            data-copy={copy}
                        >
                            <Tile
                                photo={photo}
                                shapeIndex={index}
                                // Only the first pass of the first copy is announced/tabbable.
                                decorative={copy === 1 || index >= photos.length}
                            />
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

/**
 * Slow-moving rows of past-event photos at the top of the homepage's Past Event Highlight. Each
 * photo opens its event. Every image is lazy, so nothing here competes with the LCP image. Phones
 * get a single row (the second row is `display: none`, and a hidden lazy image never loads),
 * desktops two rows moving in opposite directions. Reduced motion gets a static, swipeable row.
 */
export default function MomentsRows({
    photos,
    shouldReduceMotion,
    className = "",
}: {
    photos: MomentPhoto[];
    shouldReduceMotion: boolean;
    className?: string;
}) {
    if (photos.length < MIN_MOMENTS_PHOTOS) {
        return null;
    }

    // The second row starts from the middle of the set so both rows never show the same photo
    // side by side.
    const shift = Math.floor(photos.length / 2);
    const secondRowPhotos = [...photos.slice(shift), ...photos.slice(0, shift)];

    return (
        <div className={`space-y-3 ${className}`}>
            <Row photos={photos} shouldReduceMotion={shouldReduceMotion} />
            {!shouldReduceMotion && (
                <Row
                    photos={secondRowPhotos}
                    reverse
                    shouldReduceMotion={shouldReduceMotion}
                    className="hidden sm:block"
                />
            )}
        </div>
    );
}
