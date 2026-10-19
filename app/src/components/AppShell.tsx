"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

import MobileNav from "@/components/MobileNav";
import Navbar from "@/components/Navbar";
const BackToTop = dynamic(() => import("@/components/ui/BackToTop"), { ssr: false });
const ScrollProgress = dynamic(() => import("@/components/ui/ScrollProgress"), { ssr: false });
const CommandPalette = dynamic(() => import("@/components/ui/CommandPalette"), { ssr: false });
const CookieConsentBanner = dynamic(() => import("@/components/CookieConsentBanner"), {
    ssr: false,
});

export default function AppShell({ children }: { children: ReactNode }) {
    return (
        <>
            <Navbar />
            {/* Bottom padding = the fixed bottom nav's height on phones and 0 from md up (see
                --mobile-nav-height). It was a flat 80px (32px on desktop), which left an empty
                band under the footer on every page, and on tablets where there is no bottom nav. */}
            <main id="main-content" className="flex-1 pb-[var(--mobile-nav-height)]">
                {children}
            </main>
            <MobileNav />
            <CookieConsentBanner />
            <BackToTop />
            <ScrollProgress />
            <CommandPalette />
        </>
    );
}
