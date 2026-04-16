"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, CalendarDays, Gift, Sparkles } from "lucide-react";

import { usePlatformSettings } from "@/lib/platform-settings-context";
import {
    formatSpecialPageDate,
    isSpecialPageActive,
    resolveSpecialPageSettings,
} from "@/lib/special-page";

export default function SpecialEventBanner() {
    const shouldReduceMotion = Boolean(useReducedMotion());
    const { settings, loading } = usePlatformSettings();

    if (loading || !isSpecialPageActive(settings.special_page)) {
        return null;
    }

    const specialPageSettings = resolveSpecialPageSettings(settings.special_page);

    return (
        <section className="section-padding mt-6 sm:mt-10">
            <motion.div
                initial={shouldReduceMotion ? undefined : { opacity: 0, y: 30 }}
                whileInView={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                className="relative overflow-hidden rounded-3xl border border-amber-200/60 shadow-[0_8px_40px_rgba(245,166,35,0.12)]"
                style={{
                    background: "linear-gradient(135deg, #FFF8EE 0%, #FFFDF7 40%, #FFF3E0 100%)",
                }}
            >
                <div className="pointer-events-none absolute right-0 top-0 h-48 w-48 rounded-bl-[120px] bg-gradient-to-bl from-amber-200/40 to-transparent" />
                <div className="pointer-events-none absolute bottom-0 left-0 h-36 w-36 rounded-tr-[100px] bg-gradient-to-tr from-orange-100/50 to-transparent" />
                <div className="absolute left-[15%] top-6 h-1.5 w-1.5 rounded-full bg-amber-400/50 animate-pulse" />
                <div
                    className="absolute right-[25%] top-12 h-1 w-1 rounded-full bg-orange-300/60 animate-pulse"
                    style={{ animationDelay: "1s" }}
                />
                <div
                    className="absolute bottom-10 right-[15%] h-2 w-2 rounded-full bg-amber-300/40 animate-pulse"
                    style={{ animationDelay: "0.5s" }}
                />

                <div className="relative z-10 flex flex-col gap-6 p-6 sm:p-8 md:flex-row md:items-center md:gap-10 md:p-10">
                    <motion.div
                        initial={shouldReduceMotion ? undefined : { opacity: 0, scale: 0.9 }}
                        whileInView={shouldReduceMotion ? undefined : { opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5, delay: 0.2 }}
                        className="flex shrink-0 items-center gap-4 self-start rounded-3xl border border-amber-200/80 bg-white/80 px-5 py-4 shadow-md"
                    >
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 via-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/25">
                            <Gift className="h-7 w-7" />
                        </div>
                        <div>
                            <p className="text-[11px] font-inter font-bold uppercase tracking-[0.22em] text-amber-600">
                                {specialPageSettings.badge}
                            </p>
                            <p className="mt-1 text-sm font-inter font-medium text-amber-900/75">
                                Featured across the website
                            </p>
                        </div>
                    </motion.div>

                    <div className="min-w-0 flex-1 text-center md:text-left">
                        <motion.div
                            initial={shouldReduceMotion ? undefined : { opacity: 0, y: 10 }}
                            whileInView={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5, delay: 0.3 }}
                        >
                            <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1">
                                <Sparkles className="h-3.5 w-3.5 text-amber-600" />
                                <span className="text-xs font-inter font-semibold uppercase tracking-wider text-amber-700">
                                    Special page
                                </span>
                            </div>
                        </motion.div>

                        <motion.h3
                            initial={shouldReduceMotion ? undefined : { opacity: 0, y: 10 }}
                            whileInView={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5, delay: 0.4 }}
                            className="mb-2 font-playfair text-2xl font-bold leading-tight text-amber-950 sm:text-3xl md:text-[2rem]"
                        >
                            {specialPageSettings.title}
                        </motion.h3>

                        <motion.p
                            initial={shouldReduceMotion ? undefined : { opacity: 0, y: 10 }}
                            whileInView={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5, delay: 0.5 }}
                            className="mb-4 max-w-2xl text-sm font-inter text-amber-900/70 sm:text-base"
                        >
                            {specialPageSettings.description}
                        </motion.p>

                        <motion.div
                            initial={shouldReduceMotion ? undefined : { opacity: 0, y: 10 }}
                            whileInView={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5, delay: 0.55 }}
                            className="mb-5 flex flex-wrap items-center justify-center gap-3 md:justify-start"
                        >
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/50 bg-white/60 px-3 py-1.5 text-xs font-inter font-medium text-amber-800/70">
                                <CalendarDays className="h-3.5 w-3.5" />
                                Visible till{" "}
                                {formatSpecialPageDate(specialPageSettings.visibleUntil)}
                            </span>
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/50 bg-white/60 px-3 py-1.5 text-xs font-inter font-medium text-amber-800/70">
                                <Gift className="h-3.5 w-3.5" />
                                Reopen anytime from the floating surprise box
                            </span>
                        </motion.div>

                        <motion.div
                            initial={shouldReduceMotion ? undefined : { opacity: 0, y: 10 }}
                            whileInView={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5, delay: 0.65 }}
                        >
                            <Link
                                href={specialPageSettings.path}
                                className="group inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-inter font-semibold text-white shadow-lg shadow-amber-500/25 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-amber-500/35 active:scale-[0.98]"
                                style={{
                                    background:
                                        "linear-gradient(135deg, #F5A623 0%, #E8941A 50%, #C97A10 100%)",
                                }}
                            >
                                {specialPageSettings.ctaLabel}
                                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                            </Link>
                        </motion.div>
                    </div>
                </div>
            </motion.div>
        </section>
    );
}
