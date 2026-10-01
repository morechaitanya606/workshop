"use client";

import { useMemo, useRef, type KeyboardEvent, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, Flame, Minus, Plus } from "lucide-react";
import {
    barSegments,
    computeSeatStates,
    getSeatLayoutMode,
    guestsAfterSeatClick,
    seatAnnouncement,
    seatAriaLabel,
    shouldShowLowSeatsBadge,
    summarizeSeats,
    tableChairPositions,
    type SeatState,
} from "./seat-logic";

export type SeatMapProps = {
    maxSeats: number;
    seatsRemaining: number;
    /** Guests the customer is currently picking (the "yours" chairs). */
    guests: number;
    /** Upper bound for `guests` (per-booking cap, bounded by seats left). */
    maxGuests: number;
    onGuestsChange: (next: number) => void;
    /** Freezes every chair (e.g. while a hold update or payment is in flight). */
    disabled?: boolean;
    /** Shown under the map when `disabled`, so the lock is never silent. */
    disabledReason?: string;
    /** Slot under the legend, used for the "update seats" action bar. */
    footer?: ReactNode;
};

/**
 * One chair. The three states differ in shape as well as colour:
 * taken     = filled stone chair with a person in it
 * available = empty outline chair
 * yours     = solid terracotta chair with a check mark
 */
function ChairIcon({ state, className = "h-8 w-8" }: { state: SeatState; className?: string }) {
    const tone =
        state === "yours"
            ? "fill-terracotta stroke-terracotta-700"
            : state === "taken"
              ? "fill-sand-200 stroke-sand-400"
              : "fill-white stroke-terracotta-300 group-hover:fill-terracotta-50 group-hover:stroke-terracotta";

    return (
        <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
            <g className={`${tone} transition-colors`} strokeWidth="1.6" strokeLinejoin="round">
                <rect x="8" y="3" width="16" height="13" rx="4.5" />
                <rect x="5.5" y="15" width="21" height="8" rx="3" />
                <path d="M9.5 23v6M22.5 23v6" strokeLinecap="round" fill="none" />
            </g>
            {state === "yours" && (
                <path
                    d="M12.2 9.6l2.9 2.9 5.2-5.6"
                    fill="none"
                    stroke="#fff"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            )}
            {state === "taken" && (
                <g className="fill-sand-500">
                    <circle cx="16" cy="7.6" r="2.3" />
                    <path d="M11 15c0-2.9 2.2-4.2 5-4.2s5 1.3 5 4.2z" />
                </g>
            )}
        </svg>
    );
}

function LegendItem({ state, label }: { state: SeatState; label: string }) {
    return (
        <li className="inline-flex items-center gap-1.5 text-xs font-inter text-dark-secondary">
            <span className="group inline-flex">
                <ChairIcon state={state} className="h-6 w-6" />
            </span>
            {label}
        </li>
    );
}

type ChairButtonProps = {
    index: number;
    state: SeatState;
    label: string;
    locked: boolean;
    tabbable: boolean;
    reduceMotion: boolean;
    showNumber?: boolean;
    onPress: () => void;
};

function ChairButton({
    index,
    state,
    label,
    locked,
    tabbable,
    reduceMotion,
    showNumber,
    onPress,
}: ChairButtonProps) {
    const isTaken = state === "taken";

    return (
        <motion.button
            type="button"
            data-seat={index}
            aria-label={label}
            aria-pressed={isTaken ? undefined : state === "yours"}
            disabled={isTaken || locked}
            tabIndex={tabbable ? 0 : -1}
            onClick={onPress}
            whileTap={reduceMotion || isTaken || locked ? undefined : { scale: 0.9 }}
            className={`group relative flex min-h-[2.75rem] min-w-10 flex-col sm:min-w-[2.75rem] items-center justify-center rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:ring-offset-2 focus-visible:ring-offset-white ${
                isTaken
                    ? "cursor-not-allowed"
                    : locked
                      ? "cursor-wait opacity-70"
                      : "cursor-pointer"
            }`}
        >
            <motion.span
                key={state}
                initial={reduceMotion ? false : { scale: 0.82 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 420, damping: 22 }}
                className="relative inline-flex"
            >
                <ChairIcon state={state} />
                {state === "yours" && (
                    <span className="absolute -right-1 -top-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-white ring-2 ring-white">
                        <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
                    </span>
                )}
            </motion.span>
            {showNumber && (
                <span
                    aria-hidden="true"
                    className={`mt-0.5 text-[10px] font-inter font-semibold leading-none ${
                        state === "yours"
                            ? "text-terracotta-700"
                            : isTaken
                              ? "text-sand-400"
                              : "text-dark-muted"
                    }`}
                >
                    {index + 1}
                </span>
            )}
        </motion.button>
    );
}

export default function SeatMap({
    maxSeats,
    seatsRemaining,
    guests,
    maxGuests,
    onGuestsChange,
    disabled = false,
    disabledReason,
    footer,
}: SeatMapProps) {
    const reduceMotion = Boolean(useReducedMotion());
    const containerRef = useRef<HTMLDivElement>(null);

    const summary = useMemo(
        () => summarizeSeats({ maxSeats, seatsRemaining, guests }),
        [maxSeats, seatsRemaining, guests]
    );
    const mode = getSeatLayoutMode(summary.capacity);
    const states = useMemo(
        () =>
            mode === "compact"
                ? []
                : computeSeatStates({ maxSeats, seatsRemaining, guests: summary.yours }),
        [mode, maxSeats, seatsRemaining, summary.yours]
    );
    const positions = useMemo(
        () => (mode === "table" ? tableChairPositions(summary.capacity) : []),
        [mode, summary.capacity]
    );

    if (summary.capacity <= 0) return null;

    const canAddMore = !disabled && guests < maxGuests && summary.open > 0;
    const canRemove = !disabled && guests > 1;
    const lowSeats = shouldShowLowSeatsBadge(summary.remaining);
    const soldOut = summary.remaining <= 0;

    const handleChairPress = (index: number) => {
        if (disabled) return;
        const next = guestsAfterSeatClick({ states, index, maxGuests });
        if (next !== null) onGuestsChange(next);
    };

    // Only one chair sits in the tab order; arrow keys move between the rest.
    const firstTabbable =
        states.findIndex((state) => state === "yours") !== -1
            ? states.findIndex((state) => state === "yours")
            : states.findIndex((state) => state === "available");

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"];
        if (!keys.includes(event.key) || !containerRef.current) return;

        const chairs = Array.from(
            containerRef.current.querySelectorAll<HTMLButtonElement>(
                "button[data-seat]:not(:disabled)"
            )
        );
        if (chairs.length === 0) return;

        const current = chairs.findIndex((chair) => chair === document.activeElement);
        let next = current;
        if (event.key === "ArrowRight" || event.key === "ArrowDown") {
            next = current < chairs.length - 1 ? current + 1 : 0;
        } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
            next = current > 0 ? current - 1 : chairs.length - 1;
        } else if (event.key === "Home") {
            next = 0;
        } else {
            next = chairs.length - 1;
        }

        event.preventDefault();
        chairs[next]?.focus();
        // Keep the roving tab stop on whatever now has focus.
        chairs.forEach((chair, position) => {
            chair.tabIndex = position === next ? 0 : -1;
        });
    };

    const renderChair = (index: number, showNumber: boolean) => {
        const state = states[index] ?? "available";
        return (
            <ChairButton
                key={index}
                index={index}
                state={state}
                label={seatAriaLabel(index, state)}
                locked={disabled}
                tabbable={index === firstTabbable}
                reduceMotion={reduceMotion}
                showNumber={showNumber}
                onPress={() => handleChairPress(index)}
            />
        );
    };

    const segments = barSegments(summary);

    return (
        <section aria-labelledby="seat-map-title" className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h2 id="seat-map-title" className="heading-sm">
                        Choose your seats
                    </h2>
                    <p className="mt-1 text-body-sm">
                        Tap a chair to add a guest, tap one of yours to release it.
                    </p>
                </div>
                {lowSeats && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-inter font-semibold text-amber-900">
                        <Flame className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
                        Only {summary.remaining} {summary.remaining === 1 ? "seat" : "seats"} left
                    </span>
                )}
            </div>

            {/* Polite, single message that follows every change. */}
            <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
                {seatAnnouncement(summary)}
            </p>

            <div
                ref={containerRef}
                role="group"
                aria-label={`Seat map: ${summary.capacity} seats, ${summary.taken} taken`}
                aria-busy={disabled || undefined}
                onKeyDown={handleKeyDown}
                className="rounded-2xl border border-clay/50 bg-gradient-to-b from-cream-50 to-cream-100 px-3 py-5 sm:px-6"
            >
                {mode === "table" && (
                    <div className="relative mx-auto aspect-square w-full max-w-[19rem] sm:max-w-[22rem]">
                        <div className="absolute inset-[24%] flex flex-col items-center justify-center rounded-full border-2 border-clay bg-cream-200 text-center shadow-inner">
                            <span className="font-playfair text-3xl leading-none text-dark">
                                {soldOut ? 0 : summary.remaining}
                            </span>
                            <span className="mt-1 px-2 text-[11px] font-inter font-semibold uppercase tracking-wide text-dark-muted">
                                of {summary.capacity} left
                            </span>
                        </div>
                        {positions.map((position, index) => (
                            <div
                                key={index}
                                className="absolute -translate-x-1/2 -translate-y-1/2"
                                style={{ left: `${position.left}%`, top: `${position.top}%` }}
                            >
                                {renderChair(index, false)}
                            </div>
                        ))}
                    </div>
                )}

                {mode === "rows" && (
                    <div className="mx-auto max-w-md">
                        <div className="mb-4 rounded-full border border-clay/60 bg-cream-200 py-1.5 text-center text-[11px] font-inter font-semibold uppercase tracking-[0.14em] text-dark-muted">
                            Front of the room
                        </div>
                        <div className="grid grid-cols-6 justify-items-center gap-x-1 gap-y-2 sm:grid-cols-8">
                            {states.map((_, index) => renderChair(index, true))}
                        </div>
                    </div>
                )}

                {mode === "compact" && (
                    <div className="mx-auto max-w-md space-y-5">
                        <div>
                            <div className="mb-2 flex items-baseline justify-between text-xs font-inter text-dark-secondary">
                                <span>
                                    <strong className="text-dark">{summary.taken}</strong> of{" "}
                                    {summary.capacity} booked
                                </span>
                                <span>{summary.remaining} left</span>
                            </div>
                            <div
                                className="flex h-3.5 w-full overflow-hidden rounded-full border border-clay/60 bg-white"
                                aria-hidden="true"
                            >
                                <span
                                    className="h-full"
                                    style={{
                                        width: `${segments.taken}%`,
                                        backgroundColor: "#d4c3a4",
                                        backgroundImage:
                                            "repeating-linear-gradient(135deg, rgba(255,255,255,0.45) 0 4px, transparent 4px 8px)",
                                    }}
                                />
                                <span
                                    className="h-full bg-terracotta"
                                    style={{
                                        width: `${segments.yours}%`,
                                        minWidth: summary.yours ? 6 : 0,
                                    }}
                                />
                            </div>
                        </div>

                        <div>
                            <p className="mb-2 text-center text-[11px] font-inter font-semibold uppercase tracking-[0.14em] text-dark-muted">
                                Your seats
                            </p>
                            <div className="flex flex-wrap items-center justify-center gap-1">
                                {Array.from({ length: summary.yours }, (_, position) => {
                                    const seatNumber = summary.taken + position + 1;
                                    return (
                                        <ChairButton
                                            key={position}
                                            index={seatNumber - 1}
                                            state="yours"
                                            label={`Seat ${seatNumber}, yours, selected. Press to release.`}
                                            locked={disabled || guests <= 1}
                                            tabbable={position === 0}
                                            reduceMotion={reduceMotion}
                                            showNumber
                                            onPress={() =>
                                                onGuestsChange(position === 0 ? 1 : position)
                                            }
                                        />
                                    );
                                })}
                                {canAddMore && (
                                    <button
                                        type="button"
                                        aria-label="Add a seat"
                                        onClick={() => onGuestsChange(guests + 1)}
                                        className="inline-flex min-h-[2.75rem] min-w-[2.75rem] items-center justify-center rounded-xl border-2 border-dashed border-terracotta-300 text-terracotta transition-colors hover:bg-terracotta-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
                                    >
                                        <Plus className="h-5 w-5" aria-hidden="true" />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {soldOut && (
                    <p className="mt-4 text-center text-sm font-inter font-semibold text-dark-secondary">
                        Fully booked
                    </p>
                )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
                <ul className="flex flex-wrap items-center gap-x-4 gap-y-2" aria-label="Legend">
                    <LegendItem state="taken" label="Taken" />
                    <LegendItem state="available" label="Available" />
                    <LegendItem state="yours" label="Yours" />
                </ul>

                <div className="inline-flex items-center gap-1 rounded-full border border-clay/60 bg-white p-1">
                    <button
                        type="button"
                        onClick={() => onGuestsChange(guests - 1)}
                        disabled={!canRemove}
                        aria-label="Remove one guest"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-dark transition-colors hover:bg-cream-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        <Minus className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <span className="min-w-[4.5rem] text-center text-sm font-inter font-semibold text-dark">
                        {guests} {guests === 1 ? "guest" : "guests"}
                    </span>
                    <button
                        type="button"
                        onClick={() => onGuestsChange(guests + 1)}
                        disabled={!canAddMore}
                        aria-label="Add one guest"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-dark transition-colors hover:bg-cream-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                    </button>
                </div>
            </div>

            <p className="text-xs font-inter text-dark-muted">
                {disabled && disabledReason
                    ? disabledReason
                    : "Chairs show how many spaces are left. Specific seats aren’t assigned."}
            </p>

            {footer}
        </section>
    );
}
