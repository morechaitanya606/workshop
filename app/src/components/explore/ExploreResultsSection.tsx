"use client";

import type { ComponentProps } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Info, Loader2 } from "lucide-react";
import WorkshopCard from "@/components/WorkshopCard";
import type { Workshop } from "@/lib/data";

type MotionDivProps = ComponentProps<typeof motion.div>;

function SkeletonCard() {
    return (
        <div className="card-workshop">
            <div className="aspect-[4/3] shimmer" />
            <div className="p-4 space-y-3">
                <div className="h-3 shimmer rounded w-2/3" />
                <div className="h-4 shimmer rounded w-full" />
                <div className="h-3 shimmer rounded w-1/2" />
                <div className="flex justify-between pt-2 border-t border-gray-100">
                    <div className="h-4 shimmer rounded w-12" />
                    <div className="h-5 shimmer rounded w-16" />
                </div>
            </div>
        </div>
    );
}

export default function ExploreResultsSection({
    isPending,
    total,
    source,
    mockBannerMotionProps,
    workshops,
    clearFilters,
    gridKey,
    gridMotionProps,
    prefersReducedMotion,
    totalPages,
    currentPage,
    onPrevious,
    onNext,
}: {
    isPending: boolean;
    total: number;
    source: "supabase" | "mock" | "error";
    mockBannerMotionProps: MotionDivProps;
    workshops: Workshop[];
    clearFilters: () => void;
    gridKey: string;
    gridMotionProps: MotionDivProps;
    prefersReducedMotion: boolean;
    totalPages: number;
    currentPage: number;
    onPrevious: () => void;
    onNext: () => void;
}) {
    return (
        <section className="section-padding mt-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-5">
                <p className="text-sm font-inter text-dark-muted flex items-center gap-2">
                    {isPending && <Loader2 className="w-4 h-4 animate-spin text-terracotta" />}
                    {isPending ? "Updating..." : `${total} workshop${total === 1 ? "" : "s"} found`}
                </p>
            </div>

            {source === "mock" && !isPending && (
                <motion.div
                    {...mockBannerMotionProps}
                    className="mb-5 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-inter text-amber-900"
                >
                    <Info className="h-4 w-4" />
                    Showing sample workshops - live data unavailable.
                </motion.div>
            )}
            {source === "error" && !isPending && (
                <motion.div
                    {...mockBannerMotionProps}
                    className="mb-5 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-inter text-red-700"
                >
                    <Info className="h-4 w-4" />
                    Unable to load live workshops right now. Try again shortly.
                </motion.div>
            )}

            {!isPending && workshops.length === 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-8 text-center">
                    <h2 className="heading-sm mb-2">No workshops match your filters</h2>
                    <p className="text-body text-dark-muted mb-6">
                        Try broadening your search or resetting filters.
                    </p>
                    <button type="button" onClick={clearFilters} className="btn-primary">
                        Reset Filters
                    </button>
                </div>
            )}

            {isPending && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                    {Array.from({ length: 8 }).map((_, index) => (
                        <SkeletonCard key={index} />
                    ))}
                </div>
            )}

            {!isPending && workshops.length > 0 && (
                <AnimatePresence mode="wait">
                    <motion.div
                        key={gridKey}
                        {...gridMotionProps}
                        exit={prefersReducedMotion ? undefined : { opacity: 0 }}
                        className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6"
                    >
                        {workshops.map((workshop, index) => (
                            <WorkshopCard
                                key={`${workshop.id}-${index}`}
                                workshop={workshop}
                                index={index}
                                animateOnScroll={false}
                            />
                        ))}
                    </motion.div>
                </AnimatePresence>
            )}

            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 mt-10">
                    <button
                        type="button"
                        onClick={onPrevious}
                        disabled={currentPage <= 1 || isPending}
                        className="btn-secondary !py-2 !px-4 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        Previous
                    </button>
                    <span className="text-sm font-inter text-dark-muted">
                        Page {currentPage} of {totalPages}
                    </span>
                    <button
                        type="button"
                        onClick={onNext}
                        disabled={currentPage >= totalPages || isPending}
                        className="btn-secondary !py-2 !px-4 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        Next
                    </button>
                </div>
            )}
        </section>
    );
}
