import type { Transition, Variants } from "framer-motion";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

export const standardTransition: Transition = {
    duration: 0.6,
    ease: EASE_OUT,
};

export const quickTransition: Transition = {
    duration: 0.35,
    ease: EASE_OUT,
};

export const fadeInUp: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
};

export const fadeIn: Variants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
};

export const scaleIn: Variants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: { opacity: 1, scale: 1 },
};

export const slideInRight: Variants = {
    hidden: { opacity: 0, x: 30 },
    visible: { opacity: 1, x: 0 },
};

export const staggerContainer: Variants = {
    hidden: {},
    visible: {
        transition: {
            staggerChildren: 0.08,
        },
    },
};

export const revealViewport = {
    once: true,
    amount: 0.25,
};
