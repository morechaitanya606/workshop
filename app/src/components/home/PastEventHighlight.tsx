"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { BellRing, ChevronRight } from "lucide-react";
import type { Workshop } from "@/lib/data";
import { cardReveal, standardTransition, useMotionProps } from "@/lib/motion-presets";
import { formatDate } from "@/lib/utils";
import { SectionHeader } from "@/components/home/HomeSectionShared";

export default function PastEventHighlight({
    pastWorkshop,
    shouldReduceMotion,
    notifyState,
    pastNotifyLoading,
    onNotify,
    notifyMessage,
    notifyMessageTone,
}: {
    pastWorkshop: Workshop;
    shouldReduceMotion: boolean;
    notifyState: { similar: boolean; creator: boolean };
    pastNotifyLoading: "similar" | "creator" | null;
    onNotify: (mode: "similar" | "creator") => void;
    notifyMessage: string | null;
    notifyMessageTone: "success" | "error";
}) {
    const pastEventMotionProps = useMotionProps(shouldReduceMotion, cardReveal, standardTransition);

    return (
        <section className="section-padding mt-20 sm:mt-16">
            <SectionHeader
                title="Past Event Highlight"
                eyebrow="Archive"
                action="View details"
                href={`/workshop/${pastWorkshop.id}`}
                reduceMotion={shouldReduceMotion}
            />
            <motion.div
                {...pastEventMotionProps}
                className="bg-white border border-gray-100 rounded-3xl shadow-soft overflow-hidden hover-lift"
            >
                <div className="grid grid-cols-1 lg:grid-cols-[360px,1fr]">
                    <div className="relative min-h-[260px] lg:min-h-full">
                        <Image
                            src={pastWorkshop.coverImage}
                            alt={pastWorkshop.title}
                            fill
                            className="object-cover image-hover-zoom"
                            sizes="(max-width: 1024px) 100vw, 360px"
                        />
                    </div>
                    <div className="p-6 sm:p-8">
                        <div className="inline-flex items-center gap-2 bg-terracotta/10 text-terracotta text-xs font-inter font-bold uppercase tracking-wider px-3 py-1.5 rounded-full mb-4">
                            Past Event
                        </div>
                        <h3 className="font-playfair text-2xl font-bold text-dark mb-2">
                            {pastWorkshop.title}
                        </h3>
                        <p className="text-sm font-inter text-dark-muted mb-4">
                            {formatDate(pastWorkshop.date)} &bull; {pastWorkshop.time} &bull;{" "}
                            {pastWorkshop.location}, {pastWorkshop.city}
                        </p>

                        <div className="bg-cream-100 rounded-2xl p-4 sm:p-5 border border-clay/40 mb-5">
                            <p className="text-[11px] font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                                Attendee Feedback
                            </p>
                            <p className="text-sm sm:text-base font-inter text-dark-secondary leading-relaxed">
                                &ldquo;
                                {pastWorkshop.feedbackHighlight ||
                                    `Rated ${pastWorkshop.rating}/5 from ${pastWorkshop.reviewCount} reviews.`}
                                &rdquo;
                            </p>
                            <p className="text-xs font-inter text-dark-muted mt-2">
                                {pastWorkshop.feedbackAuthor ||
                                    `${pastWorkshop.reviewCount} verified reviews`}
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <button
                                type="button"
                                onClick={() => onNotify("similar")}
                                disabled={pastNotifyLoading !== null}
                                className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-inter font-semibold transition-colors ${
                                    notifyState.similar
                                        ? "bg-emerald-100 text-emerald-700 border border-emerald-300"
                                        : "bg-terracotta text-white hover:bg-terracotta-600"
                                } ${pastNotifyLoading !== null ? "opacity-80 cursor-not-allowed" : ""}`}
                            >
                                <BellRing className="w-4 h-4" />
                                {pastNotifyLoading === "similar"
                                    ? "Saving..."
                                    : notifyState.similar
                                      ? "Similar Event Alerts On"
                                      : "Notify Similar Event"}
                            </button>
                            <button
                                type="button"
                                onClick={() => onNotify("creator")}
                                disabled={pastNotifyLoading !== null}
                                className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-inter font-semibold transition-colors ${
                                    notifyState.creator
                                        ? "bg-emerald-100 text-emerald-700 border border-emerald-300"
                                        : "bg-white text-dark-secondary border border-gray-200 hover:border-terracotta hover:text-terracotta"
                                } ${pastNotifyLoading !== null ? "opacity-80 cursor-not-allowed" : ""}`}
                            >
                                <BellRing className="w-4 h-4" />
                                {pastNotifyLoading === "creator"
                                    ? "Saving..."
                                    : notifyState.creator
                                      ? "Creator Alerts On"
                                      : "Notify Creator Next Event"}
                            </button>
                            <Link
                                href={`/workshop/${pastWorkshop.id}`}
                                className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-inter font-semibold bg-white text-dark-secondary border border-gray-200 hover:border-terracotta hover:text-terracotta transition-colors"
                            >
                                View Event Page
                                <ChevronRight className="w-4 h-4" />
                            </Link>
                        </div>

                        {notifyMessage && (
                            <p
                                className={`mt-4 text-xs font-inter ${
                                    notifyMessageTone === "error"
                                        ? "text-red-700"
                                        : "text-emerald-700"
                                }`}
                            >
                                {notifyMessage}
                            </p>
                        )}
                    </div>
                </div>
            </motion.div>
        </section>
    );
}
