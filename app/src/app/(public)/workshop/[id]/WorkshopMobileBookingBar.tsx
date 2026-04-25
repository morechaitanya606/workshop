"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { formatCurrency, formatDate } from "@/lib/utils";
import { BOOKING_CUTOFF_HOURS } from "@/lib/booking-time";

export interface WorkshopMobileBookingBarProps {
    isPastWorkshop: boolean;
    isBookingClosed: boolean;
    isSoldOut: boolean;
    isEbEligible: boolean;
    workshopPrice: number;
    currentPricePerGuest: number;
    workshopDate: string;
    formattedWorkshopTime: string;
    seatAvailabilityLabel: string;
    user: { id: string } | null;
    bookingLoading: boolean;
    holdError: string | null;
    loginRedirectHref: string;
    isMounted: boolean;
    onBooking: () => void;
    onShowWaitlist: () => void;
}

export default function WorkshopMobileBookingBar({
    isPastWorkshop,
    isBookingClosed,
    isSoldOut,
    isEbEligible,
    workshopPrice,
    currentPricePerGuest,
    workshopDate,
    formattedWorkshopTime,
    seatAvailabilityLabel,
    user,
    bookingLoading,
    holdError,
    loginRedirectHref,
    isMounted,
    onBooking,
    onShowWaitlist,
}: WorkshopMobileBookingBarProps) {
    if (isPastWorkshop) return null;

    const bar = (
        <div className="fixed inset-x-0 bottom-16 z-40 md:bottom-0 min-[900px]:hidden">
            <div className="bg-white/95 backdrop-blur-xl border-t border-clay/30 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] px-4 py-3">
                <div className="flex items-center justify-between gap-4 max-w-lg mx-auto">
                    <div className="min-w-0 flex-1">
                        {isEbEligible && (
                            <span className="mr-2 text-xs font-inter text-dark-muted line-through">
                                {formatCurrency(workshopPrice)}
                            </span>
                        )}
                        <span className="font-playfair text-lg font-bold text-dark">
                            {formatCurrency(currentPricePerGuest)}
                        </span>
                        <span className="text-xs font-inter text-dark-muted ml-1">/ person</span>
                        <p className="mt-1 text-[11px] font-inter text-dark-muted">
                            {formatDate(workshopDate)} &bull; {formattedWorkshopTime}
                        </p>
                        <p
                            className={`mt-1 text-[11px] font-inter ${
                                isSoldOut || isBookingClosed ? "text-red-700" : "text-emerald-700"
                            }`}
                        >
                            {seatAvailabilityLabel}
                        </p>
                    </div>
                    {isBookingClosed ? (
                        <button
                            type="button"
                            disabled
                            className="rounded-full bg-gray-100 px-5 py-2.5 text-sm font-inter font-semibold text-dark-muted cursor-not-allowed"
                        >
                            Booking Closed
                        </button>
                    ) : isSoldOut ? (
                        <button
                            onClick={onShowWaitlist}
                            className="btn-secondary !py-2.5 !px-6 text-sm"
                        >
                            Join Waitlist
                        </button>
                    ) : user ? (
                        <button
                            onClick={onBooking}
                            disabled={bookingLoading}
                            className="btn-primary shrink-0 !py-2.5 !px-5 text-sm disabled:opacity-60"
                        >
                            {bookingLoading ? "Reserving..." : "Reserve Spot"}
                        </button>
                    ) : (
                        <Link
                            href={loginRedirectHref}
                            className="btn-primary shrink-0 !py-2.5 !px-5 text-sm"
                        >
                            Log in to Reserve
                        </Link>
                    )}
                </div>
                {holdError && (
                    <p className="mt-2 text-center text-xs font-inter text-red-600">{holdError}</p>
                )}
            </div>
        </div>
    );

    if (!isMounted) return null;
    return createPortal(bar, document.body);
}
