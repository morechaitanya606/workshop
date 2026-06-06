"use client";

import type { ComponentProps } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Info, Loader2 } from "lucide-react";
import WorkshopCard from "@/components/WorkshopCard";
import { Skeleton } from "@/components/ui";
import type { Workshop } from "@/lib/data";
import { quickTransition } from "@/lib/motion-presets";

type MotionDivProps = ComponentProps<typeof motion.div>;

function SkeletonCard() {
    return (
        <div className="card-workshop">
            <Skeleton className="aspect-[4/3] rounded-none" />
            <div className="p-4 space-y-3">
                <Skeleton className="h-3 w-2/3 rounded-full" />
                <Skeleton className="h-4 w-full rounded-full" />
                <Skeleton className="h-3 w-1/2 rounded-full" />
                <div className="flex justify-between pt-2 border-t border-gray-100">
                    <Skeleton className="h-4 w-12 rounded-full" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                </div>
            </div>
        </div>
    );
}

export default function ExploreResultsSection({
    isPending,
    total,
    source,
    todayIso,
    errorBannerMotionProps,
    workshops,
    clearFilters,
    onRetry,
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
    source: "supabase" | "error";
    todayIso: string;
    errorBannerMotionProps: MotionDivProps;
    workshops: Workshop[];
    clearFilters: () => void;
    onRetry: () => void;
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

            {source === "error" && !isPending && (
                <motion.div
                    {...errorBannerMotionProps}
                    className="mb-5 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-inter text-red-700 sm:flex-row sm:items-center sm:justify-between"
                >
                    <div className="flex items-center gap-2">
                        <Info className="h-4 w-4 shrink-0" />
                        <span>Unable to load live workshops right now. Try again shortly.</span>
                    </div>
                    <button
                        type="button"
                        onClick={onRetry}
                        className="inline-flex items-center justify-center rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                    >
                        Try again
                    </button>
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
                        className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4 sm:gap-6"
                    >
                        {workshops.map((workshop, index) => (
                            <motion.div
                                key={`${workshop.id}-${index}`}
                                initial={
                                    prefersReducedMotion
                                        ? undefined
                                        : { opacity: 0, y: 18, scale: 0.98 }
                                }
                                animate={
                                    prefersReducedMotion
                                        ? undefined
                                        : { opacity: 1, y: 0, scale: 1 }
                                }
                                transition={
                                    prefersReducedMotion
                                        ? { duration: 0 }
                                        : { ...quickTransition, delay: index * 0.04 }
                                }
                            >
                                <WorkshopCard
                                    workshop={workshop}
                                    todayIso={todayIso}
                                    index={index}
                                    animateOnScroll={false}
                                />
                            </motion.div>
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
