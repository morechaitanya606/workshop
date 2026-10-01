"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { readCookieConsent, writeCookieConsent, type CookieConsent } from "@/lib/cookie-consent";

export default function CookieConsentBanner() {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        // Only show the banner while the visitor has not made a choice yet.
        if (!readCookieConsent()) {
            setIsVisible(true);
        }
    }, []);

    const choose = (consent: CookieConsent) => {
        // Persistence is best effort (Safari private mode throws on write); the choice still
        // applies for this page view because the event below is dispatched either way.
        writeCookieConsent(consent);
        setIsVisible(false);
    };

    if (!isVisible) return null;

    return (
        <div
            role="region"
            aria-label="Cookie preferences"
            className="fixed bottom-0 left-0 right-0 z-[100] border-t border-gray-200 bg-white p-4 shadow-lg md:bottom-4 md:left-4 md:right-auto md:max-w-md md:rounded-2xl md:border"
        >
            <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                    <h3 className="text-sm font-semibold text-dark font-inter">We use cookies</h3>
                    <p className="mt-1 text-xs text-dark-muted font-inter">
                        We use cookies to improve your experience, measure analytics, and show
                        relevant workshops. Analytics only runs if you accept.
                    </p>
                    <div className="mt-3 flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => choose("accepted")}
                            className="rounded-lg bg-terracotta px-4 py-2 text-xs font-semibold text-white hover:bg-terracotta-700 transition-colors"
                        >
                            Accept all
                        </button>
                        <button
                            type="button"
                            onClick={() => choose("declined")}
                            className="rounded-lg border border-gray-200 px-4 py-2 text-xs font-semibold text-dark hover:bg-gray-50 transition-colors"
                        >
                            Decline optional
                        </button>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => choose("declined")}
                    aria-label="Dismiss and decline optional cookies"
                    className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                >
                    <X className="h-5 w-5" />
                </button>
            </div>
        </div>
    );
}
