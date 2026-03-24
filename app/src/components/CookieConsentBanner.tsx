"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";

export default function CookieConsentBanner() {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        // Check if user has already consented
        const hasConsented = localStorage.getItem("cookie_consent");
        if (!hasConsented) {
            setIsVisible(true);
        }
    }, []);

    const acceptCookies = () => {
        localStorage.setItem("cookie_consent", "true");
        setIsVisible(false);
    };

    if (!isVisible) return null;

    return (
        <div className="fixed bottom-0 left-0 right-0 z-[100] border-t border-gray-200 bg-white p-4 shadow-lg md:bottom-4 md:left-4 md:right-auto md:max-w-md md:rounded-2xl md:border">
            <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                    <h3 className="text-sm font-semibold text-dark font-inter">We use cookies</h3>
                    <p className="mt-1 text-xs text-dark-muted font-inter">
                        We use cookies to improve your experience, measure analytics, and show
                        relevant workshops. By continuing to use our site, you accept our use of
                        cookies.
                    </p>
                    <div className="mt-3 flex items-center gap-3">
                        <button
                            onClick={acceptCookies}
                            className="rounded-lg bg-terracotta px-4 py-2 text-xs font-semibold text-white hover:bg-terracotta-dark transition-colors"
                        >
                            Accept all
                        </button>
                        <button
                            onClick={() => setIsVisible(false)}
                            className="rounded-lg border border-gray-200 px-4 py-2 text-xs font-semibold text-dark hover:bg-gray-50 transition-colors"
                        >
                            Decline optional
                        </button>
                    </div>
                </div>
                <button
                    onClick={() => setIsVisible(false)}
                    aria-label="Close message"
                    className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                >
                    <X className="h-5 w-5" />
                </button>
            </div>
        </div>
    );
}
