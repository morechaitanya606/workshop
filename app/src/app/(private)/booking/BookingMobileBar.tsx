"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronUp, Loader2, Lock } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { BOOKING_DETAILS_FORM_ID } from "./BookingGuestForm";
import { HoldTimerChip } from "./BookingHoldTimer";

/**
 * Bottom bar for screens without the sticky side summary (below `lg`).
 * Collapsed: total, time left and the main button. Expanded: the full order summary slides up
 * above it. It respects the home-indicator safe area.
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
    children,
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
    /** The order summary shown when expanded. */
    children: ReactNode;
}) {
    const [open, setOpen] = useState(false);
    const reduceMotion = Boolean(useReducedMotion());
    const sheetId = useId();

    useEffect(() => {
        if (!open) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [open]);

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
            <AnimatePresence>
                {open && (
                    <motion.button
                        type="button"
                        aria-label="Close order summary"
                        tabIndex={-1}
                        initial={reduceMotion ? false : { opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={reduceMotion ? { opacity: 0 } : { opacity: 0 }}
                        transition={{ duration: reduceMotion ? 0 : 0.2 }}
                        onClick={() => setOpen(false)}
                        className="fixed inset-0 z-30 bg-dark-text/30 lg:hidden"
                    />
                )}
            </AnimatePresence>

            <div className="fixed inset-x-0 bottom-0 z-40 border-t border-clay/60 bg-white shadow-[0_-8px_30px_-12px_rgba(0,0,0,0.18)] lg:hidden">
                <AnimatePresence initial={false}>
                    {open && (
                        <motion.div
                            id={sheetId}
                            key="sheet"
                            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                            transition={{
                                duration: reduceMotion ? 0 : 0.28,
                                ease: [0.22, 1, 0.36, 1],
                            }}
                            className="overflow-hidden"
                        >
                            <div className="max-h-[62dvh] overflow-y-auto overscroll-contain border-b border-clay/40 px-4 pb-4 pt-5">
                                {children}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className="flex items-center gap-3 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
                    <button
                        type="button"
                        onClick={() => setOpen((value) => !value)}
                        aria-expanded={open}
                        aria-controls={sheetId}
                        className="flex min-w-0 flex-1 items-center gap-2 rounded-xl py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
                    >
                        <span className="min-w-0">
                            <span className="block text-[11px] font-inter font-semibold uppercase tracking-wide text-dark-muted">
                                Total &middot; {guests} {guests === 1 ? "guest" : "guests"}
                            </span>
                            <span className="flex items-center gap-2">
                                <span className="font-playfair text-xl font-medium leading-tight text-dark">
                                    {formatCurrency(total)}
                                </span>
                                <HoldTimerChip remainingMs={holdRemainingMs} />
                            </span>
                        </span>
                        <ChevronUp
                            aria-hidden="true"
                            className={`h-5 w-5 shrink-0 text-dark-muted transition-transform ${
                                open ? "rotate-180" : ""
                            }`}
                        />
                        <span className="sr-only">{open ? "Hide" : "Show"} order summary</span>
                    </button>

                    {mode === "details" ? (
                        <button
                            type="submit"
                            form={BOOKING_DETAILS_FORM_ID}
                            disabled={disabled}
                            onClick={() => setOpen(false)}
                            className={buttonClass}
                        >
                            {buttonContent}
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={() => {
                                setOpen(false);
                                onPay();
                            }}
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
