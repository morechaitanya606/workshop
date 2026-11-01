"use client";

import { useId, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { getWorkshopDateTime } from "@/lib/booking-time";
import { formatDate } from "@/lib/utils";

export type CouponWorkshopOption = {
    id: string;
    title: string;
    date: string;
    /** Start time (IST). With it a workshop counts as past once it has started, like the cards. */
    time?: string | null;
};

/**
 * Whether the workshop has already started, by the rule the cards use for "Event ended": its
 * start time has passed, or (without a time) its date is before today. No date: not past.
 */
function hasStarted(workshop: CouponWorkshopOption, nowMs: number, todayIso: string): boolean {
    if (!workshop.date) return false;
    const start = workshop.time ? getWorkshopDateTime(workshop.date, workshop.time) : null;
    return start ? start.getTime() < nowMs : workshop.date < todayIso;
}

/**
 * "Applies to" control for a coupon: every workshop (`value` null) or only the ticked ones.
 * Checkout, the coupon check and the booking confirmation in the database already refuse a
 * coupon on a workshop that is not in its list.
 */
export default function CouponWorkshopPicker({
    workshops,
    value,
    onChange,
    todayIso,
    disabled = false,
}: {
    workshops: CouponWorkshopOption[];
    /** null = all workshops; an array = only these workshop ids. */
    value: string[] | null;
    onChange: (next: string[] | null) => void;
    todayIso: string;
    disabled?: boolean;
}) {
    const groupName = useId();
    const [query, setQuery] = useState("");
    const isLimited = value !== null;
    const selected = useMemo(() => new Set(value ?? []), [value]);

    // Read once per time the list is shown (the picker only renders in the browser, after the
    // workshops have loaded), so it cannot disagree with server-rendered markup.
    const [nowMs] = useState(() => Date.now());

    // Only upcoming workshops can be chosen (soonest at the top): an offer for a past workshop
    // can never be used. A past workshop an existing offer already names stays listed, marked
    // "past", so the owner can untick it; it would otherwise stay in the saved list unseen.
    const ordered = useMemo(() => {
        const upcoming = workshops
            .filter((workshop) => !hasStarted(workshop, nowMs, todayIso))
            .sort(
                (a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? "")
            );
        const pastSelected = workshops
            .filter((workshop) => hasStarted(workshop, nowMs, todayIso))
            .filter((workshop) => selected.has(workshop.id))
            .sort((a, b) => b.date.localeCompare(a.date));
        return [...upcoming, ...pastSelected];
    }, [workshops, todayIso, selected, nowMs]);

    const needle = query.trim().toLowerCase();
    const visible = needle
        ? ordered.filter((workshop) => workshop.title.toLowerCase().includes(needle))
        : ordered;

    const toggle = (id: string) => {
        const next = new Set(selected);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        onChange([...next]);
    };

    return (
        <fieldset className="space-y-3" disabled={disabled}>
            <legend className="mb-1 block text-xs font-inter font-semibold text-dark-muted">
                Applies to
            </legend>
            <div className="flex flex-wrap gap-4 text-sm font-inter text-dark">
                <label className="inline-flex items-center gap-2">
                    <input
                        type="radio"
                        name={groupName}
                        checked={!isLimited}
                        onChange={() => onChange(null)}
                        className="accent-terracotta"
                    />
                    All workshops
                </label>
                <label className="inline-flex items-center gap-2">
                    <input
                        type="radio"
                        name={groupName}
                        checked={isLimited}
                        onChange={() => onChange(value ?? [])}
                        className="accent-terracotta"
                    />
                    Only selected workshops
                </label>
            </div>

            {isLimited && (
                <div className="rounded-lg border border-gray-200 bg-white">
                    <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
                        <Search className="h-4 w-4 text-dark-muted" aria-hidden="true" />
                        <input
                            type="search"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Search workshops"
                            aria-label="Search workshops"
                            className="w-full bg-transparent text-sm text-dark outline-none"
                        />
                        <span className="shrink-0 text-xs font-inter text-dark-muted">
                            {selected.size} selected
                        </span>
                    </div>
                    <ul className="max-h-56 overflow-y-auto py-1">
                        {visible.map((workshop) => (
                            <li key={workshop.id}>
                                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm font-inter hover:bg-cream-50">
                                    <input
                                        type="checkbox"
                                        checked={selected.has(workshop.id)}
                                        onChange={() => toggle(workshop.id)}
                                        className="accent-terracotta"
                                    />
                                    <span className="min-w-0 flex-1 truncate text-dark">
                                        {workshop.title}
                                    </span>
                                    <span
                                        className={`shrink-0 text-xs ${
                                            hasStarted(workshop, nowMs, todayIso)
                                                ? "text-dark-muted/70"
                                                : "text-dark-muted"
                                        }`}
                                    >
                                        {workshop.date ? formatDate(workshop.date) : ""}
                                        {hasStarted(workshop, nowMs, todayIso) ? " · past" : ""}
                                    </span>
                                </label>
                            </li>
                        ))}
                        {visible.length === 0 && (
                            <li className="px-3 py-4 text-center text-xs font-inter text-dark-muted">
                                {needle
                                    ? "No workshops match."
                                    : "No upcoming workshops to choose from."}
                            </li>
                        )}
                    </ul>
                </div>
            )}
        </fieldset>
    );
}
