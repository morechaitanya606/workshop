"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { usePrefersReducedMotion } from "@/lib/use-reduced-motion";
import { ArrowRight, BellRing } from "lucide-react";
import { slideInRight, standardTransition } from "@/lib/motion-presets";
import { formatWorkshopDate } from "@/lib/seo";
import { formatDate } from "@/lib/utils";

export interface WorkshopPastEventSidebarProps {
    workshopDate: string;
    formattedWorkshopTime: string;
    /** The venue, or the area when the venue field holds a link; may be empty. */
    workshopLocation: string;
    workshopCity: string;
    /** The next date of this workshop, or its activity page: a past page should lead somewhere. */
    nextStep?: { href: string; label: string } | null;

    notifyState: { similar: boolean; creator: boolean };
    notifyLoadingMode: "similar" | "creator" | null;
    notifyMessage: string | null;
    notifyError: string | null;
    onPastNotify: (mode: "similar" | "creator") => void;
}

export default function WorkshopPastEventSidebar({
    workshopDate,
    formattedWorkshopTime,
    workshopLocation,
    workshopCity,
    nextStep = null,

    notifyState,
    notifyLoadingMode,
    notifyMessage,
    notifyError,
    onPastNotify,
}: WorkshopPastEventSidebarProps) {
    const prefersReducedMotion = usePrefersReducedMotion();
    const place = [workshopLocation, workshopCity]
        .map((part) => part?.trim())
        .filter(Boolean)
        .join(", ");

    return (
        <motion.div
            variants={slideInRight}
            initial={"hidden"}
            animate={"visible"}
            transition={
                prefersReducedMotion ? { duration: 0 } : { ...standardTransition, delay: 0.3 }
            }
            className="min-[900px]:sticky min-[900px]:top-28 min-[900px]:max-h-[calc(100vh-8rem)] min-[900px]:overflow-y-auto bg-white rounded-2xl shadow-card p-6 border border-clay/50"
        >
            <div className="inline-flex items-center gap-2 bg-terracotta/10 text-terracotta text-xs font-inter font-bold uppercase tracking-wider px-3 py-1.5 rounded-full mb-4">
                Past Event
            </div>
            {/* With the year: a past date without one reads as this year's. */}
            <p className="text-sm font-inter text-dark-muted mb-5">
                {formatWorkshopDate(workshopDate) || formatDate(workshopDate)} &bull;{" "}
                {formattedWorkshopTime}
                {place ? <> &bull; {place}</> : null}
            </p>

            {nextStep && (
                <Link
                    href={nextStep.href}
                    className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-terracotta/30 bg-terracotta/5 px-4 py-3 text-sm font-inter font-semibold text-terracotta transition-colors hover:bg-terracotta/10"
                >
                    <span>{nextStep.label}</span>
                    <ArrowRight className="h-4 w-4 shrink-0" />
                </Link>
            )}

            <div className="space-y-3">
                <button
                    onClick={() => onPastNotify("similar")}
                    disabled={notifyLoadingMode !== null}
                    className={`w-full inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-inter font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${notifyState.similar ? "bg-emerald-100 text-emerald-700 border border-emerald-300" : "bg-terracotta text-white hover:bg-terracotta-600"}`}
                >
                    <BellRing className="w-4 h-4" />
                    {notifyLoadingMode === "similar"
                        ? "Saving..."
                        : notifyState.similar
                          ? "Similar Event Alerts On"
                          : "Notify Similar Event"}
                </button>
                <button
                    onClick={() => onPastNotify("creator")}
                    disabled={notifyLoadingMode !== null}
                    className={`w-full inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-inter font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${notifyState.creator ? "bg-emerald-100 text-emerald-700 border border-emerald-300" : "bg-white text-dark-secondary border border-gray-200 hover:border-terracotta hover:text-terracotta"}`}
                >
                    <BellRing className="w-4 h-4" />
                    {notifyLoadingMode === "creator"
                        ? "Saving..."
                        : notifyState.creator
                          ? "Creator Alerts On"
                          : "Notify Creator Event"}
                </button>
            </div>
            {notifyMessage && (
                <p className="mt-4 text-xs font-inter text-emerald-700">{notifyMessage}</p>
            )}
            {notifyError && <p className="mt-2 text-xs font-inter text-red-600">{notifyError}</p>}
        </motion.div>
    );
}
