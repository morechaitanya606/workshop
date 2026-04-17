"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

import CookieConsentBanner from "@/components/CookieConsentBanner";
import MobileNav from "@/components/MobileNav";
import Navbar from "@/components/Navbar";
import SupportChatbot from "@/components/SupportChatbot";
import SurpriseBox from "@/components/SurpriseBox";
const BackToTop = dynamic(() => import("@/components/ui/BackToTop"), { ssr: false });
const ScrollProgress = dynamic(() => import("@/components/ui/ScrollProgress"), { ssr: false });
const CommandPalette = dynamic(() => import("@/components/ui/CommandPalette"), { ssr: false });

export default function AppShell({ children }: { children: ReactNode }) {
    return (
        <>
            <Navbar />
            <main id="main-content" className="flex-1 pb-20 lg:pb-8">
                {children}
            </main>
            <MobileNav />
            <SurpriseBox />
            <SupportChatbot />
            <CookieConsentBanner />
            <BackToTop />
            <ScrollProgress />
            <CommandPalette />
        </>
    );
}
