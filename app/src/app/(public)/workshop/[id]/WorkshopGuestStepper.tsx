"use client";

import { Minus, Plus } from "lucide-react";

/** A seat hold takes at most 20 guests (the hold request schema in validators.ts). */
export const MAX_GUESTS_PER_BOOKING = 20;

export interface WorkshopGuestStepperProps {
    guests: number;
    setGuests: (fn: number | ((n: number) => number)) => void;
    availableSeatCount: number;
    /** Keeps the label ids of the two copies (sidebar, phone) apart. */
    idPrefix: string;
}

/** The guest count for the booking: 1 up to the seats left. */
export default function WorkshopGuestStepper({
    guests,
    setGuests,
    availableSeatCount,
    idPrefix,
}: WorkshopGuestStepperProps) {
    const labelId = `${idPrefix}-guests-label`;
    const maxGuests = Math.max(1, Math.min(availableSeatCount, MAX_GUESTS_PER_BOOKING));
    const atMin = guests <= 1;
    const atMax = guests >= maxGuests;
    // aria-disabled, not disabled: a button that disables itself while it has the keyboard focus
    // drops the focus to the page top, so stepping up to the limit would end the key presses.
    return (
        <div role="group" aria-labelledby={labelId}>
            <p
                id={labelId}
                className="mb-2 block text-[10px] font-inter font-bold uppercase tracking-wider text-dark-muted"
            >
                Guests
            </p>
            <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-cream-100 px-4 py-3">
                <button
                    type="button"
                    onClick={() => {
                        if (!atMin) setGuests(Math.max(1, guests - 1));
                    }}
                    aria-disabled={atMin}
                    aria-label="One guest fewer"
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 transition-colors aria-[disabled=false]:hover:border-terracotta aria-[disabled=false]:hover:text-terracotta aria-disabled:cursor-not-allowed aria-disabled:opacity-40"
                >
                    <Minus className="h-4 w-4" />
                </button>
                <span className="text-lg font-inter font-bold text-dark" role="status">
                    <span aria-hidden="true">{guests}</span>
                    <span className="sr-only">{guests === 1 ? "1 guest" : `${guests} guests`}</span>
                </span>
                <button
                    type="button"
                    onClick={() => {
                        if (!atMax) setGuests(Math.min(maxGuests, guests + 1));
                    }}
                    aria-disabled={atMax}
                    aria-label="One guest more"
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 transition-colors aria-[disabled=false]:hover:border-terracotta aria-[disabled=false]:hover:text-terracotta aria-disabled:cursor-not-allowed aria-disabled:opacity-40"
                >
                    <Plus className="h-4 w-4" />
                </button>
            </div>
        </div>
    );
}
