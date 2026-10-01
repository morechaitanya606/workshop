"use client";

import { usePathname } from "next/navigation";

import { usePlatformSettings } from "@/lib/platform-settings-context";
import { isSpecialPagePath } from "@/lib/special-page";

/**
 * Re-mounts on every navigation, so the CSS fade on `.page-transition-shell` replays per page.
 *
 * The fade is pure CSS on purpose: a JS-driven `initial={{ opacity: 0 }}` is serialised into the
 * server HTML, which leaves the whole page invisible until React hydrates (and permanently if the
 * bundle fails to load). `prefers-reduced-motion` is handled in globals.css, so there is no
 * client-only preference read to cause a hydration mismatch either.
 */
export default function Template({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const { settings } = usePlatformSettings();

    if (isSpecialPagePath(pathname, settings.special_page)) {
        return <>{children}</>;
    }

    return <div className="page-transition-shell">{children}</div>;
}
