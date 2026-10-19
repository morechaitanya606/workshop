"use client";

import { motion, Variants, Transition } from "framer-motion";
import { usePrefersReducedMotion } from "@/lib/use-reduced-motion";
import {
    useMotionProps,
    fadeInUp,
    getRevealVariants,
    standardTransition,
    type RevealPreset,
} from "@/lib/motion-presets";

interface ScrollRevealProps {
    children: React.ReactNode;
    className?: string;
    preset?: RevealPreset;
    variants?: Variants;
    transition?: Transition;
    delay?: number;
    once?: boolean;
    /** Share of the block that must be on screen; "some" (the default) means any part of it. */
    amount?: number | "some" | "all";
}

export default function ScrollReveal({
    children,
    className = "",
    preset = "fade-up",
    variants = fadeInUp,
    transition = standardTransition,
    delay = 0,
    once = true,
    amount = "some",
}: ScrollRevealProps) {
    const shouldReduceMotion = usePrefersReducedMotion();
    const resolvedVariants = variants === fadeInUp ? getRevealVariants(preset) : variants;
    const motionProps = useMotionProps(shouldReduceMotion, resolvedVariants, transition, {
        whileInView: true,
        delay,
        viewport: {
            once,
            amount,
        },
    });

    return (
        <motion.div {...motionProps} className={className}>
            {children}
        </motion.div>
    );
}
