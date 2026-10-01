"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Copy, Loader2, Search } from "lucide-react";
import type { Workshop } from "@/lib/data";
import { dedupeWorkshopsForReuse } from "@/lib/workshop-utils";
import { formatDate } from "@/lib/utils";

type ExistingWorkshopPickerProps = {
    /**
     * Loads the workshops the current user may copy from: their own for hosts, all for admins.
     * Authorisation is enforced by the endpoint behind it, not here.
     */
    loadWorkshops: () => Promise<Workshop[]>;
    onSelect: (workshop: Workshop) => void;
    /** Id of the workshop the form was last filled from, if any. */
    selectedId?: string | null;
    disabled?: boolean;
};

/**
 * "Start from an existing workshop": a collapsible, searchable list (most recent first) that
 * hands the chosen workshop to the page, which pre-fills everything except date, time and seats.
 */
export default function ExistingWorkshopPicker({
    loadWorkshops,
    onSelect,
    selectedId = null,
    disabled = false,
}: ExistingWorkshopPickerProps) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [workshops, setWorkshops] = useState<Workshop[]>([]);
    const [query, setQuery] = useState("");

    const reusable = useMemo(() => dedupeWorkshopsForReuse(workshops), [workshops]);
    const visible = useMemo(() => {
        const needle = query.trim().toLowerCase();
        if (!needle) return reusable;
        return reusable.filter((workshop) =>
            [workshop.title, workshop.category, workshop.city, workshop.location, workshop.hostName]
                .join(" ")
                .toLowerCase()
                .includes(needle)
        );
    }, [reusable, query]);

    const toggle = async () => {
        const nextOpen = !open;
        setOpen(nextOpen);
        if (!nextOpen || loaded || loading) return;

        setLoading(true);
        setError(null);
        try {
            setWorkshops(await loadWorkshops());
            setLoaded(true);
        } catch {
            setError("Unable to load your workshops right now. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="rounded-2xl border border-terracotta/30 bg-white p-4 shadow-soft">
            <button
                type="button"
                onClick={() => void toggle()}
                disabled={disabled}
                aria-expanded={open}
                className="flex w-full items-center justify-between gap-3 text-left disabled:opacity-60"
            >
                <span className="flex items-center gap-2">
                    <Copy className="h-4 w-4 text-terracotta" />
                    <span>
                        <span className="block text-sm font-inter font-bold text-dark">
                            Start from an existing workshop
                        </span>
                        <span className="block text-xs font-inter text-dark-muted">
                            Re-use the details of a workshop you already created. You only add the
                            new dates and times.
                        </span>
                    </span>
                </span>
                <ChevronDown
                    className={`h-4 w-4 shrink-0 text-dark-muted transition-transform ${open ? "rotate-180" : ""}`}
                />
            </button>

            {open && (
                <div className="mt-4 space-y-3">
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dark-muted" />
                        <input
                            type="search"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search by title, category or city"
                            className="w-full rounded-xl border border-gray-200 bg-cream-100 py-2.5 pl-9 pr-3 text-sm font-inter"
                            aria-label="Search existing workshops"
                        />
                    </div>

                    {loading && (
                        <div className="flex items-center gap-2 text-sm font-inter text-dark-muted">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading workshops...
                        </div>
                    )}
                    {error && <p className="text-sm font-inter text-red-600">{error}</p>}
                    {loaded && visible.length === 0 && (
                        <p className="text-sm font-inter text-dark-muted">
                            {reusable.length === 0
                                ? "You have not created any workshops yet."
                                : "No workshops match your search."}
                        </p>
                    )}

                    {visible.length > 0 && (
                        <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
                            {visible.map((workshop) => (
                                <li key={workshop.id}>
                                    <button
                                        type="button"
                                        onClick={() => onSelect(workshop)}
                                        className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors hover:border-terracotta ${
                                            selectedId === workshop.id
                                                ? "border-terracotta bg-terracotta/5"
                                                : "border-gray-200 bg-white"
                                        }`}
                                    >
                                        <span className="block text-sm font-inter font-semibold text-dark">
                                            {workshop.title}
                                        </span>
                                        <span className="block text-xs font-inter text-dark-muted">
                                            {workshop.category} &middot; {workshop.city} &middot;
                                            last run {formatDate(workshop.date)}
                                            {workshop.sessionCount > 1
                                                ? ` (${workshop.sessionCount} sessions)`
                                                : ""}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}
