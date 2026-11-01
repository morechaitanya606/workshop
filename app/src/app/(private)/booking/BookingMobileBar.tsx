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
    savings,
    guests,
    holdRemainingMs,
    mode,
    busy,
    disabled,
    ctaLabel,
    isRazorpayReady,
    submitting,
    awaitingConfirmation,
    confirmBusy,
    onPay,
}: {
    /** Null while the service fee is unknown: a placeholder, never a guessed total. */
    total: number | null;
    /** Early Bird + offer savings (never the fee); shown in green when above zero. */
    savings: number;
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
    /** A paid order is being confirmed right now (else it waits for a connection or a login). */
    confirmBusy: boolean;
    onPay: () => void;
}) {
    const showSummary = () => {
        document
            .getElementById(MOBILE_SUMMARY_ID)
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    // The button takes the width of its label (wrapping past 46%), so the total, the timer and
    // "You save" always get the rest: at 320-390 px two equal halves overlapped them.
    const buttonClass =
        "btn-primary min-w-0 max-w-[46%] shrink-0 !px-4 !py-3 disabled:cursor-not-allowed disabled:opacity-50";

    const buttonContent = awaitingConfirmation ? (
        confirmBusy ? (
            <>
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                Confirming...
            </>
        ) : (
            <>Payment received</>
        )
    ) : submitting ? (
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
            Pay now
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
                        className="flex min-w-0 flex-1 items-center rounded-xl py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
                    >
                        <span className="min-w-0 flex-1">
                            <span className="flex items-center justify-between gap-2">
                                <span className="whitespace-nowrap text-[11px] font-inter font-semibold uppercase tracking-wide text-dark-muted">
                                    Total &middot; {guests} {guests === 1 ? "guest" : "guests"}
                                </span>
                                <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-inter font-semibold text-terracotta">
                                    <span className="sr-only min-[380px]:not-sr-only">Summary</span>
                                    <ChevronDown
                                        aria-hidden="true"
                                        className="h-3.5 w-3.5 -rotate-180"
                                    />
                                </span>
                            </span>
                            {/* Wraps instead of overflowing: the timer drops to its own line when
                                the width runs out. "incl. GST" is also in the summary card. */}
                            <span className="flex flex-wrap items-center gap-x-2">
                                <span className="whitespace-nowrap font-playfair text-xl font-medium leading-tight text-dark">
                                    {total === null ? (
                                        <span
                                            role="img"
                                            aria-label="Total loading"
                                            className="inline-block h-5 w-16 animate-pulse rounded bg-cream-200 align-middle"
                                        />
                                    ) : (
                                        formatCurrency(total)
                                    )}
                                </span>
                                <span className="hidden whitespace-nowrap text-[10px] font-inter text-dark-muted min-[360px]:inline">
                                    incl. GST
                                </span>
                                <HoldTimerChip remainingMs={holdRemainingMs} />
                            </span>
                            {savings > 0 && (
                                <span className="block whitespace-nowrap text-[11px] font-inter font-semibold text-emerald-700">
                                    You save {formatCurrency(savings)}
                                </span>
                            )}
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
