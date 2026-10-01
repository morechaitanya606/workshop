"use client";

import { useEffect, useState } from "react";

/**
 * Hydration-safe replacement for framer-motion's `useReducedMotion`.
 *
 * framer's hook returns `null` on the server but the real media-query value on the client's very
 * first render, so any markup derived from it (initial styles, variants, conditional elements)
 * differs between server HTML and hydration for visitors who prefer reduced motion. This hook
 * always reports `false` for the first render -- matching the server -- and then reads the real
 * preference in an effect and follows later changes.
 */
export function usePrefersReducedMotion(): boolean {
    const [reduced, setReduced] = useState(false);

    useEffect(() => {
        const query = window.matchMedia("(prefers-reduced-motion: reduce)");
        const update = () => setReduced(query.matches);

        update();
        query.addEventListener("change", update);
        return () => query.removeEventListener("change", update);
    }, []);

    return reduced;
}
