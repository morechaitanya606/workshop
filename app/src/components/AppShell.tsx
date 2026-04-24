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
            <main id="main-content" className="flex-1 pb-20 lg:pb-8">
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
