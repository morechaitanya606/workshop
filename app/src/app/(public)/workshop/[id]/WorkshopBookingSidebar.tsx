"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { usePrefersReducedMotion } from "@/lib/use-reduced-motion";
import { Calendar, ChevronRight, Loader2, Shield, Tag } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { BOOKING_CUTOFF_HOURS } from "@/lib/booking-time";
import { slideInRight, standardTransition } from "@/lib/motion-presets";
import type { CardOffer } from "@/lib/offers";
import type { Quote } from "@/lib/pricing";
import { BOOKINGS_CLOSED_LABEL } from "@/lib/workshop-availability";
import WorkshopGuestStepper from "./WorkshopGuestStepper";
import WorkshopPriceBreakdown from "./WorkshopPriceBreakdown";
import { BOOKINGS_CLOSED_NOTE } from "./workshop-pricing";

export interface WorkshopBookingSidebarProps {
    workshopPrice: number;
    /** The one-guest offer price, as the cards show it; null when nothing is discounted. */
    headline: CardOffer | null;
    workshopDate: string;
    formattedWorkshopTime: string;
    workshopLocation: string;
    maxSeats: number;
    guests: number;
    setGuests: (fn: number | ((n: number) => number)) => void;
    availableSeatCount: number;
    seatAvailabilityLabel: string;
    isSoldOut: boolean;
    /** Past the automatic cut-off before the start (isBookingClosedNow). */
    isBookingClosed: boolean;
    /** The admin "Bookings closed" switch: no Book button, no offers, no urgency. */
    bookingsClosed?: boolean;
    /** The booking as checkout charges it (workshop-pricing.ts). */
    quote: Quote;
    earlyBirdLabel: string | null;
    couponLabel: string | null;
    codeInPrice: boolean;
    onRemoveCode: () => void;
    /** The "Available offers" panel (WorkshopOffers). */
    offers?: ReactNode;
    user: { id: string } | null;
    bookingLoading: boolean;
    holdError: string | null;
    loginRedirectHref: string;
    onBooking: () => void;
    onShowCommunity: () => void;
}

/** The per-person price: struck list price only beside a real discount. */
export function WorkshopHeadlinePrice({
    workshopPrice,
    headline,
    size = "lg",
}: {
    workshopPrice: number;
    headline: CardOffer | null;
    size?: "lg" | "md";
}) {
    const priceClass =
        size === "lg"
            ? "font-playfair text-3xl font-bold text-dark"
            : "font-playfair text-2xl font-bold text-dark";
    // A fixed coupon comes off once per booking, so there is no honest per-person offer price:
    // the list price stays, with the offer named beside it (CardOffer.perBooking).
    const struck = headline && !headline.perBooking ? headline : null;
    return (
        <div className="flex flex-col">
            {headline && (
                <div className="mb-1 flex flex-wrap items-center gap-2">
                    {struck && (
                        <span className="text-sm font-inter text-dark-muted line-through">
                            {formatCurrency(struck.listPrice)}
                        </span>
                    )}
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-tight text-emerald-700">
                        {headline.label}
                    </span>
                </div>
            )}
            <div className="flex flex-wrap items-baseline gap-x-1">
                <span className={priceClass}>
                    {formatCurrency(struck ? struck.offerPrice : workshopPrice)}
                </span>
                <span className="text-sm font-inter text-dark-muted">/ person</span>
            </div>
            {headline?.perBooking && (
                <p className="mt-0.5 text-[11px] font-inter font-semibold text-emerald-700">
                    {headline.discountText}
                </p>
            )}
        </div>
    );
}

export default function WorkshopBookingSidebar({
    workshopPrice,
    headline,
    workshopDate,
    formattedWorkshopTime,
    maxSeats,
    guests,
    setGuests,
    availableSeatCount,
    seatAvailabilityLabel,
    isSoldOut,
    isBookingClosed,
    bookingsClosed = false,
    quote,
    earlyBirdLabel,
    couponLabel,
    codeInPrice,
    onRemoveCode,
    offers,
    user,
    bookingLoading,
    holdError,
    loginRedirectHref,
    onBooking,
    onShowCommunity,
}: WorkshopBookingSidebarProps) {
    const prefersReducedMotion = usePrefersReducedMotion();
    // Guests, price lines and offers only while a booking can actually start.
    const canBook = !bookingsClosed && !isBookingClosed && !isSoldOut;

    return (
        <motion.div
            variants={slideInRight}
            initial={"hidden"}
            animate={"visible"}
            transition={
                prefersReducedMotion ? { duration: 0 } : { ...standardTransition, delay: 0.3 }
            }
            className="sticky top-28 bg-white rounded-2xl shadow-card p-6 border border-clay/50"
        >
            <div className="flex items-end justify-between mb-6">
                <div>
                    <p className="text-xs font-inter font-semibold text-terracotta uppercase tracking-wider mb-1">
                        Price
                    </p>
                    <WorkshopHeadlinePrice
                        workshopPrice={workshopPrice}
                        headline={bookingsClosed ? null : headline}
                    />
                    <p className="mt-0.5 text-[11px] font-inter text-dark-muted">
                        Inclusive of GST
                    </p>
                </div>
                {bookingsClosed ? null : isSoldOut ? (
                    <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-inter font-bold text-red-700 transition-colors">
                        Sold Out
                    </span>
                ) : (
                    // The real seat count, like the cards ("Only 3 seats left"): "Selling Fast"
                    // claimed a pace nothing here measures. Not past the booking cut-off, when
                    // nobody can book those seats any more.
                    !isBookingClosed &&
                    availableSeatCount <= 5 && (
                        <span className="rounded-full bg-terracotta/10 px-2.5 py-1 text-xs font-inter font-bold text-terracotta transition-colors">
                            Only {availableSeatCount} left
                        </span>
                    )
                )}
            </div>

            <div className="mb-4">
                <label className="block text-[10px] font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                    Select Date
                </label>
                <div className="bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between cursor-pointer hover:border-terracotta/40 transition-colors">
                    <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-dark-muted" />
                        <span className="text-sm font-inter text-dark">
                            {formatDate(workshopDate)} &bull; {formattedWorkshopTime}
                        </span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-dark-muted" />
                </div>
            </div>

            {bookingsClosed ? (
                <div
                    role="status"
                    className="mb-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 font-inter"
                >
                    <p className="text-sm font-semibold text-dark">{BOOKINGS_CLOSED_LABEL}</p>
                    <p className="mt-0.5 text-xs text-dark-muted">{BOOKINGS_CLOSED_NOTE}</p>
                </div>
            ) : (
                <div
                    className={`mb-6 rounded-xl border px-4 py-3 text-sm font-inter transition-colors ${
                        isSoldOut
                            ? "border-red-200 bg-red-50 text-red-700"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700"
                    }`}
                >
                    {seatAvailabilityLabel}
                </div>
            )}

            {canBook && (
                <div className="mb-6">
                    <WorkshopGuestStepper
                        guests={guests}
                        setGuests={setGuests}
                        availableSeatCount={availableSeatCount}
                        idPrefix="sidebar"
                    />
                    {maxSeats >= 6 && (
                        <p className="mt-2 text-xs font-inter text-dark-muted bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                            🎉 Great for groups! Bring 3+ friends for a memorable weekend.
                        </p>
                    )}
                </div>
            )}

            {canBook && (
                <div className="mb-6 border-t border-dashed border-clay/50 pt-4">
                    <WorkshopPriceBreakdown
                        quote={quote}
                        earlyBirdLabel={earlyBirdLabel}
                        couponLabel={couponLabel}
                        codeInPrice={codeInPrice}
                        onRemoveCode={onRemoveCode}
                    />
                </div>
            )}

            {canBook && offers && (
                <div className="mb-6 border-t border-dashed border-clay/50 pt-4">{offers}</div>
            )}

            {bookingsClosed ? null : isBookingClosed ? (
                <button
                    type="button"
                    disabled
                    className="btn-secondary w-full text-center !py-4 text-base cursor-not-allowed opacity-70"
                >
                    Booking Closed
                </button>
            ) : isSoldOut ? (
                <button
                    type="button"
                    onClick={onShowCommunity}
                    className="w-full rounded-full bg-emerald-700 px-6 py-4 text-center text-base font-inter font-bold text-white transition-colors hover:bg-emerald-800"
                >
                    Workshop is full &mdash; join our WhatsApp community for the next dates
                </button>
            ) : user ? (
                <button
                    onClick={onBooking}
                    disabled={bookingLoading}
                    className="btn-primary w-full text-center !py-4 text-base disabled:opacity-60 disabled:cursor-not-allowed"
                >
                    {bookingLoading ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Reserving...
                        </>
                    ) : (
                        "Reserve Spot ->"
                    )}
                </button>
            ) : (
                <Link
                    href={loginRedirectHref}
                    className="btn-primary block w-full text-center !py-4 text-base"
                >
                    {"Log in to Book ->"}
                </Link>
            )}
            {!bookingsClosed && (
                <p className="text-center text-xs font-inter text-dark-muted mt-3">
                    {isBookingClosed
                        ? `Bookings close ${BOOKING_CUTOFF_HOURS} hours before the workshop starts.`
                        : isSoldOut
                          ? "All spots are taken. Join our WhatsApp community to hear about the next dates."
                          : user
                            ? "Secure payments via Razorpay. You won't be charged twice even if something goes wrong."
                            : "Log in to book. Payments are processed securely via Razorpay."}
                </p>
            )}
            {holdError && (
                <p className="text-center text-xs font-inter text-red-600 mt-2">{holdError}</p>
            )}

            {!bookingsClosed && (
                <div className="flex items-center justify-center gap-5 mt-5 pt-4 border-t border-dashed border-clay/50">
                    <div className="flex items-center gap-1.5 text-xs font-inter text-dark-muted">
                        <Shield className="w-3.5 h-3.5" />
                        Secure
                    </div>
                    <div className="flex items-center gap-1.5 text-xs font-inter text-dark-muted">
                        <Tag className="w-3.5 h-3.5" />
                        Best Price
                    </div>
                </div>
            )}
        </motion.div>
    );
}
