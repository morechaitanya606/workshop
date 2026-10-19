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

export const routeEnterTransition: Transition = {
    duration: 0.32,
    ease: EASE_OUT,
};

export const routeExitTransition: Transition = {
    duration: 0.22,
    ease: EASE_IN,
};

/*
 * Scroll reveals never start transparent. The "hidden" state is serialised into the server HTML
 * as an inline style and only cleared once React has hydrated and the element is in view, so an
 * `opacity: 0` here left phones looking at blank sections (and photos that had already loaded)
 * for several seconds, or for good if a chunk failed. Content is therefore always visible and
 * only settles into place with a small transform (see template.tsx for the same rule).
 */
export const fadeIn: Variants = {
    hidden: { opacity: 1 },
    visible: { opacity: 1 },
};

export const fadeInUp: Variants = {
    hidden: { y: 16 },
    visible: { y: 0 },
};

export const scaleIn: Variants = {
    hidden: { scale: 0.97 },
    visible: { scale: 1 },
};

export const cardReveal: Variants = {
    hidden: { y: 14, scale: 0.99 },
    visible: { y: 0, scale: 1 },
};

export const slideInRight: Variants = {
    hidden: { x: 24 },
    visible: { x: 0 },
};

export const slideInLeft: Variants = {
    hidden: { x: -24 },
    visible: { x: 0 },
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

/**
 * Reveal as soon as any part is on screen. A fraction (it was 0.18) can never be reached by a
 * block taller than the viewport divided by that fraction -- e.g. a 4,500px grid on a phone --
 * so such blocks never revealed at all.
 */
export const revealViewport: ViewportOptions = {
    once: true,
    amount: "some",
};

const revealPresets: Record<RevealPreset, Variants> = {
    fade: fadeIn,
    "fade-up": fadeInUp,
    "slide-left": slideInLeft,
    "slide-right": slideInRight,
    zoom: scaleIn,
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

    // Same variants and triggers with reduced motion, just no duration. The preference is only
    // known after hydration, and swapping the variants then (to an opacity-only set) left the
    // element frozen in its server-rendered "hidden" state. MotionProvider's
    // `<MotionConfig reducedMotion="user">` already makes transform changes instant.
    return {
        variants,
        initial: "hidden" as const,
        ...(shouldUseWhileInView
            ? { whileInView: "visible" as const, viewport }
            : { animate: "visible" as const }),
        transition: reduceMotion ? { duration: 0 } : { ...transition, delay },
    };
}
