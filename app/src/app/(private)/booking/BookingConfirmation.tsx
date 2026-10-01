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
        <div className="mx-auto max-w-3xl">
            <button
                type="button"
                onClick={onBack}
                className="mb-6 inline-flex items-center gap-2 rounded text-sm font-medium text-dark-muted transition-colors hover:text-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
            >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back
            </button>
            <motion.div
                variants={prefersReducedMotion ? undefined : scaleIn}
                initial={prefersReducedMotion ? undefined : "hidden"}
                animate={prefersReducedMotion ? undefined : "visible"}
                transition={prefersReducedMotion ? { duration: 0 } : standardTransition}
                className="text-center"
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
                    className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 ring-8 ring-emerald-50"
                >
                    <Check
                        className="h-10 w-10 text-emerald-600"
                        strokeWidth={2.5}
                        aria-hidden="true"
                    />
                </motion.div>
                <h1 className="heading-lg mb-3" role="status">
                    You&apos;re booked!
                </h1>
                <p className="text-body mx-auto mb-8 max-w-xl text-dark-muted">
                    Your booking for <strong className="text-dark">{bookingWorkshopTitle}</strong>{" "}
                    is confirmed. Keep this ticket handy.
                </p>

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

                <div className="mb-6 mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                    <Link href="/profile" className="btn-primary">
                        View My Tickets
                    </Link>
                    <Link href="/explore" className="btn-secondary">
                        Explore More
                    </Link>
                </div>

                <div className="mt-2 border-t border-clay/40 pt-6">
                    <h2 className="mb-4 text-center text-sm font-inter font-bold uppercase tracking-wider text-dark-muted">
                        Add to calendar
                    </h2>
                    <div className="flex flex-col justify-center gap-3 sm:flex-row">
                        <button
                            type="button"
                            onClick={() => downloadICSFile(calendarData, `${workshopId}.ics`)}
                            className="btn-secondary inline-flex items-center gap-2"
                        >
                            <CalendarPlus className="h-4 w-4" aria-hidden="true" />
                            Apple / Outlook (.ics)
                        </button>
                        <a
                            href={generateGoogleCalendarUrl(calendarData)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-secondary inline-flex items-center gap-2"
                        >
                            <CalendarPlus className="h-4 w-4" aria-hidden="true" />
                            Google Calendar
                        </a>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
