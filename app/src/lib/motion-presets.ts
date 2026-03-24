import type { Transition, Variants } from "framer-motion";

type ViewportOptions = {
    once?: boolean;
    margin?: string;
    amount?: "some" | "all" | number;
};

const EASE_OUT = [0.22, 1, 0.36, 1] as const;
const EASE_IN = [0.4, 0, 1, 1] as const;

export type RevealPreset = "fade" | "fade-up" | "slide-left" | "slide-right" | "zoom";

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

export const routeEnterTransition: Transition = {
    duration: 0.32,
    ease: EASE_OUT,
};

export const routeExitTransition: Transition = {
    duration: 0.22,
    ease: EASE_IN,
};

export const routeTransition = routeEnterTransition;

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

export const zoomIn = scaleIn;

export const cardReveal: Variants = {
    hidden: { opacity: 0, y: 18, scale: 0.98 },
    visible: { opacity: 1, y: 0, scale: 1 },
};

export const slideInRight: Variants = {
    hidden: { opacity: 0, x: 30 },
    visible: { opacity: 1, x: 0 },
};

export const slideInLeft: Variants = {
    hidden: { opacity: 0, x: -30 },
    visible: { opacity: 1, x: 0 },
};

export const pageTransitionVariants: Variants = {
    initial: { opacity: 0, y: 18, scale: 0.992 },
    animate: { opacity: 1, y: 0, scale: 1, transition: routeEnterTransition },
    exit: { opacity: 0, y: -10, scale: 0.996, transition: routeExitTransition },
};

export const staggerContainer: Variants = {
    hidden: {},
    visible: {
        transition: {
            delayChildren: 0.04,
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

export const staggerRelaxed: Variants = {
    hidden: {},
    visible: {
        transition: {
            delayChildren: 0.06,
            staggerChildren: 0.12,
        },
    },
};

export const staggerItem: Variants = cardReveal;

export const revealViewport: ViewportOptions = {
    once: true,
    amount: 0.18,
};

export const reducedMotionFade: Variants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
};

const revealPresets: Record<RevealPreset, Variants> = {
    fade: fadeIn,
    "fade-up": fadeInUp,
    "slide-left": slideInLeft,
    "slide-right": slideInRight,
    zoom: zoomIn,
};

export function getRevealVariants(preset: RevealPreset = "fade-up") {
    return revealPresets[preset];
}

type MotionPropsOptions = {
    whileInView?: boolean;
    delay?: number;
    viewport?: ViewportOptions;
};

export function useMotionProps(
    reduceMotion: boolean | null,
    variants: Variants = fadeInUp,
    transition: Transition = standardTransition,
    options?: MotionPropsOptions
) {
    const shouldUseWhileInView = options?.whileInView ?? true;
    const delay = options?.delay ?? 0;
    const viewport = { ...revealViewport, ...(options?.viewport ?? {}) };

    if (reduceMotion) {
        return {
            variants: reducedMotionFade,
            initial: "hidden" as const,
            ...(shouldUseWhileInView
                ? { whileInView: "visible" as const, viewport }
                : { animate: "visible" as const }),
            transition: { duration: 0.3, delay },
        };
    }

    return {
        variants,
        initial: "hidden" as const,
        ...(shouldUseWhileInView
            ? { whileInView: "visible" as const, viewport }
            : { animate: "visible" as const }),
        transition: { ...transition, delay },
    };
}

// Backward-compatible alias for existing imports.
export const getMotionProps = useMotionProps;
