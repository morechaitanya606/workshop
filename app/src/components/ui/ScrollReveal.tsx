"use client";

import { motion, useReducedMotion, Variants, Transition } from "framer-motion";
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
    amount?: number;
}

export default function ScrollReveal({
    children,
    className = "",
    preset = "fade-up",
    variants = fadeInUp,
    transition = standardTransition,
    delay = 0,
    once = true,
    amount = 0.18,
}: ScrollRevealProps) {
    const shouldReduceMotion = Boolean(useReducedMotion());
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
