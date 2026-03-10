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
    gridKeyPrefix,
    selectedCategory,
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
    gridKeyPrefix: string;
    selectedCategory: string;
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
                    className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6"
                >
                    {workshops.length === 0 ? (
                        <EmptyWorkshopState
                            title={emptyTitle}
                            description={emptyDescription}
                            showTryAnotherCategory={Boolean(selectedCategoryLabel)}
                            onTryAnotherCategory={onTryAnotherCategory}
                        />
                    ) : (
                        workshops.map((workshop, index) => (
                            <WorkshopCard
                                key={workshop.id}
                                workshop={workshop}
                                index={index}
                                animateOnScroll={false}
                            />
                        ))
                    )}
                </motion.div>
            </AnimatePresence>
        </section>
    );
}
