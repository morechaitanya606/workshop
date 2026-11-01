"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import type { CardOffer } from "@/lib/offers";
import { formatCurrency, formatDate } from "@/lib/utils";
import { BOOKINGS_CLOSED_LABEL } from "@/lib/workshop-availability";
import { BOOKINGS_CLOSED_NOTE } from "./workshop-pricing";

/**
 * The bar's real height, published on <html> for the page's bottom padding (WorkshopClient). On a
 * 360px phone the price wraps and the bar grows past the 6rem the page reserved, which covered the
 * last lines of the footer. Unset (the page falls back to 6rem) while there is no bar or it has no
 * height (hidden from 900px up).
 */
export const BOOKING_BAR_HEIGHT_VAR = "--workshop-booking-bar-height";

function publishBarHeight(element: HTMLElement | null): (() => void) | undefined {
    if (!element) return undefined;
    const root = document.documentElement;
    const publish = () => {
        const height = Math.ceil(element.getBoundingClientRect().height);
        if (height > 0) {
            root.style.setProperty(BOOKING_BAR_HEIGHT_VAR, `${height}px`);
        } else {
            root.style.removeProperty(BOOKING_BAR_HEIGHT_VAR);
        }
    };
    publish();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(publish);
    observer?.observe(element);
    return () => {
        observer?.disconnect();
        root.style.removeProperty(BOOKING_BAR_HEIGHT_VAR);
    };
}

export interface WorkshopMobileBookingBarProps {
    isPastWorkshop: boolean;
    /** Past the automatic cut-off before the start (isBookingClosedNow). */
    isBookingClosed: boolean;
    /** The admin "Bookings closed" switch: no Book button, no offer price. */
    bookingsClosed?: boolean;
    isSoldOut: boolean;
    workshopPrice: number;
    /** The one-guest offer price, as the cards show it; null when nothing is discounted. */
    headline: CardOffer | null;
    workshopDate: string;
    formattedWorkshopTime: string;
    seatAvailabilityLabel: string;
    user: { id: string } | null;
    bookingLoading: boolean;
    holdError: string | null;
    loginRedirectHref: string;
    isMounted: boolean;
    onBooking: () => void;
    onShowCommunity: () => void;
}

export default function WorkshopMobileBookingBar({
    isPastWorkshop,
    isBookingClosed,
    bookingsClosed = false,
    isSoldOut,
    workshopPrice,
    headline,
    workshopDate,
    formattedWorkshopTime,
    seatAvailabilityLabel,
    user,
    bookingLoading,
    holdError,
    loginRedirectHref,
    isMounted,
    onBooking,
    onShowCommunity,
}: WorkshopMobileBookingBarProps) {
    const [barElement, setBarElement] = useState<HTMLDivElement | null>(null);
    useEffect(() => publishBarHeight(barElement), [barElement]);

    if (isPastWorkshop) return null;

    // Struck list price only beside a real per-person discount (a per-booking amount is named
    // in the offers panel instead).
    const struck = !bookingsClosed && headline && !headline.perBooking ? headline : null;

    const bar = (
        // Sits exactly on top of the bottom nav (bottom-16 was 4px short of its 68px).
        <div
            ref={setBarElement}
            className="fixed inset-x-0 bottom-[var(--mobile-nav-height)] z-40 min-[900px]:hidden"
        >
            <div className="bg-white/95 border-t border-clay/30 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] px-4 py-3">
                <div className="flex items-center justify-between gap-4 max-w-lg mx-auto">
                    <div className="min-w-0 flex-1">
                        {struck && (
                            <span className="mr-2 text-xs font-inter text-dark-muted line-through">
                                {formatCurrency(struck.listPrice)}
                            </span>
                        )}
                        <span className="font-playfair text-lg font-bold text-dark">
                            {formatCurrency(struck ? struck.offerPrice : workshopPrice)}
                        </span>
                        <span className="text-xs font-inter text-dark-muted ml-1">
                            / person, incl. GST
                        </span>
                        <p className="mt-1 text-[11px] font-inter text-dark-muted">
                            {formatDate(workshopDate)} &bull; {formattedWorkshopTime}
                        </p>
                        <p
                            className={`mt-1 text-[11px] font-inter ${
                                bookingsClosed
                                    ? "text-dark-muted"
                                    : isSoldOut || isBookingClosed
                                      ? "text-red-700"
                                      : "text-emerald-700"
                            }`}
                        >
                            {bookingsClosed ? BOOKINGS_CLOSED_NOTE : seatAvailabilityLabel}
                        </p>
                    </div>
                    {bookingsClosed ? (
                        <span className="shrink-0 rounded-full bg-gray-100 px-4 py-2 text-sm font-inter font-semibold text-dark-muted">
                            {BOOKINGS_CLOSED_LABEL}
                        </span>
                    ) : isBookingClosed ? (
                        <button
                            type="button"
                            disabled
                            className="shrink-0 rounded-full bg-gray-100 px-5 py-2.5 text-sm font-inter font-semibold text-dark-muted cursor-not-allowed"
                        >
                            Booking Closed
                        </button>
                    ) : isSoldOut ? (
                        <button
                            type="button"
                            onClick={onShowCommunity}
                            className="shrink-0 rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-inter font-bold text-white transition-colors hover:bg-emerald-800"
                        >
                            Join WhatsApp
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
