"use client";

import { usePathname } from "next/navigation";

/**
 * When Vercel regenerates the ISR homepage in the background, `usePathname()` reports "/index" on
 * the server while the browser reports "/". Anything derived from it (the footer variant, the
 * active nav tab, the transparent home header) then differs between the server HTML and the first
 * client render, React throws hydration error #418 and re-renders the whole page in the browser.
 */
export function normalizePathname(pathname: string): string {
    return pathname === "/index" ? "/" : pathname;
}

/** `usePathname()` with the ISR "/index" alias folded back into "/". */
export function useSitePathname(): string {
    return normalizePathname(usePathname());
}
