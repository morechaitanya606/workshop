"use client";

import { motion, type Transition } from "framer-motion";
import { usePrefersReducedMotion } from "@/lib/use-reduced-motion";
import { getRevealVariants, standardTransition, type RevealPreset } from "@/lib/motion-presets";
import { cn } from "@/lib/utils";

interface RevealGroupProps {
    children: React.ReactNode;
    className?: string;
    once?: boolean;
    /** Share of the group that must be on screen; "some" (the default) means any part of it. */
    amount?: number | "some" | "all";
    stagger?: number;
    delayChildren?: number;
}

interface RevealItemProps {
    children: React.ReactNode;
    className?: string;
    preset?: RevealPreset;
    transition?: Transition;
    delay?: number;
}

export function RevealGroup({
    children,
    className,
    once = true,
    amount = "some",
    stagger = 0.08,
    delayChildren = 0.04,
}: RevealGroupProps) {
    const shouldReduceMotion = usePrefersReducedMotion();

    // Always the same element and triggers: the reduced-motion preference is only known after
    // hydration, and switching to a plain <div> then froze the items in their server-rendered
    // "hidden" state. With reduced motion the items simply settle at once.
    return (
        <motion.div
            className={className}
            initial="hidden"
            whileInView="visible"
            viewport={{ once, amount }}
            variants={{
                hidden: {},
                visible: {
                    transition: shouldReduceMotion
                        ? {}
                        : {
                              delayChildren,
                              staggerChildren: stagger,
                          },
                },
            }}
        >
            {children}
        </motion.div>
    );
}

export function RevealItem({
    children,
    className,
    preset = "fade-up",
    transition = standardTransition,
    delay = 0,
}: RevealItemProps) {
    const shouldReduceMotion = usePrefersReducedMotion();

    return (
        <motion.div
            className={cn(className)}
            variants={getRevealVariants(preset)}
            transition={shouldReduceMotion ? { duration: 0 } : { ...transition, delay }}
        >
            {children}
        </motion.div>
    );
}
