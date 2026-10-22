"use client";

import { useEffect, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { usePrefersReducedMotion } from "@/lib/use-reduced-motion";
import {
    ArrowRight,
    Calendar,
    MapPin,
    ChevronLeft,
    ChevronRight,
    Camera,
    Info,
} from "lucide-react";
import Footer from "@/components/Footer";
import { Dialog } from "@/components/ui/dialog";
import { LIGHTBOX_IMAGE_SIZES, PreloadImages } from "@/components/ui/LightboxPreload";
import type { Workshop } from "@/lib/data";
import { areaWithCity, displayVenue, workshopArea } from "@/lib/seo";
import type { TopicLink } from "@/lib/seo-topics";
import { formatDate } from "@/lib/utils";
import { loadMorePastEvents } from "./actions";
import {
    fadeInUp,
    quickTransition,
    standardTransition,
    revealViewport,
    useMotionProps,
} from "@/lib/motion-presets";

/** Visible from the first paint; only settles 24px upwards once in view. */
const cardRevealVariants = {
    hidden: { y: 24 },
    visible: { y: 0 },
};

interface LightboxState {
    workshopIndex: number;
    photoIndex: number;
}

/**
 * A finished session cannot be booked, so its card points at the activity page, which lists the
 * upcoming dates. Nothing renders when the workshop fits no activity or its city has no pages.
 */
function UpcomingTopicLink({
    topicLink,
    className = "",
}: {
    topicLink: TopicLink | undefined;
    className?: string;
}) {
    if (!topicLink) return null;

    return (
        <div className={`border-t border-clay/30 px-5 py-3 ${className}`}>
            <Link
                href={topicLink.href}
                className="inline-flex items-center gap-1.5 text-sm font-inter font-semibold text-terracotta hover:gap-2.5 transition-all duration-300"
            >
                More {topicLink.name.toLowerCase()} workshops
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
        </div>
    );
}

export default function PastEventsPageClient({
    initialWorkshops,
    initialTopicLinks,
    initialTotal,
    pageSize,
    source,
}: {
    initialWorkshops: Workshop[];
    initialTopicLinks: Record<string, TopicLink>;
    initialTotal: number;
    pageSize: number;
    source: "supabase" | "error";
}) {
    const router = useRouter();
    const shouldReduceMotion = usePrefersReducedMotion();
    const [lightbox, setLightbox] = useState<LightboxState | null>(null);
    const sectionMotionProps = useMotionProps(shouldReduceMotion, fadeInUp, standardTransition);

    const [workshops, setWorkshops] = useState<Workshop[]>(initialWorkshops);
    const [topicLinks, setTopicLinks] = useState(initialTopicLinks);
    const [total, setTotal] = useState(initialTotal);
    const [loadedPages, setLoadedPages] = useState(1);
    const [isLoadingMore, startLoadingMore] = useTransition();
    const [loadMoreError, setLoadMoreError] = useState(false);

    // The server revalidates every 60s; if a fresh first page arrives, restart from it.
    useEffect(() => {
        setWorkshops(initialWorkshops);
        setTopicLinks(initialTopicLinks);
        setTotal(initialTotal);
        setLoadedPages(1);
        setLoadMoreError(false);
    }, [initialWorkshops, initialTopicLinks, initialTotal]);

    const hasMore = workshops.length < total && loadedPages * pageSize <= total;

    const handleLoadMore = () => {
        const nextPage = loadedPages + 1;
        setLoadMoreError(false);
        startLoadingMore(async () => {
            try {
                const result = await loadMorePastEvents(nextPage);
                if (!result.ok) {
                    setLoadMoreError(true);
                    return;
                }
                setWorkshops((previous) => {
                    const seen = new Set(previous.map((workshop) => workshop.id));
                    return [...previous, ...result.workshops.filter((w) => !seen.has(w.id))];
                });
                setTopicLinks((previous) => ({ ...previous, ...result.topicLinks }));
                setTotal(result.total);
                setLoadedPages(nextPage);
            } catch {
                setLoadMoreError(true);
            }
        });
    };

    const currentWorkshop = lightbox !== null ? workshops[lightbox.workshopIndex] : null;
    const currentPhotos = currentWorkshop?.galleryImages ?? [];

    // While the lightbox is open, warm its neighbours so Next/Previous are instant. A Set, because
    // with two photos "next" and "previous" are the same one (duplicate React keys otherwise).
    const preloadSrcs: string[] = [];
    if (lightbox !== null && currentPhotos.length > 1) {
        const count = currentPhotos.length;
        const neighbours = new Set([
            (lightbox.photoIndex + 1) % count,
            (lightbox.photoIndex - 1 + count) % count,
        ]);
        neighbours.delete(lightbox.photoIndex);
        preloadSrcs.push(...[...neighbours].map((index) => currentPhotos[index]));
    }

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
        <div className="min-h-full bg-cream">
            {source === "error" && (
                <div className="section-padding pt-24 sm:pt-28 pb-0">
                    <div className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-inter text-red-700 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2">
                            <Info className="h-4 w-4 shrink-0" />
                            <span>Unable to load live past events right now.</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => router.refresh()}
                            className="inline-flex items-center justify-center rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                        >
                            Try again
                        </button>
                    </div>
                </div>
            )}

            {/* Hero header */}
            <section className="pt-28 pb-12 section-padding">
                <div className="max-w-7xl mx-auto">
                    {/* Same trail as the BreadcrumbList JSON-LD in page.tsx. */}
                    <nav
                        aria-label="Breadcrumb"
                        className="mb-6 flex flex-wrap items-center gap-2 text-sm font-inter text-dark-muted"
                    >
                        <Link
                            href="/"
                            className="inline-flex items-center hover:text-terracotta transition-colors"
                        >
                            Home
                        </Link>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <Link
                            href="/workshops/pune"
                            className="inline-flex items-center hover:text-terracotta transition-colors"
                        >
                            Workshops in Pune
                        </Link>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span className="text-dark" aria-current="page">
                            Past workshops
                        </span>
                    </nav>

                    <motion.div {...sectionMotionProps}>
                        <span className="eyebrow-label">Memories</span>
                        <h1 className="heading-lg !text-4xl sm:!text-5xl mb-3">
                            Past workshops in Pune
                        </h1>
                        <p className="text-body text-dark-muted max-w-2xl mb-8">
                            Photos and highlights from past workshops in Pune. Browse each session
                            to see what it was like, then find your next one among the{" "}
                            <Link
                                href="/workshops/pune"
                                className="interactive-link font-semibold text-terracotta"
                            >
                                upcoming workshops in Pune
                            </Link>
                            .
                        </p>
                    </motion.div>
                </div>
            </section>

            {/* Events grid */}
            <section className="section-padding pb-8 md:pb-16">
                <div className="max-w-7xl mx-auto">
                    {workshops.length === 0 ? (
                        <div className="text-center py-20">
                            <div className="w-16 h-16 rounded-full bg-terracotta/10 flex items-center justify-center mx-auto mb-4">
                                <Camera className="w-8 h-8 text-terracotta" />
                            </div>
                            <h2 className="heading-sm mb-2">No past events yet</h2>
                            <p className="text-body text-dark-muted max-w-md mx-auto mb-6">
                                We haven&apos;t hosted any workshops yet, but exciting things are on
                                the way! Check out our upcoming experiences.
                            </p>
                            <Link href="/explore" className="btn-primary">
                                Browse Upcoming
                            </Link>
                        </div>
                    ) : (
                        // Each card reveals on its own: one observer on the whole grid needed a
                        // share of a ~4,500px block on screen at once, which a phone never shows.
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                            {workshops.map((workshop, wIdx) => (
                                <motion.div
                                    key={workshop.id}
                                    variants={cardRevealVariants}
                                    initial={"hidden"}
                                    whileInView={"visible"}
                                    viewport={revealViewport}
                                    transition={
                                        shouldReduceMotion ? { duration: 0 } : quickTransition
                                    }
                                    className="bg-white rounded-3xl shadow-soft border border-clay/30 overflow-hidden hover-lift group flex flex-col"
                                >
                                    {/* Cover image */}
                                    <Link
                                        href={`/workshop/${workshop.id}`}
                                        className="block relative aspect-[16/10] overflow-hidden bg-cream-100"
                                    >
                                        <Image
                                            src={workshop.coverImage}
                                            alt={workshop.title}
                                            fill
                                            className="object-cover image-hover-zoom"
                                            sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
                                            // The first cover is the largest thing above the fold.
                                            priority={wIdx === 0}
                                            loading={wIdx === 0 ? undefined : "lazy"}
                                            quality={75}
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                                        <div className="absolute bottom-0 left-0 right-0 p-5">
                                            <span className="inline-block bg-terracotta/90 text-white text-[10px] font-inter font-bold uppercase tracking-wider px-2.5 py-1 rounded-full mb-2">
                                                {workshop.category}
                                            </span>
                                            <h3 className="font-inter text-lg font-bold text-white leading-tight line-clamp-2">
                                                {workshop.title}
                                            </h3>
                                        </div>
                                    </Link>

                                    {/* Info */}
                                    <div className="px-5 pt-4 pb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-inter text-dark-muted">
                                        <span className="inline-flex items-center gap-1.5">
                                            <Calendar className="w-3.5 h-3.5" />
                                            {formatDate(workshop.date)}
                                        </span>
                                        <span className="inline-flex items-center gap-1.5">
                                            <MapPin className="w-3.5 h-3.5" />
                                            {/* A Maps link pasted as the venue is not a place
                                                name: fall back to the area from the address. */}
                                            {displayVenue(workshop) ||
                                                areaWithCity(workshopArea(workshop))}
                                        </span>
                                    </div>

                                    {/* Photo gallery grid */}
                                    {workshop.galleryImages &&
                                        workshop.galleryImages.length > 0 && (
                                            <div className="px-5 pb-5 mt-auto">
                                                <p className="text-[11px] font-inter font-bold uppercase tracking-wider text-dark-muted mb-2.5 flex items-center gap-1.5">
                                                    <Camera className="w-3 h-3" />
                                                    Event Photos ({workshop.galleryImages.length})
                                                </p>
                                                <div className="grid grid-cols-3 gap-2">
                                                    {workshop.galleryImages
                                                        .slice(0, 3)
                                                        .map((img, pIdx) => (
                                                            <button
                                                                key={pIdx}
                                                                type="button"
                                                                onClick={() =>
                                                                    openLightbox(wIdx, pIdx)
                                                                }
                                                                className="relative aspect-square rounded-xl overflow-hidden bg-cream-100 cursor-zoom-in group/thumb"
                                                                aria-label={`View photo ${pIdx + 1} from ${workshop.title}`}
                                                            >
                                                                <Image
                                                                    src={img}
                                                                    alt={`${workshop.title} photo ${pIdx + 1}`}
                                                                    fill
                                                                    className="object-cover transition-transform duration-300 group-hover/thumb:scale-110"
                                                                    sizes="(max-width: 768px) 28vw, (max-width: 1280px) 14vw, 10vw"
                                                                    loading="lazy"
                                                                    quality={60}
                                                                />
                                                                <div className="absolute inset-0 bg-black/0 group-hover/thumb:bg-black/20 transition-colors duration-300 flex items-center justify-center">
                                                                    <span className="text-white text-xs font-inter font-semibold opacity-0 group-hover/thumb:opacity-100 transition-opacity duration-200">
                                                                        View
                                                                    </span>
                                                                </div>
                                                                {pIdx === 2 &&
                                                                    workshop.galleryImages.length >
                                                                        3 && (
                                                                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                                                            <span className="text-white text-lg font-inter font-bold">
                                                                                +
                                                                                {workshop
                                                                                    .galleryImages
                                                                                    .length - 3}
                                                                            </span>
                                                                        </div>
                                                                    )}
                                                            </button>
                                                        ))}
                                                </div>
                                            </div>
                                        )}

                                    {/* Pinned to the card's foot when there is no photo grid. */}
                                    <UpcomingTopicLink
                                        topicLink={topicLinks[workshop.id]}
                                        className={workshop.galleryImages?.length ? "" : "mt-auto"}
                                    />
                                </motion.div>
                            ))}
                        </div>
                    )}

                    {workshops.length > 0 && (hasMore || loadMoreError) && (
                        <div className="mt-10 flex flex-col items-center gap-3">
                            {loadMoreError && (
                                <p role="alert" className="text-sm font-inter text-red-700">
                                    Couldn&apos;t load more events. Please try again.
                                </p>
                            )}
                            <button
                                type="button"
                                onClick={handleLoadMore}
                                disabled={isLoadingMore}
                                className="btn-secondary inline-flex items-center justify-center disabled:opacity-60"
                            >
                                {isLoadingMore ? "Loading..." : "Load more events"}
                            </button>
                        </div>
                    )}
                </div>
            </section>

            {lightbox !== null && <PreloadImages srcs={preloadSrcs} sizes={LIGHTBOX_IMAGE_SIZES} />}

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
                className="max-w-5xl"
            >
                {lightbox !== null && currentPhotos.length > 0 && (
                    <div className="space-y-4">
                        <div className="relative flex h-[min(58vh,560px)] w-full items-center justify-center overflow-hidden rounded-xl bg-cream-100">
                            <Image
                                src={currentPhotos[lightbox.photoIndex]}
                                alt={`${currentWorkshop?.title} photo ${lightbox.photoIndex + 1}`}
                                fill
                                className="object-contain"
                                sizes={LIGHTBOX_IMAGE_SIZES}
                                priority
                            />

                            {currentPhotos.length > 1 && (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => navigatePhoto("prev")}
                                        className="absolute left-2 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-dark shadow-lg transition-colors hover:bg-white sm:left-4"
                                        aria-label="Previous photo"
                                    >
                                        <ChevronLeft className="h-5 w-5" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => navigatePhoto("next")}
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
                                {lightbox.photoIndex + 1} / {currentPhotos.length}
                            </span>

                            <div className="flex items-center justify-center gap-2 sm:justify-end">
                                <button
                                    type="button"
                                    onClick={() => navigatePhoto("prev")}
                                    className="btn-secondary !px-4 !py-2 text-sm inline-flex items-center gap-1.5"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                    Previous
                                </button>
                                <button
                                    type="button"
                                    onClick={() => navigatePhoto("next")}
                                    className="btn-primary !px-4 !py-2 text-sm inline-flex items-center gap-1.5"
                                >
                                    Next
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </Dialog>

            <Footer />
        </div>
    );
}
