"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
    getAdminWorkshopBookingStatus,
    isApiClientError,
    setAdminWorkshopBookingsClosed,
    toApiErrorMessage,
} from "@/lib/api-client";
import { BOOKINGS_CLOSED_LABEL } from "@/lib/workshop-availability";

/** After this long the switch says the save is slow (the request itself keeps going). */
const SLOW_SAVE_MS = 6000;
/** Answers that do not say whether the save happened: no answer at all, or a gateway timeout. */
const AMBIGUOUS_SAVE_STATUSES: ReadonlySet<number> = new Set([0, 502, 504]);

type BookingsSwitchProps = {
    workshopId: string;
    title: string;
    closed: boolean;
    /** max_seats - seats_remaining; null hides the count. */
    bookedSeats: number | null;
    maxSeats?: number | null;
    accessToken: string | null | undefined;
    /**
     * Called with the confirmed state (and the whole stored list) after a save or a re-check. A
     * page with several switches should apply only `closed` to THIS workshop
     * (withConfirmedBookingsState): answers can arrive out of order, and an older answer's list
     * would undo a workshop another switch has just confirmed.
     */
    onChange: (closed: boolean, closedWorkshopIds?: string[]) => void;
    /** False when the current state could not be read: the switch is then disabled. */
    known?: boolean;
    className?: string;
};

export function closeBookingsConfirmText(title: string) {
    return `Close bookings for ${title}? It stays visible with '${BOOKINGS_CLOSED_LABEL}' and no Book button, and nobody can start a new booking. Existing bookings and payments already started are not affected.`;
}

/** The closed ids after the switch of ONE workshop confirmed its own new state. */
export function withConfirmedBookingsState(
    closedIds: ReadonlySet<string>,
    workshopId: string,
    closed: boolean
): Set<string> {
    const next = new Set(closedIds);
    if (closed) next.add(workshopId);
    else next.delete(workshopId);
    return next;
}

/** A small "Bookings closed" pill for lists, so the state is visible at a glance. */
export function BookingsClosedBadge({ className = "" }: { className?: string }) {
    return (
        <span
            className={`inline-flex rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-inter font-semibold uppercase tracking-wide text-red-700 ${className}`}
        >
            {BOOKINGS_CLOSED_LABEL}
        </span>
    );
}

/**
 * The admin "Bookings" on/off switch of one workshop. Closing asks first (a question on the page,
 * not window.confirm: embedded and in-app browsers never show a native dialog and answer
 * "cancel" at once, which made the switch look dead, and it is easier to hit on a phone);
 * reopening does not ask. The change shows at once and rolls back when the save fails. When the
 * connection drops or times out, the save may still have reached the server, so the switch
 * re-reads the real state instead of guessing.
 */
export default function BookingsSwitch({
    workshopId,
    title,
    closed,
    bookedSeats,
    maxSeats,
    accessToken,
    onChange,
    known = true,
    className = "",
}: BookingsSwitchProps) {
    const [optimistic, setOptimistic] = useState<boolean | null>(null);
    const [saving, setSaving] = useState(false);
    const [slow, setSlow] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [confirming, setConfirming] = useState(false);
    const mounted = useRef(true);
    const confirmButton = useRef<HTMLButtonElement | null>(null);

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    useEffect(() => {
        if (confirming) confirmButton.current?.focus();
    }, [confirming]);

    const shownClosed = optimistic ?? closed;
    const disabled = saving || !accessToken || !known;

    const handleToggle = () => {
        if (disabled) return;
        if (!shownClosed) {
            setError(null);
            setConfirming((open) => !open);
            return;
        }
        void save(false);
    };

    const save = async (nextClosed: boolean) => {
        if (!accessToken) return;
        setConfirming(false);
        setError(null);
        setSaving(true);
        setSlow(false);
        setOptimistic(nextClosed);
        const slowTimer = setTimeout(() => {
            if (mounted.current) setSlow(true);
        }, SLOW_SAVE_MS);

        try {
            const result = await setAdminWorkshopBookingsClosed(
                accessToken,
                workshopId,
                nextClosed
            );
            if (!mounted.current) return;
            onChange(result.closed, result.closedWorkshopIds);
        } catch (saveError) {
            if (!mounted.current) return;
            // No answer (status 0), or a gateway that gave up (502/504, e.g. the function timed
            // out): the save may have landed anyway, so ask the server instead of claiming either.
            const unconfirmed =
                isApiClientError(saveError) && AMBIGUOUS_SAVE_STATUSES.has(saveError.status);
            if (unconfirmed) {
                try {
                    const current = await getAdminWorkshopBookingStatus(accessToken, workshopId);
                    if (!mounted.current) return;
                    onChange(current.closed, current.closedWorkshopIds);
                    setError(
                        current.closed === nextClosed
                            ? null
                            : "The change was not saved: the connection dropped or timed out. Try again."
                    );
                } catch {
                    if (!mounted.current) return;
                    setError(
                        "The connection is too slow to tell whether the change was saved. Refresh the page to check."
                    );
                }
            } else {
                setError(
                    toApiErrorMessage(
                        saveError,
                        "Unable to change bookings right now. Nothing was changed."
                    )
                );
            }
        } finally {
            clearTimeout(slowTimer);
            if (mounted.current) {
                setOptimistic(null);
                setSaving(false);
                setSlow(false);
            }
        }
    };

    const seatsText =
        bookedSeats === null
            ? null
            : maxSeats
              ? `${bookedSeats}/${maxSeats} seats booked`
              : `${bookedSeats} booked`;

    return (
        <div className={`flex flex-col gap-1.5 ${className}`}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <button
                    type="button"
                    role="switch"
                    aria-checked={!shownClosed}
                    // Starts with the visible text, so "Bookings: Open" works for voice control,
                    // and names the workshop, because a page lists many of these switches.
                    aria-label={`Bookings: ${shownClosed ? "Closed" : "Open"} for ${title}`}
                    onClick={handleToggle}
                    disabled={disabled}
                    className={`inline-flex min-h-[44px] items-center gap-2.5 rounded-full border px-3.5 py-2 text-sm font-inter font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${
                        shownClosed
                            ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    }`}
                >
                    <span
                        aria-hidden="true"
                        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                            shownClosed ? "bg-red-300" : "bg-emerald-500"
                        }`}
                    >
                        <span
                            className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                                shownClosed ? "translate-x-0.5" : "translate-x-[18px]"
                            }`}
                        />
                    </span>
                    {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : null}
                    Bookings: {shownClosed ? "Closed" : "Open"}
                </button>
                {seatsText && (
                    <span className="text-xs font-inter text-dark-muted">{seatsText}</span>
                )}
            </div>
            {confirming && !shownClosed && (
                <div
                    role="group"
                    aria-label={`Confirm closing bookings for ${title}`}
                    onKeyDown={(event) => {
                        if (event.key === "Escape") setConfirming(false);
                    }}
                    className="rounded-xl border border-red-200 bg-red-50 p-3"
                >
                    <p className="text-sm font-inter text-dark">
                        {closeBookingsConfirmText(title)}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <button
                            ref={confirmButton}
                            type="button"
                            aria-label={`Close bookings for ${title}`}
                            onClick={() => void save(true)}
                            className="min-h-[44px] rounded-full bg-red-600 px-4 py-2 text-sm font-inter font-semibold text-white transition-colors hover:bg-red-700"
                        >
                            Close bookings
                        </button>
                        <button
                            type="button"
                            onClick={() => setConfirming(false)}
                            className="min-h-[44px] rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-inter font-semibold text-dark transition-colors hover:bg-gray-50"
                        >
                            Keep open
                        </button>
                    </div>
                </div>
            )}
            {!known && (
                <p className="text-xs font-inter text-amber-700">
                    Bookings status could not be loaded. Refresh to change it.
                </p>
            )}
            {saving && slow && (
                <p className="text-xs font-inter text-dark-muted" aria-live="polite">
                    Still saving on a slow connection...
                </p>
            )}
            {error && (
                <p className="text-xs font-inter text-red-700" role="alert">
                    {error}
                </p>
            )}
        </div>
    );
}
