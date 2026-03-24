"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, CalendarPlus, Check } from "lucide-react";
import { scaleIn, standardTransition } from "@/lib/motion-presets";
import { formatCurrency, formatDate } from "@/lib/utils";
import { downloadICSFile, generateGoogleCalendarUrl, type CalendarEventData } from "@/lib/calendar";

export default function BookingConfirmation({
    bookingCover,
    bookingWorkshopTitle,
    bookingWorkshopDate,
    bookingWorkshopTime,
    bookingTotal,
    guests,
    calendarData,
    workshopId,
    prefersReducedMotion,
    onBack,
}: {
    bookingCover: string;
    bookingWorkshopTitle: string;
    bookingWorkshopDate: string;
    bookingWorkshopTime: string;
    bookingTotal: number;
    guests: number;
    calendarData: CalendarEventData;
    workshopId: string;
    prefersReducedMotion: boolean;
    onBack: () => void;
}) {
    return (
        <>
            <button
                onClick={onBack}
                className="inline-flex items-center gap-2 text-sm font-medium text-dark-muted hover:text-dark transition-colors mb-6"
            >
                <ArrowLeft className="w-4 h-4" />
                Back
            </button>
            <motion.div
                variants={prefersReducedMotion ? undefined : scaleIn}
                initial={prefersReducedMotion ? undefined : "hidden"}
                animate={prefersReducedMotion ? undefined : "visible"}
                transition={prefersReducedMotion ? { duration: 0 } : standardTransition}
                className="max-w-lg mx-auto text-center"
            >
                <motion.div
                    variants={prefersReducedMotion ? undefined : scaleIn}
                    initial={prefersReducedMotion ? undefined : "hidden"}
                    animate={prefersReducedMotion ? undefined : "visible"}
                    transition={
                        prefersReducedMotion
                            ? { duration: 0 }
                            : { ...standardTransition, delay: 0.1 }
                    }
                    className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6"
                >
                    <Check className="w-10 h-10 text-emerald-600" />
                </motion.div>
                <h1 className="heading-lg mb-3">Booking Confirmed</h1>
                <p className="text-body text-dark-muted mb-8">
                    Your booking for <strong>{bookingWorkshopTitle}</strong> is confirmed.
                </p>

                <div className="bg-white rounded-2xl p-6 shadow-soft mb-8 text-left">
                    <div className="flex gap-4">
                        <div className="relative w-20 h-20 rounded-xl overflow-hidden flex-shrink-0">
                            <Image
                                src={bookingCover}
                                alt={bookingWorkshopTitle}
                                fill
                                className="object-cover"
                            />
                        </div>
                        <div>
                            <h3 className="font-playfair font-semibold text-dark">
                                {bookingWorkshopTitle}
                            </h3>
                            <p className="text-sm font-inter text-dark-muted mt-1">
                                {formatDate(bookingWorkshopDate)} <span aria-hidden>&middot;</span>{" "}
                                {bookingWorkshopTime}
                            </p>
                            <p className="text-sm font-inter text-dark-muted">
                                {guests} guests <span aria-hidden>&middot;</span>{" "}
                                {formatCurrency(bookingTotal)}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex gap-3 justify-center mb-6">
                    <Link href="/profile" className="btn-primary">
                        View My Tickets
                    </Link>
                    <Link href="/explore" className="btn-secondary">
                        Explore More
                    </Link>
                </div>

                <div className="border-t border-gray-100 pt-6 mt-2">
                    <h3 className="text-sm font-inter font-bold text-dark-muted uppercase tracking-wider mb-4 text-center">
                        Add to Calendar
                    </h3>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                        <button
                            onClick={() => downloadICSFile(calendarData, `${workshopId}.ics`)}
                            className="btn-secondary inline-flex items-center gap-2"
                        >
                            <CalendarPlus className="w-4 h-4" />
                            Apple / Outlook (.ics)
                        </button>
                        <a
                            href={generateGoogleCalendarUrl(calendarData)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-secondary inline-flex items-center gap-2"
                        >
                            <CalendarPlus className="w-4 h-4" />
                            Google Calendar
                        </a>
                    </div>
                </div>
            </motion.div>
        </>
    );
}
