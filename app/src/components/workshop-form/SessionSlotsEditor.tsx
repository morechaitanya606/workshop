"use client";

import { useState } from "react";
import { CalendarPlus, Plus, Repeat, Trash2 } from "lucide-react";
import {
    MAX_WORKSHOP_SESSIONS,
    type SessionSlotForm,
    addDaysToIsoDate,
    createSessionSlot,
    expandWeeklyRepeat,
    getTodayIstDate,
} from "@/lib/workshop-sessions";

type SessionSlotsEditorProps = {
    slots: SessionSlotForm[];
    onChange: (slots: SessionSlotForm[]) => void;
    /** The workshop-level seat count, shown as the placeholder for slots without their own. */
    defaultMaxSeats: string;
    /** Keys: `sessions` (list level) and `<index>.date|time|maxSeats`. */
    errors?: Record<string, string>;
    disabled?: boolean;
};

const inputClass =
    "w-full rounded-xl border border-gray-200 bg-cream-100 px-3 py-2.5 text-sm font-inter";
const labelClass =
    "mb-1.5 block text-[11px] font-inter font-bold uppercase tracking-wider text-dark-muted";

/**
 * Repeatable "Sessions / time slots" list shared by the admin and host create pages. Each slot
 * becomes its own workshop (same details, own date, time and optional seat count).
 */
export default function SessionSlotsEditor({
    slots,
    onChange,
    defaultMaxSeats,
    errors = {},
    disabled = false,
}: SessionSlotsEditorProps) {
    const [weeks, setWeeks] = useState("4");
    const todayIst = getTodayIstDate();
    const atLimit = slots.length >= MAX_WORKSHOP_SESSIONS;

    const updateSlot = (key: string, field: "date" | "time" | "maxSeats", value: string) => {
        onChange(slots.map((slot) => (slot.key === key ? { ...slot, [field]: value } : slot)));
    };

    const removeSlot = (key: string) => {
        const next = slots.filter((slot) => slot.key !== key);
        onChange(next.length > 0 ? next : [createSessionSlot()]);
    };

    const addSlot = (mode: "same-day" | "next-day") => {
        if (atLimit) return;
        const last = slots[slots.length - 1];
        const date =
            mode === "same-day"
                ? (last?.date ?? "")
                : ((last?.date && addDaysToIsoDate(last.date, 1)) ?? "");
        onChange([...slots, createSessionSlot({ date, maxSeats: last?.maxSeats ?? "" })]);
    };

    const repeatWeekly = () => {
        const count = Number(weeks);
        if (!Number.isFinite(count) || count < 2) return;
        onChange(
            expandWeeklyRepeat(slots, count, (base, date) =>
                createSessionSlot({ date, time: base.time, maxSeats: base.maxSeats })
            )
        );
    };

    const canRepeat = slots.some((slot) => slot.date && slot.time);

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                    Sessions / time slots (India time)
                </p>
                <p className="text-xs font-inter text-dark-muted">
                    {slots.length} of {MAX_WORKSHOP_SESSIONS}
                </p>
            </div>
            <p className="text-xs font-inter text-dark-muted">
                Each slot is listed as its own workshop with the same details. Add several slots on
                the same day or on different days.
            </p>

            <ul className="space-y-3">
                {slots.map((slot, index) => (
                    <li
                        key={slot.key}
                        className="rounded-xl border border-gray-200 bg-white p-3 sm:p-4"
                    >
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-start">
                            <div>
                                <label className={labelClass} htmlFor={`${slot.key}-date`}>
                                    Date
                                </label>
                                <input
                                    id={`${slot.key}-date`}
                                    type="date"
                                    min={todayIst}
                                    value={slot.date}
                                    onChange={(e) => updateSlot(slot.key, "date", e.target.value)}
                                    className={inputClass}
                                    disabled={disabled}
                                    required
                                />
                                {errors[`${index}.date`] && (
                                    <p className="mt-1 text-xs font-inter text-red-600">
                                        {errors[`${index}.date`]}
                                    </p>
                                )}
                            </div>
                            <div>
                                <label className={labelClass} htmlFor={`${slot.key}-time`}>
                                    Start time
                                </label>
                                <input
                                    id={`${slot.key}-time`}
                                    type="time"
                                    value={slot.time}
                                    onChange={(e) => updateSlot(slot.key, "time", e.target.value)}
                                    className={inputClass}
                                    disabled={disabled}
                                    required
                                />
                                {errors[`${index}.time`] && (
                                    <p className="mt-1 text-xs font-inter text-red-600">
                                        {errors[`${index}.time`]}
                                    </p>
                                )}
                            </div>
                            <div>
                                <label className={labelClass} htmlFor={`${slot.key}-seats`}>
                                    Seats (optional)
                                </label>
                                <input
                                    id={`${slot.key}-seats`}
                                    type="number"
                                    min={1}
                                    max={500}
                                    inputMode="numeric"
                                    value={slot.maxSeats}
                                    onChange={(e) =>
                                        updateSlot(slot.key, "maxSeats", e.target.value)
                                    }
                                    placeholder={
                                        defaultMaxSeats ? `${defaultMaxSeats} (default)` : "Default"
                                    }
                                    className={inputClass}
                                    disabled={disabled}
                                />
                                {errors[`${index}.maxSeats`] && (
                                    <p className="mt-1 text-xs font-inter text-red-600">
                                        {errors[`${index}.maxSeats`]}
                                    </p>
                                )}
                            </div>
                            <div className="flex sm:pt-[26px]">
                                <button
                                    type="button"
                                    onClick={() => removeSlot(slot.key)}
                                    disabled={disabled || slots.length === 1}
                                    className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-inter font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                                    aria-label={`Remove slot ${index + 1}`}
                                >
                                    <Trash2 className="h-4 w-4" />
                                    <span className="sm:hidden">Remove</span>
                                </button>
                            </div>
                        </div>
                    </li>
                ))}
            </ul>

            {errors.sessions && (
                <p className="text-xs font-inter text-red-600">{errors.sessions}</p>
            )}

            <div className="flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    onClick={() => addSlot("same-day")}
                    disabled={disabled || atLimit}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-inter font-semibold text-dark transition-colors hover:border-terracotta hover:text-terracotta disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <Plus className="h-3.5 w-3.5" />
                    Add slot on the same day
                </button>
                <button
                    type="button"
                    onClick={() => addSlot("next-day")}
                    disabled={disabled || atLimit}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-inter font-semibold text-dark transition-colors hover:border-terracotta hover:text-terracotta disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <CalendarPlus className="h-3.5 w-3.5" />
                    Add slot on the next day
                </button>
            </div>

            <div className="flex flex-wrap items-end gap-2 rounded-xl bg-cream-100 p-3">
                <div className="w-28">
                    <label className={labelClass} htmlFor="session-repeat-weeks">
                        Weeks
                    </label>
                    <input
                        id="session-repeat-weeks"
                        type="number"
                        min={2}
                        max={MAX_WORKSHOP_SESSIONS}
                        inputMode="numeric"
                        value={weeks}
                        onChange={(e) => setWeeks(e.target.value)}
                        className={inputClass}
                        disabled={disabled}
                    />
                </div>
                <button
                    type="button"
                    onClick={repeatWeekly}
                    disabled={disabled || atLimit || !canRepeat}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-xs font-inter font-semibold text-dark transition-colors hover:border-terracotta hover:text-terracotta disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <Repeat className="h-3.5 w-3.5" />
                    Repeat the first filled slot weekly
                </button>
                <p className="basis-full text-xs font-inter text-dark-muted">
                    Fill in the first slot, then repeat it every week for the number of weeks above.
                </p>
            </div>
        </div>
    );
}
