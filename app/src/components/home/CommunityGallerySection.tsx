"use client";

import { useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { galleryImages } from "@/lib/data";
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
}: {
    shouldReduceMotion: boolean;
}) {
    const [activeGalleryIndex, setActiveGalleryIndex] = useState<number | null>(null);
    const galleryMotionProps = useMotionProps(shouldReduceMotion, fadeIn, quickTransition);

    return (
        <>
            <section className="section-padding mt-24 sm:mt-20">
                <SectionHeader
                    title="From Our Community"
                    eyebrow="Community"
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
                    {galleryImages.map((img, index) => (
                        <motion.button
                            key={index}
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
                            className={`relative mb-3 sm:mb-4 rounded-xl overflow-hidden group break-inside-avoid cursor-zoom-in ${
                                index >= 8 ? "hidden sm:block" : ""
                            }`}
                        >
                            <Image
                                src={img}
                                alt={`Community workshop ${index + 1}`}
                                width={400}
                                height={index % 3 === 0 ? 500 : index % 3 === 1 ? 350 : 400}
                                className="w-full h-auto object-cover transition-transform duration-700 motion-safe:group-hover:scale-105"
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
                        ? `Photo ${activeGalleryIndex + 1} of ${galleryImages.length}`
                        : undefined
                }
                className="max-w-4xl"
            >
                {activeGalleryIndex !== null && (
                    <div className="space-y-4">
                        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-cream">
                            <Image
                                src={galleryImages[activeGalleryIndex]}
                                alt={`Community workshop ${activeGalleryIndex + 1}`}
                                fill
                                className="object-cover"
                                sizes="(max-width: 1024px) 92vw, 1024px"
                            />
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <button
                                type="button"
                                onClick={() =>
                                    setActiveGalleryIndex((prev) => {
                                        if (prev === null) return prev;
                                        return prev === 0 ? galleryImages.length - 1 : prev - 1;
                                    })
                                }
                                className="btn-secondary !px-5 !py-2.5 text-sm"
                            >
                                Previous
                            </button>
                            <button
                                type="button"
                                onClick={() =>
                                    setActiveGalleryIndex((prev) => {
                                        if (prev === null) return prev;
                                        return prev === galleryImages.length - 1 ? 0 : prev + 1;
                                    })
                                }
                                className="btn-primary !px-5 !py-2.5 text-sm"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </Dialog>
        </>
    );
}
