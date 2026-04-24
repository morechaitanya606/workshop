"use client";

import { AnimatePresence, motion } from "framer-motion";
import WorkshopCard from "@/components/WorkshopCard";
import type { Workshop } from "@/lib/data";
import { fadeIn, quickTransition, useMotionProps } from "@/lib/motion-presets";
import { EmptyWorkshopState, SectionHeader } from "@/components/home/HomeSectionShared";

export default function WorkshopGridSection({
    title,
    eyebrow,
    sectionClassName,
    actionLabel = "View all",
    actionHref = "/explore",
    gridClassName,
    cardWrapperClassName,
    gridKeyPrefix,
    selectedCategory,
    todayIso,
    shouldReduceMotion,
    workshops,
    emptyTitle,
    emptyDescription,
    selectedCategoryLabel,
    onTryAnotherCategory,
}: {
    title: string;
    eyebrow?: string;
    sectionClassName?: string;
    actionLabel?: string;
    actionHref?: string;
    gridClassName?: string;
    cardWrapperClassName?: string;
    gridKeyPrefix: string;
    selectedCategory: string;
    todayIso: string;
    shouldReduceMotion: boolean;
    workshops: Workshop[];
    emptyTitle: string;
    emptyDescription: string;
    selectedCategoryLabel: string;
    onTryAnotherCategory: () => void;
}) {
    const gridSwapMotionProps = useMotionProps(shouldReduceMotion, fadeIn, quickTransition, {
        whileInView: false,
    });

    return (
        <section className={sectionClassName || "section-padding mt-20 sm:mt-16"}>
            <SectionHeader
                title={title}
                eyebrow={eyebrow}
                action={actionLabel}
                href={actionHref}
                reduceMotion={shouldReduceMotion}
            />
            <AnimatePresence mode="wait">
                <motion.div
                    key={`${gridKeyPrefix}-${selectedCategory}`}
                    {...gridSwapMotionProps}
                    exit={shouldReduceMotion ? undefined : { opacity: 0 }}
                    className={
                        gridClassName ||
                        "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(340px,350px))] justify-center gap-4 sm:gap-6"
                    }
                >
                    {workshops.length === 0 ? (
                        <EmptyWorkshopState
                            title={emptyTitle}
                            description={emptyDescription}
                            showTryAnotherCategory={Boolean(selectedCategoryLabel)}
                            onTryAnotherCategory={onTryAnotherCategory}
                        />
                    ) : (
                        workshops.map((workshop, index) => {
                            if (!cardWrapperClassName) {
                                return (
                                    <WorkshopCard
                                        key={workshop.id}
                                        workshop={workshop}
                                        todayIso={todayIso}
                                        index={index}
                                        animateOnScroll={false}
                                    />
                                );
                            }
                            return (
                                <div key={workshop.id} className={cardWrapperClassName}>
                                    <WorkshopCard
                                        workshop={workshop}
                                        todayIso={todayIso}
                                        index={index}
                                        animateOnScroll={false}
                                    />
                                </div>
                            );
                        })
                    )}
                </motion.div>
            </AnimatePresence>
        </section>
    );
}
