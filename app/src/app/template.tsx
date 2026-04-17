"use client";

import { motion, useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";

import { usePlatformSettings } from "@/lib/platform-settings-context";
import { isSpecialPagePath } from "@/lib/special-page";

export default function Template({ children }: { children: React.ReactNode }) {
    const prefersReducedMotion = Boolean(useReducedMotion());
    const pathname = usePathname();
    const { settings } = usePlatformSettings();
    const shouldBypassAnimation =
        prefersReducedMotion || isSpecialPagePath(pathname, settings.special_page);

    if (shouldBypassAnimation) {
        return <>{children}</>;
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="page-transition-shell"
        >
            {children}
        </motion.div>
    );
}
