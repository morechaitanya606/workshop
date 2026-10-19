"use client";

import { motion } from "framer-motion";
import { usePrefersReducedMotion } from "@/lib/use-reduced-motion";
import { BellRing } from "lucide-react";
import { slideInRight, standardTransition } from "@/lib/motion-presets";
import { formatDate } from "@/lib/utils";

export interface WorkshopPastEventSidebarProps {
    workshopDate: string;
    formattedWorkshopTime: string;
    workshopLocation: string;
    workshopCity: string;

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

    notifyState,
    notifyLoadingMode,
    notifyMessage,
    notifyError,
    onPastNotify,
}: WorkshopPastEventSidebarProps) {
    const prefersReducedMotion = usePrefersReducedMotion();

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
            <p className="text-sm font-inter text-dark-muted mb-5">
                {formatDate(workshopDate)} &bull; {formattedWorkshopTime} &bull; {workshopLocation},{" "}
                {workshopCity}
            </p>

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
