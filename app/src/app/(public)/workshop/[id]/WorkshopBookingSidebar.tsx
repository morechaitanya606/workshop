"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Calendar, ChevronRight, Loader2, Minus, Plus, Shield, Tag, X } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { BOOKING_CUTOFF_HOURS } from "@/lib/booking-time";
import { slideInRight, standardTransition } from "@/lib/motion-presets";
import type { AppliedCoupon } from "@/app/(private)/booking/types";

export interface WorkshopBookingSidebarProps {
    workshopPrice: number;
    currentPricePerGuest: number;
    workshopDate: string;
    formattedWorkshopTime: string;
    workshopLocation: string;
    maxSeats: number;
    guests: number;
    setGuests: (fn: number | ((n: number) => number)) => void;
    availableSeatCount: number;
    seatAvailabilityLabel: string;
    isSoldOut: boolean;
    isBookingClosed: boolean;
    isEbEligible: boolean;
    subtotal: number;
    serviceFee: number;
    total: number;
    appliedCoupon: AppliedCoupon | null;
    couponDiscountAmount: number;
    couponCode: string;
    setCouponCode: (code: string) => void;
    couponError: string | null;
    setCouponError: (error: string | null) => void;
    showCouponInput: boolean;
    setShowCouponInput: (show: boolean) => void;
    isApplyingCoupon: boolean;
    onApplyCoupon: () => void;
    onRemoveCoupon: () => void;
    user: { id: string } | null;
    bookingLoading: boolean;
    holdError: string | null;
    loginRedirectHref: string;
    onBooking: () => void;
    onShowWaitlist: () => void;
}

export default function WorkshopBookingSidebar({
    workshopPrice,
    currentPricePerGuest,
    workshopDate,
    formattedWorkshopTime,
    maxSeats,
    guests,
    setGuests,
    availableSeatCount,
    seatAvailabilityLabel,
    isSoldOut,
    isBookingClosed,
    isEbEligible,
    subtotal,
    serviceFee,
    total,
    appliedCoupon,
    couponDiscountAmount,
    couponCode,
    setCouponCode,
    couponError,
    setCouponError,
    showCouponInput,
    setShowCouponInput,
    isApplyingCoupon,
    onApplyCoupon,
    onRemoveCoupon,
    user,
    bookingLoading,
    holdError,
    loginRedirectHref,
    onBooking,
    onShowWaitlist,
}: WorkshopBookingSidebarProps) {
    const prefersReducedMotion = useReducedMotion();

    return (
        <motion.div
            variants={prefersReducedMotion ? undefined : slideInRight}
            initial={prefersReducedMotion ? undefined : "hidden"}
            animate={prefersReducedMotion ? undefined : "visible"}
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
                    <div className="flex flex-col">
                        {isEbEligible && (
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-inter text-dark-muted line-through">
                                    {formatCurrency(workshopPrice)}
                                </span>
                                <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-tight">
                                    Early Bird Offer
                                </span>
                            </div>
                        )}
                        <div className="flex items-baseline gap-1">
                            <span className="font-playfair text-3xl font-bold text-dark">
                                {formatCurrency(currentPricePerGuest)}
                            </span>
                            <span className="text-sm font-inter text-dark-muted">/ person</span>
                        </div>
                    </div>
                </div>
                {isSoldOut ? (
                    <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-inter font-bold text-red-700 transition-colors">
                        Sold Out
                    </span>
                ) : (
                    availableSeatCount <= 5 && (
                        <span className="rounded-full bg-terracotta/10 px-2.5 py-1 text-xs font-inter font-bold text-terracotta transition-colors">
                            Selling Fast
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

            <div
                className={`mb-6 rounded-xl border px-4 py-3 text-sm font-inter transition-colors ${
                    isSoldOut
                        ? "border-red-200 bg-red-50 text-red-700"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700"
                }`}
            >
                {seatAvailabilityLabel}
            </div>

            {!isSoldOut && (
                <div className="mb-6">
                    <label className="mb-2 block text-[10px] font-inter font-bold uppercase tracking-wider text-dark-muted">
                        Guests
                    </label>
                    <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-cream-100 px-4 py-3">
                        <button
                            onClick={() => setGuests(Math.max(1, guests - 1))}
                            disabled={guests <= 1}
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 transition-colors hover:border-terracotta hover:text-terracotta disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            <Minus className="h-4 w-4" />
                        </button>
                        <span className="text-lg font-inter font-bold text-dark">{guests}</span>
                        <button
                            onClick={() => setGuests(Math.min(availableSeatCount, guests + 1))}
                            disabled={guests >= availableSeatCount}
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 transition-colors hover:border-terracotta hover:text-terracotta disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            <Plus className="h-4 w-4" />
                        </button>
                    </div>
                    {maxSeats >= 6 && (
                        <p className="mt-2 text-xs font-inter text-dark-muted bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                            🎉 Great for groups! Bring 3+ friends for a memorable weekend.
                        </p>
                    )}
                </div>
            )}

            {!isSoldOut && (
                <div className="mb-6 space-y-3 border-t border-dashed border-clay/50 pt-4">
                    <div className="flex justify-between text-sm font-inter">
                        <span className="text-dark-secondary">
                            {formatCurrency(currentPricePerGuest)} &times; {guests} guests
                        </span>
                        <span className="font-medium text-dark">{formatCurrency(subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-inter">
                        <span className="text-dark-secondary">Service fee</span>
                        <span className="font-medium text-dark">{formatCurrency(serviceFee)}</span>
                    </div>
                    {appliedCoupon && (
                        <div className="flex justify-between text-sm font-inter text-emerald-700">
                            <span className="inline-flex items-center gap-1.5">
                                <Tag className="h-3.5 w-3.5" />
                                {appliedCoupon.code}
                                <button
                                    type="button"
                                    onClick={onRemoveCoupon}
                                    className="rounded-full p-0.5 transition-colors hover:text-emerald-900"
                                    aria-label="Remove coupon"
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            </span>
                            <span className="font-medium">
                                -{formatCurrency(couponDiscountAmount)}
                            </span>
                        </div>
                    )}
                    <div className="flex justify-between border-t border-dashed border-clay/50 pt-3 text-base font-inter font-bold">
                        <span className="text-dark">Total</span>
                        <span className="text-dark">{formatCurrency(total)}</span>
                    </div>
                </div>
            )}

            {!isSoldOut && !appliedCoupon && (
                <div className="mb-6 border-t border-dashed border-clay/50 pt-4">
                    {!showCouponInput ? (
                        <button
                            type="button"
                            onClick={() => {
                                setShowCouponInput(true);
                                setCouponError(null);
                            }}
                            className="inline-flex items-center gap-1.5 text-sm font-inter font-medium text-terracotta transition-colors hover:text-terracotta/80"
                        >
                            <Tag className="h-4 w-4" />
                            Have a coupon code?
                        </button>
                    ) : (
                        <div className="space-y-2">
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder="Discount code"
                                    value={couponCode}
                                    onChange={(event) => {
                                        setCouponCode(event.target.value.toUpperCase());
                                        setCouponError(null);
                                    }}
                                    className="flex-1 rounded-xl border border-clay/50 bg-white px-3 py-2 text-sm font-inter text-dark transition-all focus:border-terracotta focus:outline-none focus:ring-1 focus:ring-terracotta/30"
                                />
                                <button
                                    type="button"
                                    onClick={onApplyCoupon}
                                    disabled={!couponCode.trim() || isApplyingCoupon}
                                    className="inline-flex min-w-[88px] items-center justify-center rounded-xl bg-dark px-4 py-2 text-sm font-inter font-medium text-white transition-colors hover:bg-dark-hover disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {isApplyingCoupon ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        "Apply"
                                    )}
                                </button>
                            </div>
                            {couponError && (
                                <p className="text-xs font-inter text-red-600">{couponError}</p>
                            )}
                        </div>
                    )}
                </div>
            )}

            {isBookingClosed ? (
                <button
                    type="button"
                    disabled
                    className="btn-secondary w-full text-center !py-4 text-base cursor-not-allowed opacity-70"
                >
                    Booking Closed
                </button>
            ) : isSoldOut ? (
                <button
                    onClick={onShowWaitlist}
                    className="btn-secondary w-full text-center !py-4 text-base"
                >
                    Join Waitlist
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
            <p className="text-center text-xs font-inter text-dark-muted mt-3">
                {isBookingClosed
                    ? `Bookings close ${BOOKING_CUTOFF_HOURS} hours before the workshop starts.`
                    : isSoldOut
                      ? "All spots are taken. Join the waitlist to be notified if someone cancels."
                      : user
                        ? "Secure payments via Razorpay. You won't be charged twice even if something goes wrong."
                        : "Log in to book. Payments are processed securely via Razorpay."}
            </p>
            {holdError && (
                <p className="text-center text-xs font-inter text-red-600 mt-2">{holdError}</p>
            )}

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
        </motion.div>
    );
}
