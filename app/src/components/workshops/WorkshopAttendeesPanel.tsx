"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Circle, Loader2, Users } from "lucide-react";
import {
    getWorkshopAttendees,
    toApiErrorMessage,
    updateWorkshopAttendeeCheckIn,
    type WorkshopAttendee,
} from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { isKnownMockWorkshopId } from "@/lib/data";

type WorkshopAttendeesPanelProps = {
    workshopId: string;
    backHref: string;
    backLabel: string;
    scope: "admin" | "host";
    isMockWorkshop?: boolean;
};

export default function WorkshopAttendeesPanel({
    workshopId,
    backHref,
    backLabel,
    scope,
    isMockWorkshop = false,
}: WorkshopAttendeesPanelProps) {
    const { session } = useAuth();
    const [attendees, setAttendees] = useState<WorkshopAttendee[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [updatingBookingId, setUpdatingBookingId] = useState<string | null>(null);
    const resolvedIsMockWorkshop = isMockWorkshop || isKnownMockWorkshopId(workshopId);

    useEffect(() => {
        if (resolvedIsMockWorkshop) {
            setAttendees([]);
            setError(null);
            setLoading(false);
            return;
        }

        if (!session?.access_token) return;

        let cancelled = false;

        const loadAttendees = async () => {
            setLoading(true);
            setError(null);

            try {
                const result = await getWorkshopAttendees(session.access_token, workshopId, scope);
                if (!cancelled) {
                    setAttendees(Array.isArray(result.attendees) ? result.attendees : []);
                }
            } catch (loadError) {
                if (!cancelled) {
                    setError(toApiErrorMessage(loadError, "Failed to load attendees."));
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        void loadAttendees();

        return () => {
            cancelled = true;
        };
    }, [resolvedIsMockWorkshop, scope, session?.access_token, workshopId]);

    const toggleCheckIn = async (bookingId: string, currentStatus: boolean) => {
        if (!session?.access_token) return;

        const nextStatus = !currentStatus;
        setUpdatingBookingId(bookingId);

        setAttendees((prev) =>
            prev.map((item) => (item.id === bookingId ? { ...item, attended: nextStatus } : item))
        );

        try {
            await updateWorkshopAttendeeCheckIn(session.access_token, bookingId, nextStatus, scope);
        } catch (updateError) {
            setAttendees((prev) =>
                prev.map((item) =>
                    item.id === bookingId ? { ...item, attended: currentStatus } : item
                )
            );
            window.alert(toApiErrorMessage(updateError, "Failed to check in attendee."));
        } finally {
            setUpdatingBookingId(null);
        }
    };

    const totalGuests = attendees.reduce((sum, attendee) => sum + Number(attendee.guests || 0), 0);
    const checkedInGuests = attendees
        .filter((attendee) => attendee.attended)
        .reduce((sum, attendee) => sum + Number(attendee.guests || 0), 0);

    return (
        <>
            <div className="mb-8">
                <Link
                    href={backHref}
                    className="mb-4 inline-flex items-center gap-2 text-sm text-dark-muted transition-colors hover:text-terracotta"
                >
                    <ArrowLeft className="w-4 h-4" />
                    {backLabel}
                </Link>
                <h1 className="heading-md">Attendee Check-in</h1>
                <div className="mt-2 flex items-center gap-4">
                    <div className="inline-flex items-center gap-2 text-sm text-dark-secondary">
                        <Users className="w-4 h-4 text-dark-muted" />
                        {totalGuests} total guests
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
                        {checkedInGuests} checked in
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center gap-2 text-sm font-inter text-dark-muted">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading attendees...
                </div>
            ) : error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
                    {error}
                </div>
            ) : resolvedIsMockWorkshop ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
                    Attendee check-in is only available for live workshops managed in the dashboard.
                    This past event is a mock showcase entry, so there is no attendee list to load
                    here.
                </div>
            ) : attendees.length === 0 ? (
                <div className="rounded-2xl bg-white p-8 text-center text-dark-muted shadow-soft">
                    No bookings yet for this workshop.
                </div>
            ) : (
                <div className="overflow-hidden rounded-2xl bg-white shadow-soft">
                    <table className="w-full border-collapse text-left">
                        <thead>
                            <tr className="border-b border-gray-100 bg-cream-50">
                                <th className="p-4 text-xs font-inter font-semibold uppercase tracking-wider text-dark-muted">
                                    Attendee
                                </th>
                                <th className="p-4 text-xs font-inter font-semibold uppercase tracking-wider text-dark-muted">
                                    Contact
                                </th>
                                <th className="p-4 text-xs font-inter font-semibold uppercase tracking-wider text-dark-muted">
                                    Guests
                                </th>
                                <th className="p-4 text-right text-xs font-inter font-semibold uppercase tracking-wider text-dark-muted">
                                    Status
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {attendees.map((attendee) => {
                                const isUpdating = updatingBookingId === attendee.id;

                                return (
                                    <tr
                                        key={attendee.id}
                                        className="transition-colors hover:bg-cream-50/50"
                                    >
                                        <td className="p-4 align-middle">
                                            <p className="text-sm font-semibold text-dark">
                                                {attendee.first_name} {attendee.last_name}
                                            </p>
                                        </td>
                                        <td className="p-4 align-middle">
                                            <p className="text-sm text-dark-secondary">
                                                {attendee.email}
                                            </p>
                                            <p className="mt-0.5 text-xs text-dark-muted">
                                                {attendee.phone || "No phone"}
                                            </p>
                                        </td>
                                        <td className="p-4 align-middle">
                                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-cream-100 text-xs font-semibold text-dark">
                                                {attendee.guests}
                                            </span>
                                        </td>
                                        <td className="p-4 text-right align-middle">
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    void toggleCheckIn(
                                                        attendee.id,
                                                        attendee.attended
                                                    )
                                                }
                                                disabled={isUpdating}
                                                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${
                                                    attendee.attended
                                                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100"
                                                        : "border-gray-200 bg-white text-dark-secondary hover:border-terracotta hover:text-terracotta"
                                                }`}
                                            >
                                                {isUpdating ? (
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                ) : attendee.attended ? (
                                                    <CheckCircle2 className="w-4 h-4" />
                                                ) : (
                                                    <Circle className="w-4 h-4" />
                                                )}
                                                {attendee.attended ? "Checked In" : "Check in"}
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </>
    );
}
