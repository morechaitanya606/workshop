"use client";

import { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Gift, X } from "lucide-react";
import { usePathname } from "next/navigation";
import Link from "next/link";

import { usePlatformSettings } from "@/lib/platform-settings-context";
import {
    formatSpecialPageDate,
    isSpecialPageActive,
    isSpecialPagePath,
    resolveSpecialPageSettings,
} from "@/lib/special-page";

export default function SurpriseBox() {
    const prefersReducedMotion = Boolean(useReducedMotion());
    const pathname = usePathname();
    const { settings, loading } = usePlatformSettings();
    const [showCard, setShowCard] = useState(false);
    const isWorkshopPage = pathname.startsWith("/workshop/");

    const specialPageSettings = resolveSpecialPageSettings(settings.special_page);
    const isPromotionActive = isSpecialPageActive(settings.special_page);

    const shouldHide =
        pathname.startsWith("/chatbot/embed") || isSpecialPagePath(pathname, settings.special_page);

    if (loading || shouldHide || !isPromotionActive) {
        return null;
    }

    const launcherPositionClass = isWorkshopPage
        ? "bottom-[calc(var(--floating-surprise-bottom)+6rem)] right-[var(--floating-edge-offset)] lg:bottom-[5.5rem] lg:right-[var(--floating-edge-offset)]"
        : "bottom-[var(--floating-surprise-bottom)] right-[var(--floating-edge-offset)] lg:bottom-[var(--floating-surprise-bottom)] lg:right-[var(--floating-edge-offset)]";

    return (
        <>
            <AnimatePresence>
                {!showCard && (
                    <motion.button
                        type="button"
                        onClick={() => setShowCard(true)}
                        initial={
                            prefersReducedMotion
                                ? { opacity: 0 }
                                : { opacity: 0, scale: 0.5, y: 20 }
                        }
                        animate={
                            prefersReducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }
                        }
                        exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.5 }}
                        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                        className={`fixed z-[69] ${launcherPositionClass}`}
                        aria-label={`${specialPageSettings.badge} - click to reveal`}
                    >
                        <motion.div
                            animate={
                                prefersReducedMotion
                                    ? undefined
                                    : {
                                          y: [0, -6, 0, -3, 0],
                                          rotate: [0, -5, 5, -3, 0],
                                      }
                            }
                            transition={{
                                duration: 2.5,
                                ease: "easeInOut",
                                repeat: Infinity,
                                repeatDelay: 1.5,
                            }}
                            className="relative"
                        >
                            <div
                                className="absolute inset-0 rounded-full bg-amber-400/30 animate-ping"
                                style={{ animationDuration: "2s" }}
                            />

                            <div className="relative flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-gradient-to-br from-amber-400 via-amber-500 to-orange-500 text-white shadow-[0_8px_24px_rgba(245,166,35,0.45)] transition-transform hover:scale-110 active:scale-95">
                                <Gift className="h-5 w-5" />
                            </div>

                            <div className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-white bg-red-500 animate-pulse" />
                        </motion.div>
                    </motion.button>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showCard && (
                    <motion.div
                        initial={
                            prefersReducedMotion
                                ? { opacity: 0 }
                                : { opacity: 0, y: 20, scale: 0.9 }
                        }
                        animate={
                            prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }
                        }
                        exit={
                            prefersReducedMotion
                                ? { opacity: 0 }
                                : { opacity: 0, y: 20, scale: 0.9 }
                        }
                        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                        className={`fixed z-[69] w-[min(calc(100vw-2rem),300px)] ${launcherPositionClass}`}
                    >
                        <div
                            className="relative overflow-hidden rounded-2xl border border-amber-200/70 p-5 shadow-[0_16px_48px_rgba(245,166,35,0.25)]"
                            style={{
                                background:
                                    "linear-gradient(145deg, #FFF8EE 0%, #FFFDF7 50%, #FFF3E0 100%)",
                            }}
                        >
                            <button
                                type="button"
                                onClick={() => setShowCard(false)}
                                className="absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-amber-700 transition-colors hover:bg-amber-200"
                                aria-label="Close special page card"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>

                            <div className="pointer-events-none absolute right-0 top-0 h-20 w-20 rounded-bl-[60px] bg-gradient-to-bl from-amber-200/30 to-transparent" />

                            <div className="relative z-10">
                                <div className="mb-2.5 flex items-center gap-2">
                                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                                        <Gift className="h-4 w-4" />
                                    </span>
                                    <span className="text-[11px] font-inter font-bold uppercase tracking-wider text-amber-600">
                                        {specialPageSettings.badge}
                                    </span>
                                </div>

                                <h4 className="mb-1.5 font-playfair text-lg font-bold leading-snug text-amber-950">
                                    {specialPageSettings.title}
                                </h4>

                                <p className="mb-2 text-xs font-inter leading-relaxed text-amber-800/65">
                                    {specialPageSettings.description}
                                </p>

                                <p className="mb-4 text-[11px] font-inter font-medium uppercase tracking-wider text-amber-700/80">
                                    Event on{" "}
                                    {formatSpecialPageDate(specialPageSettings.visibleUntil)}
                                </p>

                                <Link
                                    href={specialPageSettings.path}
                                    onClick={() => setShowCard(false)}
                                    className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-inter font-semibold text-white shadow-md transition-all hover:scale-[1.03] active:scale-[0.97]"
                                    style={{
                                        background:
                                            "linear-gradient(135deg, #F5A623 0%, #C97A10 100%)",
                                    }}
                                >
                                    <Gift className="h-3.5 w-3.5" />
                                    {specialPageSettings.ctaLabel}
                                </Link>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
