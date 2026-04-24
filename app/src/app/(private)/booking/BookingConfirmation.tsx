"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, CalendarPlus, Check } from "lucide-react";
import { scaleIn, standardTransition } from "@/lib/motion-presets";
import { downloadICSFile, generateGoogleCalendarUrl, type CalendarEventData } from "@/lib/calendar";
import WorkshopTicket from "./WorkshopTicket";

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
    attendeeName,
    location,
    bookingId,
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
    attendeeName: string;
    location: string;
    bookingId: string;
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
                className="max-w-2xl mx-auto text-center"
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

                {/* Workshop Ticket */}
                <WorkshopTicket
                    bookingId={bookingId}
                    workshopId={workshopId}
                    attendeeName={attendeeName}
                    location={location}
                    workshopTitle={bookingWorkshopTitle}
                    workshopDate={bookingWorkshopDate}
                    workshopTime={bookingWorkshopTime}
                    workshopCoverImage={bookingCover}
                    guests={guests}
                    totalPaid={bookingTotal}
                    prefersReducedMotion={prefersReducedMotion}
                />

                <div className="flex gap-3 justify-center mt-8 mb-6">
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
