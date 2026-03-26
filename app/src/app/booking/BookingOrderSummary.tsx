"use client";

import Image from "next/image";
import {
    Calendar,
    Clock,
    Loader2,
    MapPin,
    RotateCcw,
    Shield,
    ShieldCheck,
    Star,
    Tag,
    Users,
    X,
} from "lucide-react";
import { CANCELLATION_POLICY } from "@/lib/cancellation-policy";
import type { Workshop } from "@/lib/data";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { AppliedCoupon } from "./types";

export default function BookingOrderSummary({
    workshop,
    guests,
    subtotalOriginal,
    isEbEligible,
    earlyBirdDiscountTotal,
    appliedCoupon,
    discountAmount,
    serviceFee,
    total,
    showCouponInput,
    couponCode,
    isApplyingCoupon,
    couponError,
    onShowCouponInput,
    onCouponCodeChange,
    onApplyCoupon,
    onRemoveCoupon,
}: {
    workshop: Workshop;
    guests: number;
    subtotalOriginal: number;
    isEbEligible: boolean;
    earlyBirdDiscountTotal: number;
    appliedCoupon: AppliedCoupon | null;
    discountAmount: number;
    serviceFee: number;
    total: number;
    showCouponInput: boolean;
    couponCode: string;
    isApplyingCoupon: boolean;
    couponError: string;
    onShowCouponInput: () => void;
    onCouponCodeChange: (value: string) => void;
    onApplyCoupon: () => void;
    onRemoveCoupon: () => void;
}) {
    const locationLabel = workshop.eventAddress || `${workshop.location}, ${workshop.city}`;

    return (
        <>
            <h3 className="text-sm font-inter font-bold text-dark-muted uppercase tracking-wider mb-4">
                Order Summary
            </h3>
            <div className="flex gap-3 mb-4">
                <div className="relative w-24 h-24 rounded-xl overflow-hidden flex-shrink-0">
                    <Image
                        src={workshop.coverImage}
                        alt={workshop.title}
                        fill
                        className="object-cover"
                    />
                </div>
                <div>
                    <h4 className="font-playfair font-semibold text-dark text-sm leading-tight">
                        {workshop.title}
                    </h4>
                    <div className="flex items-center gap-1 mt-1">
                        <Star className="w-3 h-3 text-terracotta fill-terracotta" />
                        <span className="text-xs font-inter font-semibold text-dark">
                            {workshop.rating}
                        </span>
                        <span className="text-xs font-inter text-dark-muted">
                            ({workshop.reviewCount})
                        </span>
                    </div>
                </div>
            </div>

            <div className="space-y-3 py-4 border-t border-gray-100">
                <div className="flex items-center gap-2 text-sm font-inter text-dark-secondary">
                    <Calendar className="w-4 h-4 text-dark-muted" />
                    {formatDate(workshop.date)} <span aria-hidden>&middot;</span> {workshop.time}
                </div>
                <div className="flex items-center gap-2 text-sm font-inter text-dark-secondary">
                    <Clock className="w-4 h-4 text-dark-muted" />
                    {workshop.duration}
                </div>
                <div className="flex items-center gap-2 text-sm font-inter text-dark-secondary">
                    <MapPin className="w-4 h-4 text-dark-muted" />
                    {locationLabel}
                </div>
                <div className="flex items-center gap-2 text-sm font-inter text-dark-secondary">
                    <Users className="w-4 h-4 text-dark-muted" />
                    {guests} guests
                </div>
            </div>

            <div className="space-y-2 pt-4 border-t border-gray-100">
                <div className="flex justify-between text-sm font-inter">
                    <span className="text-dark-secondary">
                        {formatCurrency(workshop.price || 0)} x {guests} guests
                    </span>
                    <span
                        className={
                            isEbEligible ? "text-dark-muted line-through" : "text-dark font-medium"
                        }
                    >
                        {formatCurrency(subtotalOriginal)}
                    </span>
                </div>
                {isEbEligible && (
                    <div className="flex justify-between text-sm font-inter text-emerald-600">
                        <span className="flex items-center gap-1">
                            <Tag className="w-3.5 h-3.5 text-emerald-500" />
                            Early Bird Offer
                        </span>
                        <span className="font-medium">
                            -{formatCurrency(earlyBirdDiscountTotal)}
                        </span>
                    </div>
                )}
                {appliedCoupon && (
                    <div className="flex justify-between text-sm font-inter text-emerald-600">
                        <span className="flex items-center gap-1">
                            <Tag className="w-3.5 h-3.5" />
                            {appliedCoupon.code}
                            <button
                                type="button"
                                onClick={onRemoveCoupon}
                                className="hover:text-emerald-700 ml-1"
                                aria-label="Remove coupon"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        </span>
                        <span className="font-medium">-{formatCurrency(discountAmount)}</span>
                    </div>
                )}
                <div className="flex justify-between text-sm font-inter py-3 border-b border-gray-100">
                    <span className="text-dark-secondary">Service fee</span>
                    <span className="text-dark font-medium">{formatCurrency(serviceFee)}</span>
                </div>
                <div className="flex justify-between text-base font-inter font-bold pt-3 border-t border-gray-100">
                    <span className="text-dark">Total</span>
                    <span className="text-dark">{formatCurrency(total)}</span>
                </div>
            </div>

            {!appliedCoupon && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                    {!showCouponInput ? (
                        <button
                            type="button"
                            onClick={onShowCouponInput}
                            className="text-sm font-inter text-terracotta hover:text-terracotta/80 font-medium inline-flex items-center gap-1.5 transition-colors"
                        >
                            <Tag className="w-4 h-4" /> Have a coupon code?
                        </button>
                    ) : (
                        <div className="space-y-2">
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder="Discount code"
                                    value={couponCode}
                                    onChange={(event) => onCouponCodeChange(event.target.value)}
                                    className="flex-1 bg-white border border-clay/50 rounded-xl px-3 py-2 text-sm font-inter focus:outline-none focus:border-terracotta focus:ring-1 focus:ring-terracotta/30 transition-all"
                                />
                                <button
                                    type="button"
                                    onClick={onApplyCoupon}
                                    disabled={!couponCode.trim() || isApplyingCoupon}
                                    className="bg-dark hover:bg-dark-hover disabled:opacity-50 text-white rounded-xl px-4 py-2 text-sm font-inter font-medium transition-colors min-w-[80px] flex items-center justify-center"
                                >
                                    {isApplyingCoupon ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        "Apply"
                                    )}
                                </button>
                            </div>
                            {couponError && (
                                <p className="text-red-500 text-xs font-inter">{couponError}</p>
                            )}
                        </div>
                    )}
                </div>
            )}

            <div className="grid grid-cols-2 gap-3 mt-4">
                <div className="flex items-center gap-2 bg-cream-100 rounded-xl px-3 py-2.5">
                    <Shield className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span className="text-xs font-inter text-dark-secondary">
                        Secure payment via Razorpay
                    </span>
                </div>
                <div className="flex items-center gap-2 bg-cream-100 rounded-xl px-3 py-2.5">
                    <RotateCcw className="w-4 h-4 text-blue-600 flex-shrink-0" />
                    <span className="text-xs font-inter text-dark-secondary">
                        No cancellation within{" "}
                        {CANCELLATION_POLICY.noCancellationCutoffHoursBeforeWorkshop}h
                    </span>
                </div>
                <div className="flex items-center gap-2 bg-cream-100 rounded-xl px-3 py-2.5">
                    <Users className="w-4 h-4 text-violet-600 flex-shrink-0" />
                    <span className="text-xs font-inter text-dark-secondary">
                        1,000+ happy attendees
                    </span>
                </div>
                <div className="flex items-center gap-2 bg-cream-100 rounded-xl px-3 py-2.5">
                    <ShieldCheck className="w-4 h-4 text-terracotta flex-shrink-0" />
                    <span className="text-xs font-inter text-dark-secondary">
                        100% refund if host cancels
                    </span>
                </div>
            </div>
        </>
    );
}
