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

export const slowTransition: Transition = {
    duration: 0.8,
    ease: EASE_OUT,
};

export const slowBounce: Transition = {
    duration: 3,
    repeat: Infinity,
    ease: "easeInOut",
};

export const fadeIn: Variants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
};

export const fadeInUp: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
};

export const fadeUp = fadeInUp;

export const scaleIn: Variants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: { opacity: 1, scale: 1 },
};

export const cardReveal: Variants = {
    hidden: { opacity: 0, scale: 0.97 },
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

export const staggerFast: Variants = {
    hidden: {},
    visible: {
        transition: {
            staggerChildren: 0.04,
        },
    },
};

export const revealViewport = {
    once: true,
    amount: 0.25,
};

export const reducedMotionFade: Variants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
};

type MotionPropsOptions = {
    whileInView?: boolean;
    delay?: number;
};

export function useMotionProps(
    reduceMotion: boolean | null,
    variants: Variants = fadeInUp,
    transition: Transition = standardTransition,
    options?: MotionPropsOptions
) {
    const shouldUseWhileInView = options?.whileInView ?? true;
    const delay = options?.delay ?? 0;

    if (reduceMotion) {
        return {
            variants: reducedMotionFade,
            initial: "hidden" as const,
            ...(shouldUseWhileInView
                ? { whileInView: "visible" as const, viewport: revealViewport }
                : { animate: "visible" as const }),
            transition: { duration: 0.3, delay },
        };
    }

    return {
        variants,
        initial: "hidden" as const,
        ...(shouldUseWhileInView
            ? { whileInView: "visible" as const, viewport: revealViewport }
            : { animate: "visible" as const }),
        transition: { ...transition, delay },
    };
}

// Backward-compatible alias for existing imports.
export const getMotionProps = useMotionProps;
