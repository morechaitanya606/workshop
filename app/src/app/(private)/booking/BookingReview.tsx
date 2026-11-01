"use client";

import { useEffect, useRef } from "react";
import { Armchair, Loader2, Lock, Pencil } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { BookingFormData } from "./types";
import type { PriceChange } from "./useBookingWorkflow";

function ReviewRow({
    title,
    editLabel,
    onEdit,
    children,
}: {
    title: string;
    editLabel: string;
    onEdit: () => void;
    children: React.ReactNode;
}) {
    return (
        <div className="rounded-2xl border border-clay/50 bg-cream-50 p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                    {title}
                </h3>
                <button
                    type="button"
                    onClick={onEdit}
                    aria-label={editLabel}
                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-inter font-semibold text-terracotta transition-colors hover:bg-terracotta-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
                >
                    <Pencil className="h-3 w-3" aria-hidden="true" />
                    Edit
                </button>
            </div>
            {children}
        </div>
    );
}

export default function BookingReview({
    guests,
    formData,
    onEditSeats,
    onEditDetails,
    onPay,
    isCheckoutDisabled,
    isRazorpayReady,
    submitting,
    awaitingConfirmation,
    confirmBusy,
    total,
    priceChange,
    notice,
}: {
    guests: number;
    formData: BookingFormData;
    onEditSeats: () => void;
    onEditDetails: () => void;
    onPay: () => void;
    isCheckoutDisabled: boolean;
    isRazorpayReady: boolean;
    submitting: boolean;
    awaitingConfirmation: boolean;
    /** A paid order is being confirmed right now (else it is waiting for a connection or a login). */
    confirmBusy: boolean;
    /** Null while the service fee is unknown. */
    total: number | null;
    /** The server priced the order differently from what was shown: a fresh tap pays it. */
    priceChange: PriceChange | null;
    /** A non-error note about the price (a coupon code that was removed). */
    notice: string | null;
}) {
    const fullName = `${formData.firstName} ${formData.lastName}`.trim();
    const shownChairs = Math.min(guests, 8);

    // The fixed bar's Pay button is what was tapped, so the review card may be off screen: bring
    // the new total into view instead of letting it pass unnoticed.
    const changeAlertRef = useRef<HTMLDivElement>(null);
    const changeKey = priceChange
        ? `${priceChange.previousTotal ?? ""}>${priceChange.newTotal}`
        : "";
    useEffect(() => {
        if (!changeKey) return;
        const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
        changeAlertRef.current?.scrollIntoView?.({
            block: "center",
            behavior: reduceMotion ? "auto" : "smooth",
        });
    }, [changeKey]);

    return (
        <div className="space-y-5">
            <div>
                <h2 className="heading-sm">Review &amp; pay</h2>
                <p className="mt-1 text-body-sm">
                    Check everything, then pay securely. Your booking is confirmed once the payment
                    is verified.
                </p>
            </div>

            <ReviewRow title="Seats" editLabel="Edit seats" onEdit={onEditSeats}>
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center" aria-hidden="true">
                        {Array.from({ length: shownChairs }, (_, index) => (
                            <span
                                key={index}
                                className={`-ml-1.5 inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-terracotta text-white first:ml-0`}
                            >
                                <Armchair className="h-4 w-4" />
                            </span>
                        ))}
                        {guests > shownChairs && (
                            <span className="-ml-1.5 inline-flex h-8 min-w-8 items-center justify-center rounded-full border-2 border-white bg-terracotta-100 px-1.5 text-xs font-inter font-semibold text-terracotta-800">
                                +{guests - shownChairs}
                            </span>
                        )}
                    </div>
                    <p className="text-sm font-inter font-semibold text-dark">
                        {guests} {guests === 1 ? "seat" : "seats"} reserved
                    </p>
                </div>
            </ReviewRow>

            <ReviewRow title="Your details" editLabel="Edit details" onEdit={onEditDetails}>
                <dl className="grid gap-x-6 gap-y-2 text-sm font-inter sm:grid-cols-2">
                    <div>
                        <dt className="text-xs text-dark-muted">Name</dt>
                        <dd className="break-words font-medium text-dark">{fullName}</dd>
                    </div>
                    <div>
                        <dt className="text-xs text-dark-muted">Mobile</dt>
                        <dd className="font-medium text-dark">+91 {formData.phone}</dd>
                    </div>
                    <div className="sm:col-span-2">
                        <dt className="text-xs text-dark-muted">Email</dt>
                        <dd className="break-all font-medium text-dark">{formData.email}</dd>
                    </div>
                    {formData.notes.trim() && (
                        <div className="sm:col-span-2">
                            <dt className="text-xs text-dark-muted">Notes</dt>
                            <dd className="whitespace-pre-line break-words text-dark-secondary">
                                {formData.notes.trim()}
                            </dd>
                        </div>
                    )}
                </dl>
            </ReviewRow>

            {priceChange && (
                <div
                    ref={changeAlertRef}
                    role="alert"
                    className="scroll-mt-24 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-inter text-amber-950"
                >
                    <p className="font-semibold">
                        Your total is now {formatCurrency(priceChange.newTotal)}
                        {priceChange.previousTotal !== null &&
                            priceChange.previousTotal !== priceChange.newTotal && (
                                <> (was {formatCurrency(priceChange.previousTotal)})</>
                            )}
                        .
                    </p>
                    {priceChange.reason && <p className="mt-0.5">{priceChange.reason}</p>}
                    <p className="mt-1 text-xs text-amber-900">
                        Nothing has been charged. Check the order summary, then tap Pay to continue
                        at this amount.
                    </p>
                </div>
            )}
            {notice && !priceChange && (
                <p
                    role="status"
                    className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-inter text-amber-950"
                >
                    {notice}
                </p>
            )}

            <button
                type="button"
                onClick={onPay}
                disabled={isCheckoutDisabled}
                className="btn-primary hidden w-full !py-3.5 disabled:cursor-not-allowed disabled:opacity-50 lg:inline-flex"
            >
                {awaitingConfirmation ? (
                    confirmBusy ? (
                        <>
                            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                            Confirming your booking...
                        </>
                    ) : (
                        <>Payment received</>
                    )
                ) : submitting ? (
                    <>
                        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                        Processing...
                    </>
                ) : !isRazorpayReady ? (
                    <>
                        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                        Loading payment...
                    </>
                ) : (
                    <>
                        <Lock className="h-4 w-4" aria-hidden="true" />
                        {total === null ? "Pay now" : `Pay ${formatCurrency(total)}`}
                    </>
                )}
            </button>
            <p className="hidden text-center text-xs font-inter text-dark-muted lg:block">
                All prices are inclusive of GST. Payments are processed by Razorpay. We never see
                your card details.
            </p>
        </div>
    );
}
