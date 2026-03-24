"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";
import { pageTransitionVariants } from "@/lib/motion-presets";

export default function PageTransition({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const shouldReduceMotion = Boolean(useReducedMotion());

    if (shouldReduceMotion) {
        return <div className="page-transition-shell">{children}</div>;
    }

    return (
        <AnimatePresence initial={false} mode="wait">
            <motion.div
                key={pathname}
                className="page-transition-shell"
                variants={pageTransitionVariants}
                initial="initial"
                animate="animate"
                exit="exit"
            >
                {children}
            </motion.div>
        </AnimatePresence>
    );
}
