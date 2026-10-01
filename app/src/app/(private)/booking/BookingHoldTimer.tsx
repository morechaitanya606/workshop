"use client";

import { Loader2, Timer, TriangleAlert } from "lucide-react";
import { BOOKING_HOLD_MINUTES } from "@/lib/booking-time";

/** The full hold window, for the progress bar; the hold route reserves seats this long. */
export const HOLD_WINDOW_MS = BOOKING_HOLD_MINUTES * 60 * 1000;
const URGENT_MS = 2 * 60 * 1000;

export function formatRemainingTime(milliseconds: number) {
    const clamped = Math.max(0, Math.floor(milliseconds / 1000));
    const minutes = Math.floor(clamped / 60);
    const seconds = clamped % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** Only changes at a few thresholds, so the live region speaks rarely instead of every second. */
export function holdAnnouncement(remainingMs: number | null) {
    if (remainingMs === null || remainingMs <= 0) return "";
    if (remainingMs <= 60_000) return "Less than a minute left on your seat hold.";
    if (remainingMs <= 120_000) return "2 minutes left on your seat hold.";
    if (remainingMs <= 300_000) return "5 minutes left on your seat hold.";
    return "";
}

type HoldTimerProps = {
    /** Milliseconds left, or null when the hold has no known expiry. */
    remainingMs: number | null;
    hasHold: boolean;
    expired: boolean;
    /** Re-reserves the same number of seats (hold missing or expired). */
    onReserveAgain: () => void;
    busy: boolean;
    /** The customer already paid; the countdown no longer matters. */
    paid?: boolean;
};

export function HoldTimerChip({ remainingMs }: { remainingMs: number | null }) {
    if (remainingMs === null || remainingMs <= 0) return null;
    const urgent = remainingMs <= URGENT_MS;

    return (
        <span
            className={`inline-flex items-center gap-1 text-[11px] font-inter font-semibold tabular-nums ${
                urgent ? "text-red-700" : "text-dark-muted"
            }`}
        >
            <Timer className="h-3 w-3" aria-hidden="true" />
            <span className="sr-only">Seats held for </span>
            {formatRemainingTime(remainingMs)}
            <span aria-hidden="true"> left</span>
        </span>
    );
}

export default function BookingHoldTimer({
    remainingMs,
    hasHold,
    expired,
    onReserveAgain,
    busy,
    paid = false,
}: HoldTimerProps) {
    if (paid) return null;

    if (!hasHold || expired) {
        return (
            <div
                role="alert"
                className="mb-6 flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
            >
                <div className="flex items-start gap-3">
                    <TriangleAlert
                        className="mt-0.5 h-5 w-5 shrink-0 text-red-600"
                        aria-hidden="true"
                    />
                    <div className="text-sm font-inter text-red-800">
                        <p className="font-semibold">
                            {expired ? "Your seat hold has expired" : "Your seats aren’t held yet"}
                        </p>
                        <p className="mt-0.5 text-red-700">
                            {expired
                                ? "Hold them again to carry on, if they’re still free."
                                : "Hold your seats to continue to payment."}
                        </p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={onReserveAgain}
                    disabled={busy}
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-red-600 px-5 py-2.5 text-sm font-inter font-semibold text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                    {expired ? "Reserve again" : "Hold my seats"}
                </button>
            </div>
        );
    }

    if (remainingMs === null) {
        return (
            <div className="mb-6 flex items-center gap-3 rounded-2xl border border-clay/60 bg-white px-4 py-3 text-sm font-inter text-dark-secondary">
                <Timer className="h-5 w-5 text-terracotta" aria-hidden="true" />
                Your seats are held while you check out.
            </div>
        );
    }

    const urgent = remainingMs <= URGENT_MS;
    const progress = Math.min(100, Math.max(0, (remainingMs / HOLD_WINDOW_MS) * 100));

    return (
        <div
            className={`mb-6 rounded-2xl border px-4 py-3.5 ${
                urgent ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"
            }`}
        >
            <p className="sr-only" role="status" aria-live="polite">
                {holdAnnouncement(remainingMs)}
            </p>
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <Timer
                        className={`h-5 w-5 shrink-0 ${urgent ? "text-red-600" : "text-amber-700"}`}
                        aria-hidden="true"
                    />
                    <div
                        className={`text-sm font-inter ${urgent ? "text-red-800" : "text-amber-900"}`}
                    >
                        <p className="font-semibold">
                            {urgent ? "Almost out of time" : "Your seats are held for you"}
                        </p>
                        <p className="text-xs opacity-90">Finish paying before the timer ends.</p>
                    </div>
                </div>
                <div className="text-right">
                    <p
                        className={`font-playfair text-2xl font-medium leading-none tabular-nums ${
                            urgent ? "text-red-700" : "text-amber-900"
                        }`}
                    >
                        {formatRemainingTime(remainingMs)}
                    </p>
                    <p className="mt-1 text-[10px] font-inter font-semibold uppercase tracking-wider text-dark-muted">
                        Time left
                    </p>
                </div>
            </div>
            <div
                className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/70"
                role="progressbar"
                aria-label="Seat hold time remaining"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress)}
            >
                <div
                    className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${
                        urgent ? "bg-red-500" : "bg-amber-500"
                    }`}
                    style={{ width: `${progress}%` }}
                />
            </div>
        </div>
    );
}
