"use client";

import { useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { galleryImages } from "@/lib/data";
import type { CommunityPhoto } from "@/lib/community-photos";
import { Dialog } from "@/components/ui/dialog";
import {
    fadeIn,
    quickTransition,
    revealViewport,
    staggerContainer,
    useMotionProps,
} from "@/lib/motion-presets";
import { SectionHeader } from "@/components/home/HomeSectionShared";

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
    const visiblePhotos =
        photos && photos.length > 0
            ? photos.slice(0, 12)
            : galleryImages.slice(0, 12).map((imageUrl, index) => ({
                  id: `fallback-gallery-${index + 1}`,
                  imageUrl,
                  altText: `Community workshop ${index + 1}`,
              }));

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
                    variants={shouldReduceMotion ? undefined : staggerContainer}
                    initial={shouldReduceMotion ? undefined : "hidden"}
                    whileInView={shouldReduceMotion ? undefined : "visible"}
                    viewport={shouldReduceMotion ? undefined : revealViewport}
                    className="columns-2 sm:columns-3 lg:columns-4 gap-3 sm:gap-4"
                >
                    {visiblePhotos.map((photo, index) => (
                        <motion.button
                            key={photo.id}
                            type="button"
                            onClick={() => setActiveGalleryIndex(index)}
                            aria-label={`Open community photo ${index + 1}`}
                            variants={
                                shouldReduceMotion
                                    ? undefined
                                    : {
                                          hidden: { opacity: 0, scale: 0.9 },
                                          visible: { opacity: 1, scale: 1 },
                                      }
                            }
                            transition={shouldReduceMotion ? { duration: 0 } : quickTransition}
                            className={`relative mb-3 sm:mb-4 rounded-xl overflow-hidden group break-inside-avoid cursor-zoom-in hover-lift ${
                                index >= 8 ? "hidden sm:block" : ""
                            }`}
                        >
                            <Image
                                src={photo.imageUrl}
                                alt={photo.altText || `Community workshop ${index + 1}`}
                                width={400}
                                height={index % 3 === 0 ? 500 : index % 3 === 1 ? 350 : 400}
                                className="w-full h-auto object-cover image-hover-zoom"
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
                                sizes="(max-width: 640px) 92vw, (max-width: 1024px) 88vw, 1100px"
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
                                        className="absolute left-2 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/92 text-dark shadow-lg transition-colors hover:bg-white sm:left-4"
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
                                        className="absolute right-2 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/92 text-dark shadow-lg transition-colors hover:bg-white sm:right-4"
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
