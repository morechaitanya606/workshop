"use client";

import { useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { CommunityPhoto } from "@/lib/community-photos";
import { Dialog } from "@/components/ui/dialog";
import { LIGHTBOX_IMAGE_SIZES, PreloadImages } from "@/components/ui/LightboxPreload";
import {
    fadeIn,
    quickTransition,
    revealViewport,
    staggerContainer,
    useMotionProps,
} from "@/lib/motion-presets";
import { SectionHeader } from "@/components/home/HomeSectionShared";

/**
 * Fixed tile shapes for the masonry columns. With `h-auto` each photo took its own height once it
 * loaded, so the columns re-balanced and photos jumped while the visitor scrolled past.
 */
const TILE_ASPECTS = ["aspect-[4/5]", "aspect-[8/7]", "aspect-square"] as const;

/** Visible from the first paint; only settles to full size once in view. */
const tileRevealVariants = {
    hidden: { scale: 0.97 },
    visible: { scale: 1 },
};

export default function CommunityGallerySection({
    shouldReduceMotion,
    sectionClassName,
    photos,
}: {
    shouldReduceMotion: boolean;
    sectionClassName?: string;
    photos?: CommunityPhoto[];
}) {
    const [activeGalleryIndex, setActiveGalleryIndex] = useState<number | null>(null);
    const galleryMotionProps = useMotionProps(shouldReduceMotion, fadeIn, quickTransition);
    const visiblePhotos = photos && photos.length > 0 ? photos.slice(0, 12) : [];

    if (visiblePhotos.length === 0) {
        return null;
    }

    // While the lightbox is open, warm its neighbours so Next/Previous are instant.
    const count = visiblePhotos.length;
    const preloadIndexes = new Set<number>();
    if (activeGalleryIndex !== null) {
        preloadIndexes.add((activeGalleryIndex + 1) % count);
        preloadIndexes.add((activeGalleryIndex - 1 + count) % count);
        preloadIndexes.delete(activeGalleryIndex);
    }
    const preloadSrcs = [...preloadIndexes].map((index) => visiblePhotos[index].imageUrl);

    return (
        <>
            <section className={sectionClassName || "section-padding mt-24 sm:mt-20"}>
                <SectionHeader
                    title="From Our Community"
                    eyebrow="Community"
                    action="View All Past Events"
                    href="/past-events"
                    reduceMotion={shouldReduceMotion}
                />
                <motion.div
                    {...galleryMotionProps}
                    variants={staggerContainer}
                    initial={"hidden"}
                    whileInView={"visible"}
                    viewport={revealViewport}
                    className="columns-2 sm:columns-3 lg:columns-4 gap-3 sm:gap-4"
                >
                    {visiblePhotos.map((photo, index) => (
                        <motion.button
                            key={photo.id}
                            type="button"
                            onClick={() => setActiveGalleryIndex(index)}
                            aria-label={`Open community photo ${index + 1}`}
                            variants={tileRevealVariants}
                            transition={shouldReduceMotion ? { duration: 0 } : quickTransition}
                            className={`relative block w-full ${TILE_ASPECTS[index % TILE_ASPECTS.length]} mb-3 sm:mb-4 rounded-xl overflow-hidden bg-cream-100 group break-inside-avoid cursor-zoom-in hover-lift ${
                                index >= 8 ? "hidden sm:block" : ""
                            }`}
                        >
                            <Image
                                src={photo.imageUrl}
                                alt={photo.altText || `Community workshop ${index + 1}`}
                                fill
                                className="object-cover image-hover-zoom"
                                sizes="(max-width: 640px) 48vw, (max-width: 1024px) 31vw, (max-width: 1440px) 23vw, 320px"
                                loading="lazy"
                                quality={70}
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-black/0 to-black/10 opacity-70 group-hover:opacity-100 transition-opacity duration-500 flex items-center justify-center">
                                <span className="text-white font-inter font-semibold text-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                    View photo
                                </span>
                            </div>
                        </motion.button>
                    ))}
                </motion.div>
            </section>

            {activeGalleryIndex !== null && (
                <PreloadImages srcs={preloadSrcs} sizes={LIGHTBOX_IMAGE_SIZES} />
            )}

            <Dialog
                open={activeGalleryIndex !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setActiveGalleryIndex(null);
                    }
                }}
                title="Community Photo"
                description={
                    activeGalleryIndex !== null
                        ? `Photo ${activeGalleryIndex + 1} of ${visiblePhotos.length}`
                        : undefined
                }
                className="max-w-5xl"
            >
                {activeGalleryIndex !== null && (
                    <div className="space-y-4">
                        <div className="relative flex h-[min(58vh,560px)] w-full items-center justify-center overflow-hidden rounded-xl bg-cream-100">
                            <Image
                                src={visiblePhotos[activeGalleryIndex].imageUrl}
                                alt={
                                    visiblePhotos[activeGalleryIndex].altText ||
                                    `Community workshop ${activeGalleryIndex + 1}`
                                }
                                fill
                                className="object-contain"
                                sizes={LIGHTBOX_IMAGE_SIZES}
                                priority
                            />

                            {visiblePhotos.length > 1 && (
                                <>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setActiveGalleryIndex((prev) => {
                                                if (prev === null) return prev;
                                                return prev === 0
                                                    ? visiblePhotos.length - 1
                                                    : prev - 1;
                                            })
                                        }
                                        className="absolute left-2 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-dark shadow-lg transition-colors hover:bg-white sm:left-4"
                                        aria-label="Previous photo"
                                    >
                                        <ChevronLeft className="h-5 w-5" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setActiveGalleryIndex((prev) => {
                                                if (prev === null) return prev;
                                                return prev === visiblePhotos.length - 1
                                                    ? 0
                                                    : prev + 1;
                                            })
                                        }
                                        className="absolute right-2 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-dark shadow-lg transition-colors hover:bg-white sm:right-4"
                                        aria-label="Next photo"
                                    >
                                        <ChevronRight className="h-5 w-5" />
                                    </button>
                                </>
                            )}
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <span className="text-center text-xs font-inter font-medium text-dark-muted sm:text-left">
                                {activeGalleryIndex + 1} / {visiblePhotos.length}
                            </span>

                            <div className="flex items-center justify-center gap-2 sm:justify-end">
                                <button
                                    type="button"
                                    onClick={() =>
                                        setActiveGalleryIndex((prev) => {
                                            if (prev === null) return prev;
                                            return prev === 0 ? visiblePhotos.length - 1 : prev - 1;
                                        })
                                    }
                                    className="btn-secondary !px-4 !py-2 text-sm"
                                >
                                    Previous
                                </button>
                                <button
                                    type="button"
                                    onClick={() =>
                                        setActiveGalleryIndex((prev) => {
                                            if (prev === null) return prev;
                                            return prev === visiblePhotos.length - 1 ? 0 : prev + 1;
                                        })
                                    }
                                    className="btn-primary !px-4 !py-2 text-sm"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </Dialog>
        </>
    );
}
