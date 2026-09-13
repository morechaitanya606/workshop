"use client";

import Image from "next/image";
import Link from "next/link";

export type PastEventImage = {
    src: string;
    workshopId: string;
    title: string;
};

/**
 * Auto-scrolling strip of past-event images shown at the top of the
 * "Past Event Highlight" section on the homepage.
 *
 * - When motion is allowed the track is duplicated and animated with a pure-CSS
 *   marquee (see `.past-events-marquee-track` in globals.css). The duplicate copy
 *   is hidden from assistive tech and removed from the tab order.
 * - When the user prefers reduced motion the images render as a static wrapped
 *   row with no duplication or animation.
 */
export default function PastEventsMarquee({
    images,
    shouldReduceMotion,
}: {
    images: PastEventImage[];
    shouldReduceMotion: boolean;
}) {
    if (images.length === 0) {
        return null;
    }

    // Duplicate the list so the CSS translateX(-50%) loop is seamless. Skip the
    // duplication entirely when animation is disabled.
    const track = shouldReduceMotion ? images : [...images, ...images];

    return (
        <div className="mb-6 overflow-hidden rounded-3xl border border-clay/30 bg-cream-100/60 py-4">
            <div className="flex w-full">
                <div
                    className={
                        shouldReduceMotion
                            ? "flex w-full flex-wrap justify-center gap-4 px-4"
                            : "past-events-marquee-track flex min-w-max gap-4 whitespace-nowrap pr-4"
                    }
                >
                    {track.map((image, index) => {
                        const isDuplicate = !shouldReduceMotion && index >= images.length;
                        return (
                            <Link
                                key={`${image.workshopId}-${index}`}
                                href={`/workshop/${image.workshopId}`}
                                aria-hidden={isDuplicate || undefined}
                                tabIndex={isDuplicate ? -1 : undefined}
                                className="group relative h-28 w-44 shrink-0 overflow-hidden rounded-2xl border border-clay/30 shadow-sm sm:h-32 sm:w-52"
                            >
                                <Image
                                    src={image.src}
                                    alt={image.title}
                                    fill
                                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                                    sizes="(max-width: 640px) 176px, 208px"
                                    quality={70}
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/0 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                                <span className="absolute inset-x-2 bottom-2 truncate text-xs font-inter font-semibold text-white opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                                    {image.title}
                                </span>
                            </Link>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
