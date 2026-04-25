"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import {
    Calendar,
    Check,
    Clock,
    Copy,
    MapPin,
    MessageCircle,
    Send,
    Share2,
    Users,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { scaleIn, standardTransition } from "@/lib/motion-presets";
import { formatCurrency, formatDate, formatTime } from "@/lib/utils";

export type WorkshopTicketProps = {
    bookingId: string;
    workshopId?: string;
    workshopTitle: string;
    workshopDate: string;
    workshopTime: string;
    workshopCoverImage?: string | null;
    location: string;
    attendeeName: string;
    guests: number;
    totalPaid: number;
    prefersReducedMotion?: boolean;
};

function generateTicketNumber(bookingId: string) {
    const hash = bookingId
        .split("")
        .reduce((sum, char, index) => sum + char.charCodeAt(0) * (index + 1), 0);

    return `OW-${String(hash % 1000000).padStart(6, "0")}`;
}

function getShareUrl(workshopId?: string) {
    if (typeof window === "undefined") return "";
    if (workshopId) {
        return `${window.location.origin}/workshop/${workshopId}`;
    }
    return window.location.href.split("?")[0] || window.location.origin;
}

function formatTicketTime(time: string) {
    try {
        const formatted = formatTime(time);
        return formatted.includes("Invalid") ? time : formatted;
    } catch {
        return time;
    }
}

function buildShareMessage(
    attendeeName: string,
    workshopTitle: string,
    workshopDate: string,
    workshopTime: string,
    location: string,
    ticketNumber: string
) {
    return [
        `${attendeeName} is attending "${workshopTitle}"`,
        `${formatDate(workshopDate)} at ${formatTicketTime(workshopTime)}`,
        location,
        `Ticket ${ticketNumber}`,
        "Booked on Only Workshops",
    ].join("\n");
}

export default function WorkshopTicket({
    bookingId,
    workshopId,
    workshopTitle,
    workshopDate,
    workshopTime,
    workshopCoverImage,
    location,
    attendeeName,
    guests,
    totalPaid,
    prefersReducedMotion = false,
}: WorkshopTicketProps) {
    const [linkCopied, setLinkCopied] = useState(false);
    const ticketNumber = useMemo(() => generateTicketNumber(bookingId), [bookingId]);
    const shareUrl = getShareUrl(workshopId);
    const shareMessage = useMemo(
        () =>
            buildShareMessage(
                attendeeName,
                workshopTitle,
                workshopDate,
                workshopTime,
                location,
                ticketNumber
            ),
        [attendeeName, workshopTitle, workshopDate, workshopTime, location, ticketNumber]
    );

    const openPopup = useCallback((url: string) => {
        window.open(url, "_blank", "noopener,noreferrer");
    }, []);

    const copyLink = useCallback(async () => {
        if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
            return;
        }

        try {
            await navigator.clipboard.writeText(shareUrl);
            setLinkCopied(true);
            window.setTimeout(() => setLinkCopied(false), 1800);
        } catch {
            setLinkCopied(false);
        }
    }, [shareUrl]);

    const shareNatively = useCallback(async () => {
        if (typeof navigator !== "undefined" && navigator.share) {
            try {
                await navigator.share({
                    title: `${workshopTitle} ticket`,
                    text: shareMessage,
                    url: shareUrl,
                });
                return;
            } catch {
                // Fall back to copying the link when the native sheet is cancelled or unavailable.
            }
        }

        await copyLink();
    }, [copyLink, shareMessage, shareUrl, workshopTitle]);

    const shareOnWhatsApp = useCallback(() => {
        openPopup(`https://wa.me/?text=${encodeURIComponent(`${shareMessage}\n${shareUrl}`)}`);
    }, [openPopup, shareMessage, shareUrl]);

    const shareOnTwitter = useCallback(() => {
        openPopup(
            `https://twitter.com/intent/tweet?text=${encodeURIComponent(
                shareMessage
            )}&url=${encodeURIComponent(shareUrl)}`
        );
    }, [openPopup, shareMessage, shareUrl]);

    return (
        <motion.section
            variants={prefersReducedMotion ? undefined : scaleIn}
            initial={prefersReducedMotion ? undefined : "hidden"}
            animate={prefersReducedMotion ? undefined : "visible"}
            transition={
                prefersReducedMotion ? { duration: 0 } : { ...standardTransition, delay: 0.15 }
            }
            className="w-full max-w-3xl mx-auto"
        >
            <div className="overflow-hidden rounded-[28px] border border-dark/10 bg-white shadow-card">
                <div className="grid gap-0 md:grid-cols-[1.45fr_auto_0.8fr]">
                    <div className="relative">
                        <div className="bg-gradient-to-r from-terracotta-700 via-terracotta-600 to-terracotta-400 px-5 py-4 text-left text-white">
                            <p className="text-[10px] font-inter font-semibold uppercase tracking-[0.28em] text-white/70">
                                Only Workshops
                            </p>
                            <h3 className="mt-2 font-display text-2xl leading-tight">
                                {workshopTitle}
                            </h3>
                        </div>

                        <div className="grid gap-5 px-5 py-5 sm:grid-cols-[120px_1fr]">
                            <div className="relative overflow-hidden rounded-2xl border border-dark/10 bg-cream-100 aspect-[4/5]">
                                {workshopCoverImage ? (
                                    <Image
                                        src={workshopCoverImage}
                                        alt={workshopTitle}
                                        fill
                                        className="object-cover"
                                    />
                                ) : (
                                    <div className="flex h-full items-end bg-gradient-to-br from-cream-50 via-cream to-clay-light p-4">
                                        <span className="font-display text-lg leading-tight text-dark-text">
                                            {workshopTitle}
                                        </span>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-4 text-left">
                                <div>
                                    <p className="text-[10px] font-inter font-semibold uppercase tracking-[0.25em] text-dark-muted">
                                        Ticket Holder
                                    </p>
                                    <p className="mt-1 font-display text-2xl text-dark-text">
                                        {attendeeName}
                                    </p>
                                </div>

                                <div className="grid gap-3 sm:grid-cols-2">
                                    <div className="rounded-2xl bg-cream-50 p-3">
                                        <div className="flex items-start gap-2">
                                            <Calendar className="mt-0.5 h-4 w-4 text-terracotta" />
                                            <div>
                                                <p className="text-[10px] font-inter font-semibold uppercase tracking-[0.2em] text-dark-muted">
                                                    Date
                                                </p>
                                                <p className="mt-1 text-sm font-semibold text-dark-text">
                                                    {formatDate(workshopDate)}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="rounded-2xl bg-cream-50 p-3">
                                        <div className="flex items-start gap-2">
                                            <Clock className="mt-0.5 h-4 w-4 text-terracotta" />
                                            <div>
                                                <p className="text-[10px] font-inter font-semibold uppercase tracking-[0.2em] text-dark-muted">
                                                    Time
                                                </p>
                                                <p className="mt-1 text-sm font-semibold text-dark-text">
                                                    {formatTicketTime(workshopTime)}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="rounded-2xl bg-cream-50 p-3 sm:col-span-2">
                                        <div className="flex items-start gap-2">
                                            <MapPin className="mt-0.5 h-4 w-4 text-terracotta" />
                                            <div>
                                                <p className="text-[10px] font-inter font-semibold uppercase tracking-[0.2em] text-dark-muted">
                                                    Venue
                                                </p>
                                                <p className="mt-1 text-sm font-semibold text-dark-text">
                                                    {location}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-3 border-t border-dashed border-dark/10 pt-4">
                                    <div className="rounded-full bg-dark-text px-3 py-1 text-[11px] font-inter font-semibold uppercase tracking-[0.18em] text-white">
                                        {ticketNumber}
                                    </div>
                                    <div className="inline-flex items-center gap-2 rounded-full bg-terracotta-50 px-3 py-1 text-[11px] font-inter font-semibold uppercase tracking-[0.16em] text-terracotta-700">
                                        <Users className="h-3.5 w-3.5" />
                                        Admit {guests}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="relative hidden md:block">
                        <div className="absolute inset-y-5 left-1/2 border-l-2 border-dashed border-dark/10" />
                        <div className="absolute -top-3 left-1/2 h-6 w-6 -translate-x-1/2 rounded-full bg-cream" />
                        <div className="absolute -bottom-3 left-1/2 h-6 w-6 -translate-x-1/2 rounded-full bg-cream" />
                    </div>

                    <div className="flex flex-col justify-between bg-cream-50 px-5 py-5 text-left">
                        <div>
                            <p className="text-[10px] font-inter font-semibold uppercase tracking-[0.25em] text-dark-muted">
                                Booking ID
                            </p>
                            <p className="mt-2 break-all text-sm font-semibold text-dark-text">
                                {bookingId}
                            </p>
                        </div>

                        <div className="my-5 border-t border-dashed border-dark/10" />

                        <div>
                            <p className="text-[10px] font-inter font-semibold uppercase tracking-[0.25em] text-dark-muted">
                                Total Paid
                            </p>
                            <p className="mt-2 font-display text-3xl text-terracotta-700">
                                {formatCurrency(totalPaid)}
                            </p>
                        </div>

                        <div className="mt-5 inline-flex items-center gap-2 text-xs font-inter font-semibold uppercase tracking-[0.18em] text-emerald-700">
                            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100">
                                <Check className="h-4 w-4" />
                            </span>
                            Confirmed
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-4">
                <button
                    type="button"
                    onClick={() => void shareNatively()}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-dark/10 bg-white px-4 py-3 text-sm font-semibold text-dark-secondary transition-colors hover:border-terracotta hover:text-terracotta"
                >
                    <Share2 className="h-4 w-4" />
                    Share
                </button>
                <button
                    type="button"
                    onClick={shareOnWhatsApp}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-dark/10 bg-white px-4 py-3 text-sm font-semibold text-dark-secondary transition-colors hover:border-terracotta hover:text-terracotta"
                >
                    <MessageCircle className="h-4 w-4" />
                    WhatsApp
                </button>
                <button
                    type="button"
                    onClick={shareOnTwitter}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-dark/10 bg-white px-4 py-3 text-sm font-semibold text-dark-secondary transition-colors hover:border-terracotta hover:text-terracotta"
                >
                    <Send className="h-4 w-4" />
                    Twitter
                </button>
                <button
                    type="button"
                    onClick={() => void copyLink()}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-dark/10 bg-white px-4 py-3 text-sm font-semibold text-dark-secondary transition-colors hover:border-terracotta hover:text-terracotta"
                >
                    {linkCopied ? (
                        <Check className="h-4 w-4 text-emerald-600" />
                    ) : (
                        <Copy className="h-4 w-4" />
                    )}
                    {linkCopied ? "Copied" : "Copy Link"}
                </button>
            </div>
        </motion.section>
    );
}
