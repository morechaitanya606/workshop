"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { usePrefersReducedMotion } from "@/lib/use-reduced-motion";
import {
    ChevronLeft,
    ChevronRight,
    ExternalLink,
    Play,
    Grid3X3,
    Share2,
    Heart,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { fadeIn, quickTransition } from "@/lib/motion-presets";
import { isSupportedWorkshopImageUrl } from "@/lib/workshop-media";
import { VIDEO_IFRAME_ALLOW, VIDEO_IFRAME_SANDBOX, getSafeVideoEmbed } from "@/lib/video-embed";
import { Dialog } from "@/components/ui/dialog";
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
    const prefersReducedMotion = usePrefersReducedMotion();
    const videoModalRef = useRef<HTMLDivElement | null>(null);
    const [isLightboxOpen, setIsLightboxOpen] = useState(false);
    const [shareMessage, setShareMessage] = useState("");
    const shareTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const video = getSafeVideoEmbed(workshop.videoUrl);
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
    const imageCount = galleryImages.length;
    const activeImageIndex = Math.min(Math.max(activeImage, 0), Math.max(imageCount - 1, 0));
    const activeImageSrc = galleryImages[activeImageIndex] || "/images/og-default.jpg";
    const hasThumbnails = imageCount > 1;
    const visibleThumbnails = galleryImages
        .map((src, index) => ({ src, index }))
        .filter((item) => item.index !== activeImageIndex)
        .slice(0, 2);
    const viewAllThumbnailPosition = imageCount > 2 ? visibleThumbnails.length - 1 : -1;

    const showAdjacentImage = (direction: 1 | -1) => {
        if (imageCount < 2) return;
        setActiveImage((activeImageIndex + direction + imageCount) % imageCount);
    };

    useEffect(() => {
        return () => {
            if (shareTimerRef.current) clearTimeout(shareTimerRef.current);
        };
    }, []);

    const announceShare = useCallback((message: string) => {
        setShareMessage(message);
        if (shareTimerRef.current) clearTimeout(shareTimerRef.current);
        shareTimerRef.current = setTimeout(() => setShareMessage(""), 3500);
    }, []);

    const handleShare = async () => {
        const url = window.location.href;

        if (typeof navigator.share === "function") {
            try {
                await navigator.share({
                    title: workshop.title,
                    text: `Check out ${workshop.title} on Only Workshops`,
                    url,
                });
                return;
            } catch (error) {
                // Dismissing the native share sheet is not a failure worth reporting.
                if (error instanceof DOMException && error.name === "AbortError") return;
            }
        }

        try {
            await navigator.clipboard.writeText(url);
            announceShare("Link copied to clipboard");
        } catch {
            announceShare("Could not copy the link. Copy it from the address bar instead.");
        }
    };

    const watchVideoClassName =
        "absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm text-dark text-xs font-inter font-semibold px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-white transition-colors shadow-soft";

    return (
        <>
            {/* No entrance animation here: the first image is the page's LCP element, and a JS
                `initial` state would keep it invisible until hydration. */}
            <div className="relative">
                <div className="bg-white/90 rounded-3xl shadow-card border border-white/40 backdrop-blur-sm p-2">
                    <div
                        className={`grid grid-cols-1 gap-2 rounded-2xl overflow-hidden ${
                            // A 3-column grid with the main image spanning 2 gives the same 2:1
                            // split as an arbitrary `[2fr_1fr]` value, without depending on
                            // arbitrary-value syntax (`[2fr,1fr]` emitted invalid CSS that the
                            // browser dropped, which silently content-sized the thumbnail column).
                            hasThumbnails ? "sm:grid-cols-3 sm:grid-rows-2" : ""
                        }`}
                    >
                        {/* `w-full` is load-bearing: with `aspect-[16/9]` and `min-h-[240px]` but no width
                            constraint, once min-height wins the aspect-ratio drives the WIDTH to
                            427px inside a ~327px mobile column, overflowing the page horizontally. */}
                        <div className="relative aspect-[16/9] w-full min-h-[240px] sm:col-span-2 sm:row-span-2 sm:min-h-[420px] ring-1 ring-white/50">
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
                            {video?.kind === "link" ? (
                                <a
                                    href={video.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={watchVideoClassName}
                                >
                                    <ExternalLink className="w-4 h-4 text-terracotta" /> Watch Video
                                </a>
                            ) : video ? (
                                <button
                                    type="button"
                                    onClick={() => setShowVideo(true)}
                                    className={watchVideoClassName}
                                >
                                    <Play className="w-4 h-4 text-terracotta fill-terracotta" />{" "}
                                    Watch Video
                                </button>
                            ) : null}

                            {/* Mobile: the side thumbnails are hidden, so step through with arrows. */}
                            {hasThumbnails && (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => showAdjacentImage(-1)}
                                        aria-label="Previous image"
                                        className="absolute left-2 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-dark shadow-soft backdrop-blur-sm sm:hidden"
                                    >
                                        <ChevronLeft className="h-5 w-5" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => showAdjacentImage(1)}
                                        aria-label="Next image"
                                        className="absolute right-2 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-dark shadow-soft backdrop-blur-sm sm:hidden"
                                    >
                                        <ChevronRight className="h-5 w-5" />
                                    </button>
                                </>
                            )}
                        </div>
                        {visibleThumbnails.map((item, i) => (
                            <div
                                key={`${item.src}-${item.index}`}
                                // `h-full` makes the thumbnail fill its grid row. Without it the
                                // fixed aspect ratio left dead cream space under each one, because
                                // the rows are sized by the main image spanning both of them.
                                className={`relative hidden h-full rounded-xl border border-clay/40 bg-cream-100 p-1 transition-all hover:ring-2 hover:ring-terracotta/30 sm:block ${
                                    visibleThumbnails.length === 1 ? "sm:row-span-2" : ""
                                }`}
                            >
                                <button
                                    type="button"
                                    aria-label={`Show image ${item.index + 1} of ${workshop.title}`}
                                    onClick={() => setActiveImage(item.index)}
                                    className="relative block h-full min-h-[120px] w-full overflow-hidden rounded-lg"
                                >
                                    <Image
                                        src={item.src}
                                        alt=""
                                        fill
                                        className="object-cover hover:opacity-90 transition-opacity"
                                        sizes="20vw"
                                        loading="lazy"
                                    />
                                </button>
                                {i === viewAllThumbnailPosition && (
                                    <button
                                        type="button"
                                        onClick={() => setIsLightboxOpen(true)}
                                        className="absolute bottom-3 right-3 bg-white/90 backdrop-blur-sm text-dark text-xs font-inter font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5 hover:bg-white transition-colors"
                                    >
                                        <Grid3X3 className="w-3.5 h-3.5" /> View All
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Mobile: position dots and a way to see every photo. */}
                    {hasThumbnails && (
                        <div className="mt-2 flex items-center justify-between gap-3 px-1 sm:hidden">
                            <div
                                className="flex items-center"
                                role="group"
                                aria-label="Choose image"
                            >
                                {galleryImages.map((src, index) => (
                                    <button
                                        key={`${src}-${index}`}
                                        type="button"
                                        onClick={() => setActiveImage(index)}
                                        aria-label={`Show image ${index + 1} of ${imageCount}`}
                                        aria-current={
                                            index === activeImageIndex ? "true" : undefined
                                        }
                                        className="inline-flex h-6 w-5 min-h-0 items-center justify-center"
                                    >
                                        <span
                                            className={`block h-2 rounded-full transition-all ${
                                                index === activeImageIndex
                                                    ? "w-4 bg-terracotta"
                                                    : "w-2 bg-clay"
                                            }`}
                                        />
                                    </button>
                                ))}
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsLightboxOpen(true)}
                                className="inline-flex min-h-0 items-center gap-1.5 py-2 text-xs font-inter font-semibold text-terracotta"
                            >
                                <Grid3X3 className="h-3.5 w-3.5" /> View all {imageCount}
                            </button>
                        </div>
                    )}
                </div>
                <div className="absolute top-4 right-4 flex gap-2 sm:hidden">
                    <button
                        type="button"
                        onClick={handleShare}
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

                {/* Announced to screen readers; the visible bubble below mirrors it for everyone else. */}
                <div role="status" aria-live="polite" className="sr-only">
                    {shareMessage}
                </div>
                {shareMessage && (
                    <p
                        aria-hidden="true"
                        className="absolute right-4 top-[4.5rem] z-10 max-w-[14rem] rounded-lg bg-dark-text px-3 py-2 text-xs font-inter font-medium text-white shadow-soft sm:hidden"
                    >
                        {shareMessage}
                    </p>
                )}
            </div>

            <Dialog
                open={isLightboxOpen}
                onOpenChange={setIsLightboxOpen}
                title={`${workshop.title} photos`}
                description={`${imageCount} photo${imageCount === 1 ? "" : "s"}`}
                className="max-w-4xl"
            >
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {galleryImages.map((src, index) => (
                        <button
                            key={`${src}-${index}`}
                            type="button"
                            onClick={() => {
                                setActiveImage(index);
                                setIsLightboxOpen(false);
                            }}
                            aria-label={`Show image ${index + 1} of ${imageCount}`}
                            aria-current={index === activeImageIndex ? "true" : undefined}
                            className={`relative block aspect-[4/3] w-full overflow-hidden rounded-xl ${
                                index === activeImageIndex ? "ring-2 ring-terracotta" : ""
                            }`}
                        >
                            <Image
                                src={src}
                                alt=""
                                fill
                                className="object-cover"
                                sizes="(max-width: 640px) 45vw, 30vw"
                                loading="lazy"
                            />
                        </button>
                    ))}
                </div>
            </Dialog>

            {showVideo && video && video.kind !== "link" && (
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
                        {video.kind === "file" ? (
                            <video
                                src={video.src}
                                className="w-full h-full bg-black"
                                controls
                                autoPlay
                                playsInline
                                preload="metadata"
                            />
                        ) : (
                            <iframe
                                src={video.src}
                                title={`${workshop.title} video`}
                                className="w-full h-full"
                                sandbox={VIDEO_IFRAME_SANDBOX}
                                allow={VIDEO_IFRAME_ALLOW}
                                referrerPolicy="strict-origin-when-cross-origin"
                                allowFullScreen
                            />
                        )}
                        <button
                            type="button"
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
