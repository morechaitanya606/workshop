"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useReducedMotion, motion } from "framer-motion";
import {
    ArrowLeft,
    Calendar,
    MapPin,
    Star,
    ChevronLeft,
    ChevronRight,
    Camera,
    Info,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import MobileNav from "@/components/MobileNav";
import { Dialog } from "@/components/ui/dialog";
import type { Workshop } from "@/lib/data";
import { mockWorkshops } from "@/lib/data";
import { formatDate } from "@/lib/utils";
import {
    fadeInUp,
    quickTransition,
    standardTransition,
    staggerContainer,
    revealViewport,
    useMotionProps,
} from "@/lib/motion-presets";

interface LightboxState {
    workshopIndex: number;
    photoIndex: number;
}

export default function PastEventsPageClient({
    allWorkshops,
    source,
}: {
    allWorkshops: Workshop[];
    source: "supabase" | "mock" | "error";
}) {
    const router = useRouter();
    const shouldReduceMotion = Boolean(useReducedMotion());
    const [lightbox, setLightbox] = useState<LightboxState | null>(null);
    const sectionMotionProps = useMotionProps(shouldReduceMotion, fadeInUp, standardTransition);

    const workshops = useMemo(() => {
        const all = source === "mock" && allWorkshops.length === 0 ? mockWorkshops : allWorkshops;
        const today = new Date().toISOString().slice(0, 10);
        return all.filter((w) => w.date < today).sort((a, b) => b.date.localeCompare(a.date));
    }, [allWorkshops, source]);

    const currentWorkshop = lightbox !== null ? workshops[lightbox.workshopIndex] : null;
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

    // Aggregate stats
    const totalPhotos = workshops.reduce((sum, w) => sum + (w.galleryImages?.length || 0), 0);
    const avgRating =
        workshops.length > 0
            ? (workshops.reduce((sum, w) => sum + w.rating, 0) / workshops.length).toFixed(1)
            : "0";

    return (
        <main className="min-h-screen pb-20 md:pb-0 bg-cream">
            <Navbar />

            {source === "mock" && (
                <div className="section-padding pt-24 sm:pt-28 pb-0">
                    <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-inter text-amber-900">
                        <Info className="h-4 w-4" />
                        Showing sample workshops while live past-event data is unavailable.
                    </div>
                </div>
            )}
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
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 text-sm font-inter text-dark-muted hover:text-terracotta transition-colors mb-6"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back to Home
                    </Link>

                    <motion.div {...sectionMotionProps}>
                        <span className="eyebrow-label">Memories</span>
                        <h1 className="heading-lg !text-4xl sm:!text-5xl mb-3">
                            Past Events & Photos
                        </h1>
                        <p className="text-body text-dark-muted max-w-2xl mb-8">
                            Relive the magic of our past workshops. Browse photos, see what
                            attendees experienced, and get inspired for upcoming events.
                        </p>

                        {/* Stats bar */}
                        <div className="flex flex-wrap gap-6 mb-2">
                            <div className="flex items-center gap-2 bg-white rounded-full px-4 py-2 shadow-sm border border-clay/30">
                                <Camera className="w-4 h-4 text-terracotta" />
                                <span className="text-sm font-inter font-semibold text-dark">
                                    {totalPhotos} Photos
                                </span>
                            </div>
                            <div className="flex items-center gap-2 bg-white rounded-full px-4 py-2 shadow-sm border border-clay/30">
                                <Calendar className="w-4 h-4 text-terracotta" />
                                <span className="text-sm font-inter font-semibold text-dark">
                                    {workshops.length} Events
                                </span>
                            </div>
                            <div className="flex items-center gap-2 bg-white rounded-full px-4 py-2 shadow-sm border border-clay/30">
                                <Star className="w-4 h-4 text-amber-500" />
                                <span className="text-sm font-inter font-semibold text-dark">
                                    {avgRating} Avg Rating
                                </span>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* Events grid */}
            <section className="section-padding pb-16">
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
                        <motion.div
                            variants={shouldReduceMotion ? undefined : staggerContainer}
                            initial={shouldReduceMotion ? undefined : "hidden"}
                            whileInView={shouldReduceMotion ? undefined : "visible"}
                            viewport={shouldReduceMotion ? undefined : revealViewport}
                            className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6"
                        >
                            {workshops.map((workshop, wIdx) => (
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
                                    transition={
                                        shouldReduceMotion ? { duration: 0 } : quickTransition
                                    }
                                    className="bg-white rounded-3xl shadow-soft border border-clay/30 overflow-hidden hover-lift group flex flex-col"
                                >
                                    {/* Cover image */}
                                    <Link
                                        href={`/workshop/${workshop.id}`}
                                        className="block relative aspect-[16/10] overflow-hidden"
                                    >
                                        <Image
                                            src={workshop.coverImage}
                                            alt={workshop.title}
                                            fill
                                            className="object-cover image-hover-zoom"
                                            sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
                                            loading="lazy"
                                            quality={75}
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                                        <div className="absolute bottom-0 left-0 right-0 p-5">
                                            <span className="inline-block bg-terracotta/90 backdrop-blur-sm text-white text-[10px] font-inter font-bold uppercase tracking-wider px-2.5 py-1 rounded-full mb-2">
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
                                            {workshop.location}
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

                                    {/* Attendee feedback */}
                                    {workshop.feedbackHighlight && (
                                        <div className="px-5 pb-3">
                                            <div className="bg-cream-100 rounded-xl p-3.5 border border-clay/30">
                                                <p className="text-xs font-inter text-dark-secondary leading-relaxed italic line-clamp-2">
                                                    &ldquo;{workshop.feedbackHighlight}&rdquo;
                                                </p>
                                                {workshop.feedbackAuthor && (
                                                    <p className="text-[11px] font-inter text-dark-muted mt-1.5">
                                                        — {workshop.feedbackAuthor}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    )}

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
                                                                className="relative aspect-square rounded-xl overflow-hidden cursor-zoom-in group/thumb"
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
                                </motion.div>
                            ))}
                        </motion.div>
                    )}
                </div>
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

            <Footer />
            <MobileNav />
        </main>
    );
}
