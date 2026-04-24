"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const SupportChatbot = dynamic(() => import("@/components/SupportChatbot"), { ssr: false });
const SurpriseBox = dynamic(() => import("@/components/SurpriseBox"), { ssr: false });

export default function GlobalFloatingWidgets() {
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    if (!isMounted) {
        return null;
    }

    return createPortal(
        <>
            <SurpriseBox />
            <SupportChatbot />
        </>,
        document.body
    );
}
