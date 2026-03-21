"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { Calendar, MapPin, ChevronLeft, ChevronRight } from "lucide-react";
import type { Workshop } from "@/lib/data";
import { Dialog } from "@/components/ui/dialog";
import {
    fadeIn,
    fadeInUp,
    quickTransition,
    standardTransition,
    staggerContainer,
    revealViewport,
    useMotionProps,
} from "@/lib/motion-presets";
import { SectionHeader } from "@/components/home/HomeSectionShared";
import { formatDate } from "@/lib/utils";

interface LightboxState {
    workshopIndex: number;
    photoIndex: number;
}

export default function PastEventsShowcase({
    pastWorkshops,
    shouldReduceMotion,
}: {
    pastWorkshops: Workshop[];
    shouldReduceMotion: boolean;
}) {
    const [lightbox, setLightbox] = useState<LightboxState | null>(null);
    const sectionMotionProps = useMotionProps(shouldReduceMotion, fadeInUp, standardTransition);

    if (pastWorkshops.length === 0) return null;

    const currentWorkshop = lightbox !== null ? pastWorkshops[lightbox.workshopIndex] : null;
    const currentPhotos = currentWorkshop?.galleryImages ?? [];

    const openLightbox = (workshopIdx: number, photoIdx: number) => {
        setLightbox({ workshopIndex: workshopIdx, photoIndex: photoIdx });
    };

    const navigatePhoto = (direction: "prev" | "next") => {
        if (!lightbox) return;
        const total = currentPhotos.length;
        setLightbox((prev) => {
            if (!prev) return prev;
            return {
                ...prev,
                photoIndex:
                    direction === "next"
                        ? (prev.photoIndex + 1) % total
                        : prev.photoIndex === 0
                          ? total - 1
                          : prev.photoIndex - 1,
            };
        });
    };

    return (
        <>
            <section className="section-padding mt-24 sm:mt-20">
                <SectionHeader
                    title="Our Past Experiences"
                    eyebrow="Memories"
                    action="Explore all"
                    href="/explore?tab=past"
                    reduceMotion={shouldReduceMotion}
                />

                <motion.div
                    {...sectionMotionProps}
                    variants={shouldReduceMotion ? undefined : staggerContainer}
                    initial={shouldReduceMotion ? undefined : "hidden"}
                    whileInView={shouldReduceMotion ? undefined : "visible"}
                    viewport={shouldReduceMotion ? undefined : revealViewport}
                    className="grid grid-cols-1 md:grid-cols-2 gap-6"
                >
                    {pastWorkshops.map((workshop, wIdx) => (
                        <motion.div
                            key={workshop.id}
                            variants={
                                shouldReduceMotion
                                    ? undefined
                                    : {
                                          hidden: { opacity: 0, y: 24 },
                                          visible: { opacity: 1, y: 0 },
                                      }
                            }
                            transition={shouldReduceMotion ? { duration: 0 } : quickTransition}
                            className="bg-white rounded-3xl shadow-soft border border-clay/30 overflow-hidden hover-lift group"
                        >
                            {/* Cover image */}
                            <Link
                                href={`/workshop/${workshop.id}`}
                                className="block relative aspect-[16/9] overflow-hidden"
                            >
                                <Image
                                    src={workshop.coverImage}
                                    alt={workshop.title}
                                    fill
                                    className="object-cover image-hover-zoom"
                                    sizes="(max-width: 768px) 100vw, 50vw"
                                    loading="lazy"
                                    quality={75}
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                                <div className="absolute bottom-0 left-0 right-0 p-5">
                                    <span className="inline-block bg-terracotta/90 text-white text-[11px] font-inter font-bold uppercase tracking-wider px-2.5 py-1 rounded-full mb-2">
                                        Past Event
                                    </span>
                                    <h3 className="font-inter text-lg sm:text-xl font-bold text-white leading-tight line-clamp-2">
                                        {workshop.title}
                                    </h3>
                                </div>
                            </Link>

                            {/* Info bar */}
                            <div className="px-5 pt-4 pb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-inter text-dark-muted">
                                <span className="inline-flex items-center gap-1.5">
                                    <Calendar className="w-3.5 h-3.5" />
                                    {formatDate(workshop.date)}
                                </span>
                                <span className="inline-flex items-center gap-1.5">
                                    <MapPin className="w-3.5 h-3.5" />
                                    {workshop.location}, {workshop.city}
                                </span>
                                {workshop.rating > 0 && (
                                    <span className="ml-auto font-semibold text-dark">
                                        ★ {workshop.rating}
                                        <span className="font-normal text-dark-muted">
                                            {" "}
                                            ({workshop.reviewCount})
                                        </span>
                                    </span>
                                )}
                            </div>

                            {/* Photo grid */}
                            {workshop.galleryImages.length > 0 && (
                                <div className="px-5 pb-5">
                                    <p className="text-[11px] font-inter font-bold uppercase tracking-wider text-dark-muted mb-2.5">
                                        Event Photos
                                    </p>
                                    <div className="grid grid-cols-3 gap-2">
                                        {workshop.galleryImages.slice(0, 3).map((img, pIdx) => (
                                            <button
                                                key={pIdx}
                                                type="button"
                                                onClick={() => openLightbox(wIdx, pIdx)}
                                                className="relative aspect-square rounded-xl overflow-hidden cursor-zoom-in group/thumb"
                                                aria-label={`View photo ${pIdx + 1} from ${workshop.title}`}
                                            >
                                                <Image
                                                    src={img}
                                                    alt={`${workshop.title} photo ${pIdx + 1}`}
                                                    fill
                                                    className="object-cover transition-transform duration-300 group-hover/thumb:scale-110"
                                                    sizes="(max-width: 768px) 30vw, 15vw"
                                                    loading="lazy"
                                                    quality={60}
                                                />
                                                <div className="absolute inset-0 bg-black/0 group-hover/thumb:bg-black/20 transition-colors duration-300 flex items-center justify-center">
                                                    <span className="text-white text-xs font-inter font-semibold opacity-0 group-hover/thumb:opacity-100 transition-opacity duration-200">
                                                        View
                                                    </span>
                                                </div>
                                                {/* Show "+N" overlay on last visible thumbnail if more photos exist */}
                                                {pIdx === 2 &&
                                                    workshop.galleryImages.length > 3 && (
                                                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                                            <span className="text-white text-lg font-inter font-bold">
                                                                +{workshop.galleryImages.length - 3}
                                                            </span>
                                                        </div>
                                                    )}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    ))}
                </motion.div>
            </section>

            {/* Lightbox Dialog */}
            <Dialog
                open={lightbox !== null}
                onOpenChange={(open) => {
                    if (!open) setLightbox(null);
                }}
                title={currentWorkshop?.title ?? "Event Photo"}
                description={
                    lightbox !== null
                        ? `Photo ${lightbox.photoIndex + 1} of ${currentPhotos.length}`
                        : undefined
                }
                className="max-w-4xl"
            >
                {lightbox !== null && currentPhotos.length > 0 && (
                    <div className="space-y-4">
                        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-cream">
                            <Image
                                src={currentPhotos[lightbox.photoIndex]}
                                alt={`${currentWorkshop?.title} photo ${lightbox.photoIndex + 1}`}
                                fill
                                className="object-cover"
                                sizes="(max-width: 1024px) 92vw, 1024px"
                            />
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <button
                                type="button"
                                onClick={() => navigatePhoto("prev")}
                                className="btn-secondary !px-5 !py-2.5 text-sm inline-flex items-center gap-1.5"
                            >
                                <ChevronLeft className="w-4 h-4" />
                                Previous
                            </button>
                            <span className="text-xs font-inter text-dark-muted">
                                {lightbox.photoIndex + 1} / {currentPhotos.length}
                            </span>
                            <button
                                type="button"
                                onClick={() => navigatePhoto("next")}
                                className="btn-primary !px-5 !py-2.5 text-sm inline-flex items-center gap-1.5"
                            >
                                Next
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}
            </Dialog>
        </>
    );
}
