"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { Play, Grid3X3, Share2, Heart } from "lucide-react";
import { useRef } from "react";
import { fadeIn, fadeInUp, quickTransition, standardTransition } from "@/lib/motion-presets";
import { isDirectVideoFileUrl, isSupportedWorkshopImageUrl } from "@/lib/workshop-media";
import type { Workshop } from "@/lib/data";

export interface WorkshopGalleryProps {
    workshop: Workshop;
    activeImage: number;
    setActiveImage: (index: number) => void;
    showVideo: boolean;
    setShowVideo: (show: boolean) => void;
    isSaved: boolean;
    favoriteLoading: boolean;
    onToggleFavorite: () => void;
}

export default function WorkshopGallery({
    workshop,
    activeImage,
    setActiveImage,
    showVideo,
    setShowVideo,
    isSaved,
    favoriteLoading,
    onToggleFavorite,
}: WorkshopGalleryProps) {
    const prefersReducedMotion = useReducedMotion();
    const videoModalRef = useRef<HTMLDivElement | null>(null);
    const isDirectVideoFile = isDirectVideoFileUrl(workshop.videoUrl);
    const closeVideoModal = () => setShowVideo(false);
    const galleryImages = Array.from(
        new Set(
            [workshop.coverImage, ...(workshop.galleryImages || [])]
                .map((image) => image?.trim())
                .filter(
                    (image): image is string => Boolean(image) && isSupportedWorkshopImageUrl(image)
                )
        )
    );
    const activeImageIndex = Math.min(Math.max(activeImage, 0), galleryImages.length - 1);
    const activeImageSrc = galleryImages[activeImageIndex] || "/images/og-default.jpg";
    const hasThumbnails = galleryImages.length > 1;
    const visibleThumbnails = galleryImages
        .map((src, index) => ({ src, index }))
        .filter((item) => item.index !== activeImageIndex)
        .slice(0, 2);

    return (
        <>
            <motion.div
                variants={prefersReducedMotion ? undefined : fadeInUp}
                initial={prefersReducedMotion ? undefined : "hidden"}
                animate={prefersReducedMotion ? undefined : "visible"}
                transition={prefersReducedMotion ? { duration: 0 } : standardTransition}
                className="relative"
            >
                <div className="bg-white/90 rounded-3xl shadow-card border border-white/40 backdrop-blur-sm p-2">
                    <div
                        className={`grid grid-cols-1 gap-2 rounded-2xl overflow-hidden ${
                            hasThumbnails ? "sm:grid-cols-[2fr,1fr]" : ""
                        }`}
                    >
                        <div className="relative aspect-[16/9] min-h-[240px] sm:row-span-2 sm:min-h-[420px] ring-1 ring-white/50">
                            <Image
                                src={activeImageSrc}
                                alt={workshop.title}
                                fill
                                priority
                                className="object-cover"
                                sizes="(max-width: 1024px) 100vw, 60vw"
                            />
                            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/35 via-black/10 to-transparent" />
                            {workshop.isBestseller && (
                                <div className="absolute top-4 left-4 bg-terracotta text-white text-xs font-inter font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg">
                                    Bestseller
                                </div>
                            )}
                            {workshop.videoUrl && (
                                <button
                                    onClick={() => setShowVideo(true)}
                                    className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm text-dark text-xs font-inter font-semibold px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-white transition-colors shadow-soft"
                                >
                                    <Play className="w-4 h-4 text-terracotta fill-terracotta" />{" "}
                                    Watch Video
                                </button>
                            )}
                        </div>
                        {visibleThumbnails.map((item, i) => {
                            return (
                                <div
                                    key={`${item.src}-${item.index}`}
                                    className="hidden cursor-pointer rounded-xl border border-clay/40 bg-cream-100 p-1 transition-all hover:ring-2 hover:ring-terracotta/30 sm:block"
                                    onClick={() => setActiveImage(item.index)}
                                >
                                    <div className="relative aspect-[4/3] overflow-hidden rounded-lg">
                                        <Image
                                            src={item.src}
                                            alt={`${workshop.title} ${item.index + 1}`}
                                            fill
                                            className="object-cover hover:opacity-90 transition-opacity"
                                            sizes="20vw"
                                            loading="lazy"
                                        />
                                        {i === 1 && (
                                            <button className="absolute bottom-3 right-3 bg-white/90 backdrop-blur-sm text-dark text-xs font-inter font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5 hover:bg-white transition-colors">
                                                <Grid3X3 className="w-3.5 h-3.5" /> View All
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
                <div className="absolute top-4 right-4 flex gap-2 sm:hidden">
                    <button
                        type="button"
                        aria-label="Share workshop"
                        className="p-2.5 bg-white/90 backdrop-blur-sm rounded-full shadow-soft"
                    >
                        <Share2 className="w-4 h-4 text-dark" />
                    </button>
                    <button
                        type="button"
                        onClick={onToggleFavorite}
                        disabled={favoriteLoading}
                        aria-label={isSaved ? "Remove from wishlist" : "Save to wishlist"}
                        aria-pressed={isSaved}
                        className="p-2.5 bg-white/90 backdrop-blur-sm rounded-full shadow-soft disabled:opacity-60"
                    >
                        <Heart
                            className={`w-4 h-4 ${isSaved ? "text-terracotta fill-terracotta" : "text-dark"}`}
                        />
                    </button>
                </div>
            </motion.div>

            {showVideo && workshop.videoUrl && (
                <motion.div
                    variants={prefersReducedMotion ? undefined : fadeIn}
                    initial={prefersReducedMotion ? undefined : "hidden"}
                    animate={prefersReducedMotion ? undefined : "visible"}
                    transition={prefersReducedMotion ? { duration: 0 } : quickTransition}
                    className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4"
                    onClick={closeVideoModal}
                >
                    <motion.div
                        initial={prefersReducedMotion ? undefined : { opacity: 0, scale: 0.9 }}
                        animate={prefersReducedMotion ? undefined : { opacity: 1, scale: 1 }}
                        transition={prefersReducedMotion ? { duration: 0 } : quickTransition}
                        className="relative w-full max-w-4xl aspect-video rounded-2xl overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                        aria-label={`${workshop.title} video preview`}
                        tabIndex={-1}
                        ref={videoModalRef}
                    >
                        {isDirectVideoFile ? (
                            <video
                                src={workshop.videoUrl}
                                className="w-full h-full bg-black"
                                controls
                                autoPlay
                            />
                        ) : (
                            <iframe
                                src={workshop.videoUrl}
                                title={`${workshop.title} video`}
                                className="w-full h-full"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                            />
                        )}
                        <button
                            onClick={closeVideoModal}
                            className="absolute -top-12 right-0 text-white text-sm font-inter hover:text-terracotta transition-colors"
                            aria-label="Close video"
                        >
                            Close X
                        </button>
                    </motion.div>
                </motion.div>
            )}
        </>
    );
}
