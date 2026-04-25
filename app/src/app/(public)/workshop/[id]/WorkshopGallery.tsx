"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { Play, Grid3X3, Share2, Heart, X } from "lucide-react";
import { useRef } from "react";
import { fadeIn, fadeInUp, quickTransition, standardTransition } from "@/lib/motion-presets";
import { isDirectVideoFileUrl } from "@/lib/workshop-media";
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
                    <div className="grid grid-cols-1 sm:grid-cols-[2fr,1fr] gap-2 rounded-2xl overflow-hidden">
                        <div className="relative aspect-[4/3] sm:aspect-auto sm:row-span-2 ring-1 ring-white/50">
                            <Image
                                src={workshop.galleryImages[activeImage]}
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
                        {workshop.galleryImages.slice(1, 3).map((img, i) => {
                            const thumbIndex = i + 1;
                            const isActive = activeImage === thumbIndex;
                            return (
                                <div
                                    key={i}
                                    className={`hidden sm:block cursor-pointer rounded-xl bg-cream-100 border border-clay/40 p-1 transition-all ${
                                        isActive
                                            ? "ring-2 ring-terracotta/50"
                                            : "hover:ring-2 hover:ring-terracotta/30"
                                    }`}
                                    onClick={() => setActiveImage(thumbIndex)}
                                >
                                    <div className="relative aspect-[4/3] overflow-hidden rounded-lg">
                                        <Image
                                            src={img}
                                            alt={`${workshop.title} ${i + 2}`}
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
