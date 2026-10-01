"use client";

import { MotionConfig } from "framer-motion";

/**
 * Only `MotionConfig` is kept. `LazyMotion` has no effect while components import the full
 * `motion` component (rather than the slim `m`), and it only added `domAnimation` to the root
 * bundle on top of the features `motion` already bundles itself.
 */
export default function MotionProvider({ children }: { children: React.ReactNode }) {
    return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
