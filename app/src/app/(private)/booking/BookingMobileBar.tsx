"use client";

import { ChevronDown, Loader2, Lock } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { BOOKING_DETAILS_FORM_ID } from "./BookingGuestForm";
import { HoldTimerChip } from "./BookingHoldTimer";

/** Id of the order summary card that the page shows inline on phones and tablets. */
export const MOBILE_SUMMARY_ID = "mobile-order-summary";

/**
 * Bottom bar for screens without the sticky side summary (below `lg`): total, time left and the
 * main button. The full order summary is a card on the page itself (it used to hide in a sheet
 * behind this bar, which most visitors never opened); tapping the total scrolls to it.
 * It respects the home-indicator safe area.
 */
export default function BookingMobileBar({
    total,
    guests,
    holdRemainingMs,
    mode,
    busy,
    disabled,
    ctaLabel,
    isRazorpayReady,
    submitting,
    awaitingConfirmation,
    onPay,
}: {
    total: number;
    guests: number;
    holdRemainingMs: number | null;
    /** "details" submits the details form; "pay" starts checkout. */
    mode: "details" | "pay";
    busy: boolean;
    disabled: boolean;
    /** Label for the details-step button (state-aware); the pay button labels itself. */
    ctaLabel?: string;
    isRazorpayReady: boolean;
    submitting: boolean;
    awaitingConfirmation: boolean;
    onPay: () => void;
}) {
    const showSummary = () => {
        document
            .getElementById(MOBILE_SUMMARY_ID)
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    const buttonClass =
        "btn-primary min-w-0 flex-1 !px-4 !py-3 disabled:cursor-not-allowed disabled:opacity-50";

    const buttonContent = submitting ? (
        <>
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            Processing...
        </>
    ) : busy ? (
        <>
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            Updating seats...
        </>
    ) : mode === "details" ? (
        <>{ctaLabel ?? "Continue"}</>
    ) : !isRazorpayReady ? (
        <>
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            Loading...
        </>
    ) : (
        <>
            <Lock className="h-4 w-4" aria-hidden="true" />
            {awaitingConfirmation ? "Retry confirmation" : "Pay now"}
        </>
    );

    return (
        <>
            <div className="fixed inset-x-0 bottom-0 z-40 border-t border-clay/60 bg-white shadow-[0_-8px_30px_-12px_rgba(0,0,0,0.18)] lg:hidden">
                <div className="flex items-center gap-3 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
                    <button
                        type="button"
                        onClick={showSummary}
                        aria-controls={MOBILE_SUMMARY_ID}
                        className="flex min-w-0 flex-1 items-center gap-2 rounded-xl py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
                    >
                        <span className="min-w-0">
                            <span className="block whitespace-nowrap text-[11px] font-inter font-semibold uppercase tracking-wide text-dark-muted">
                                Total &middot; {guests} {guests === 1 ? "guest" : "guests"}
                            </span>
                            <span className="flex items-center gap-2">
                                <span className="whitespace-nowrap font-playfair text-xl font-medium leading-tight text-dark">
                                    {formatCurrency(total)}
                                </span>
                                <span className="whitespace-nowrap text-[10px] font-inter text-dark-muted">
                                    incl. GST
                                </span>
                                <HoldTimerChip remainingMs={holdRemainingMs} />
                            </span>
                        </span>
                        <span className="ml-auto inline-flex shrink-0 items-center gap-0.5 text-[11px] font-inter font-semibold text-terracotta">
                            Summary
                            <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 -rotate-180" />
                        </span>
                    </button>

                    {mode === "details" ? (
                        <button
                            type="submit"
                            form={BOOKING_DETAILS_FORM_ID}
                            disabled={disabled}
                            className={buttonClass}
                        >
                            {buttonContent}
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={onPay}
                            disabled={disabled}
                            className={buttonClass}
                        >
                            {buttonContent}
                        </button>
                    )}
                </div>
            </div>
        </>
    );
}
