"use client";

import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import OptionalWidgetBoundary from "@/components/OptionalWidgetBoundary";
import { usePageIdle } from "@/lib/run-when-page-idle";

const SupportChatbot = dynamic(() => import("@/components/SupportChatbot"), { ssr: false });
const SurpriseBox = dynamic(() => import("@/components/SurpriseBox"), { ssr: false });

export default function GlobalFloatingWidgets() {
    // The chat and surprise launchers (and their scripts) wait until the page has loaded and the
    // browser is idle, so on a slow connection they do not compete with the page itself. They
    // look the same once shown. They render above every route's error.tsx, so each has its own
    // boundary: one whose script fails to download must not replace the page with an error screen.
    const isPageIdle = usePageIdle();

    if (!isPageIdle) {
        return null;
    }

    return createPortal(
        <>
            <OptionalWidgetBoundary name="surprise-box">
                <SurpriseBox />
            </OptionalWidgetBoundary>
            <OptionalWidgetBoundary name="support-chatbot">
                <SupportChatbot />
            </OptionalWidgetBoundary>
        </>,
        document.body
    );
}
