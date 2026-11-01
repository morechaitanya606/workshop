"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

import MobileNav from "@/components/MobileNav";
import Navbar from "@/components/Navbar";
import OptionalWidgetBoundary from "@/components/OptionalWidgetBoundary";
import { usePageIdle } from "@/lib/run-when-page-idle";
const BackToTop = dynamic(() => import("@/components/ui/BackToTop"), { ssr: false });
const ScrollProgress = dynamic(() => import("@/components/ui/ScrollProgress"), { ssr: false });
const CommandPalette = dynamic(() => import("@/components/ui/CommandPalette"), { ssr: false });
const CookieConsentBanner = dynamic(() => import("@/components/CookieConsentBanner"), {
    ssr: false,
});

export default function AppShell({ children }: { children: ReactNode }) {
    // Scroll progress, back-to-top and the Ctrl+K palette are extras: they (and their chunks)
    // wait until the page has loaded and the browser is idle, and look the same once shown. Each
    // sits in its own boundary: one whose script fails to download just does not appear.
    const showExtras = usePageIdle();

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
            <OptionalWidgetBoundary name="cookie-consent">
                <CookieConsentBanner />
            </OptionalWidgetBoundary>
            {showExtras && (
                <>
                    <OptionalWidgetBoundary name="back-to-top">
                        <BackToTop />
                    </OptionalWidgetBoundary>
                    <OptionalWidgetBoundary name="scroll-progress">
                        <ScrollProgress />
                    </OptionalWidgetBoundary>
                    <OptionalWidgetBoundary name="command-palette">
                        <CommandPalette />
                    </OptionalWidgetBoundary>
                </>
            )}
        </>
    );
}
