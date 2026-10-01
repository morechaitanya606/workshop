"use client";

import Image from "next/image";
import Link from "next/link";
import { useId } from "react";
import {
    Calendar,
    Clock,
    Loader2,
    MapPin,
    RotateCcw,
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
    const couponInputId = useId();
    const locationLabel = workshop.eventAddress || `${workshop.location}, ${workshop.city}`;
    const guestLabel = `${guests} ${guests === 1 ? "guest" : "guests"}`;

    return (
        <div>
            <h3 className="mb-4 text-sm font-inter font-bold uppercase tracking-wider text-dark-muted">
                Order summary
            </h3>

            <div className="flex gap-3">
                <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-cream-200">
                    <Image
                        src={workshop.coverImage}
                        alt=""
                        fill
                        sizes="80px"
                        className="object-cover"
                    />
                </div>
                <div className="min-w-0">
                    <h4 className="font-playfair text-base font-semibold leading-tight text-dark">
                        {workshop.title}
                    </h4>
                    {/* Never show a filled star beside "0" on the payment page. */}
                    {workshop.reviewCount > 0 && (
                        <div className="mt-1 flex items-center gap-1">
                            <Star
                                className="h-3 w-3 fill-terracotta text-terracotta"
                                aria-hidden="true"
                            />
                            <span className="text-xs font-inter font-semibold text-dark">
                                {workshop.rating}
                            </span>
                            <span className="text-xs font-inter text-dark-muted">
                                ({workshop.reviewCount})
                            </span>
                        </div>
                    )}
                </div>
            </div>

            <ul className="mt-4 space-y-2 border-t border-clay/40 py-4 text-sm font-inter text-dark-secondary">
                <li className="flex items-start gap-2.5">
                    <Calendar
                        className="mt-0.5 h-4 w-4 shrink-0 text-dark-muted"
                        aria-hidden="true"
                    />
                    <span>
                        {formatDate(workshop.date)} <span aria-hidden="true">&middot;</span>{" "}
                        {workshop.time}
                    </span>
                </li>
                <li className="flex items-start gap-2.5">
                    <Clock className="mt-0.5 h-4 w-4 shrink-0 text-dark-muted" aria-hidden="true" />
                    {workshop.duration}
                </li>
                <li className="flex items-start gap-2.5">
                    <MapPin
                        className="mt-0.5 h-4 w-4 shrink-0 text-dark-muted"
                        aria-hidden="true"
                    />
                    <span className="min-w-0 break-words">{locationLabel}</span>
                </li>
                <li className="flex items-start gap-2.5">
                    <Users className="mt-0.5 h-4 w-4 shrink-0 text-dark-muted" aria-hidden="true" />
                    {guestLabel}
                </li>
            </ul>

            <dl className="space-y-2 border-t border-clay/40 pt-4 text-sm font-inter">
                <div className="flex justify-between gap-3">
                    <dt className="text-dark-secondary">
                        {formatCurrency(workshop.price || 0)} &times; {guestLabel}
                    </dt>
                    <dd
                        className={
                            isEbEligible ? "text-dark-muted line-through" : "font-medium text-dark"
                        }
                    >
                        {formatCurrency(subtotalOriginal)}
                    </dd>
                </div>
                {isEbEligible && (
                    <div className="flex justify-between gap-3 text-emerald-700">
                        <dt className="flex items-center gap-1">
                            <Tag className="h-3.5 w-3.5" aria-hidden="true" />
                            Early Bird offer
                        </dt>
                        <dd className="font-medium">-{formatCurrency(earlyBirdDiscountTotal)}</dd>
                    </div>
                )}
                {appliedCoupon && (
                    <div className="flex justify-between gap-3 text-emerald-700">
                        <dt className="flex items-center gap-1">
                            <Tag className="h-3.5 w-3.5" aria-hidden="true" />
                            {appliedCoupon.code}
                            <button
                                type="button"
                                onClick={onRemoveCoupon}
                                className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                                aria-label={`Remove coupon ${appliedCoupon.code}`}
                            >
                                <X className="h-3 w-3" aria-hidden="true" />
                            </button>
                        </dt>
                        <dd className="font-medium">-{formatCurrency(discountAmount)}</dd>
                    </div>
                )}
                <div className="flex justify-between gap-3">
                    <dt className="text-dark-secondary">Service fee</dt>
                    <dd className="font-medium text-dark">{formatCurrency(serviceFee)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 border-t border-clay/40 pt-3">
                    <dt className="font-inter text-base font-bold text-dark">Total</dt>
                    <dd className="font-playfair text-2xl font-medium text-dark">
                        {formatCurrency(total)}
                    </dd>
                </div>
            </dl>

            {!appliedCoupon && (
                <div className="mt-4 border-t border-clay/40 pt-4">
                    {!showCouponInput ? (
                        <button
                            type="button"
                            onClick={onShowCouponInput}
                            className="inline-flex items-center gap-1.5 rounded text-sm font-inter font-medium text-terracotta transition-colors hover:text-terracotta-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
                        >
                            <Tag className="h-4 w-4" aria-hidden="true" /> Have a coupon code?
                        </button>
                    ) : (
                        <div className="space-y-2">
                            <label htmlFor={couponInputId} className="sr-only">
                                Discount code
                            </label>
                            <div className="flex gap-2">
                                <input
                                    id={couponInputId}
                                    type="text"
                                    placeholder="Discount code"
                                    autoComplete="off"
                                    autoCapitalize="characters"
                                    spellCheck={false}
                                    value={couponCode}
                                    onChange={(event) => onCouponCodeChange(event.target.value)}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter") {
                                            event.preventDefault();
                                            onApplyCoupon();
                                        }
                                    }}
                                    aria-invalid={Boolean(couponError)}
                                    aria-describedby={
                                        couponError ? `${couponInputId}-error` : undefined
                                    }
                                    className="min-w-0 flex-1 rounded-xl border border-clay bg-white px-3 py-2 text-base font-inter uppercase placeholder:normal-case focus:border-terracotta focus:outline-none focus:ring-2 focus:ring-terracotta/20 sm:text-sm"
                                />
                                <button
                                    type="button"
                                    onClick={onApplyCoupon}
                                    disabled={!couponCode.trim() || isApplyingCoupon}
                                    className="flex min-w-[80px] items-center justify-center rounded-xl bg-dark-text px-4 py-2 text-sm font-inter font-medium text-white transition-colors hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dark-text focus-visible:ring-offset-2 disabled:opacity-50"
                                >
                                    {isApplyingCoupon ? (
                                        <Loader2
                                            className="h-4 w-4 animate-spin"
                                            aria-label="Applying"
                                        />
                                    ) : (
                                        "Apply"
                                    )}
                                </button>
                            </div>
                            {couponError && (
                                <p
                                    id={`${couponInputId}-error`}
                                    role="alert"
                                    className="text-xs font-inter text-red-600"
                                >
                                    {couponError}
                                </p>
                            )}
                        </div>
                    )}
                </div>
            )}

            <ul className="mt-5 space-y-2.5 rounded-xl bg-cream-100 p-3.5 text-xs font-inter text-dark-secondary">
                <li className="flex items-start gap-2.5">
                    <ShieldCheck
                        className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
                        aria-hidden="true"
                    />
                    Secure payment via Razorpay
                </li>
                <li className="flex items-start gap-2.5">
                    <RotateCcw
                        className="mt-0.5 h-4 w-4 shrink-0 text-terracotta"
                        aria-hidden="true"
                    />
                    <span>
                        {CANCELLATION_POLICY.hostCancellationSummary} Otherwise bookings are
                        generally non-refundable, and no cancellation within{" "}
                        {CANCELLATION_POLICY.noCancellationCutoffHoursBeforeWorkshop}h of the start.{" "}
                        <Link
                            href="/cancellations"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold text-terracotta underline-offset-2 hover:underline"
                        >
                            Cancellation policy
                        </Link>
                    </span>
                </li>
            </ul>
        </div>
    );
}
