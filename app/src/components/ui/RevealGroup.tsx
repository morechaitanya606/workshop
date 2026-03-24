"use client";

import { motion, useReducedMotion, type Transition } from "framer-motion";
import {
    getRevealVariants,
    reducedMotionFade,
    standardTransition,
    type RevealPreset,
} from "@/lib/motion-presets";
import { cn } from "@/lib/utils";

interface RevealGroupProps {
    children: React.ReactNode;
    className?: string;
    once?: boolean;
    amount?: number;
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
    amount = 0.16,
    stagger = 0.08,
    delayChildren = 0.04,
}: RevealGroupProps) {
    const shouldReduceMotion = Boolean(useReducedMotion());

    if (shouldReduceMotion) {
        return <div className={className}>{children}</div>;
    }

    return (
        <motion.div
            className={className}
            initial="hidden"
            whileInView="visible"
            viewport={{ once, amount }}
            variants={{
                hidden: {},
                visible: {
                    transition: {
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
    const shouldReduceMotion = Boolean(useReducedMotion());

    return (
        <motion.div
            className={cn(className)}
            variants={shouldReduceMotion ? reducedMotionFade : getRevealVariants(preset)}
            transition={shouldReduceMotion ? { duration: 0.2, delay } : { ...transition, delay }}
        >
            {children}
        </motion.div>
    );
}
