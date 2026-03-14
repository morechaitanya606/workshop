"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Circle, Loader2, Users } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { toApiErrorMessage } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils";

type Attendee = {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
    guests: number;
    attended: boolean;
};

export default function AttendeesPage({ params }: { params: { id: string } }) {
    const { session, user } = useAuth();
    const [attendees, setAttendees] = useState<Attendee[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!session?.access_token) return;

        const loadAttendees = async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/host/workshops/${params.id}/attendees`, {
                    headers: {
                        Authorization: `Bearer ${session.access_token}`,
                    },
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Failed to load attendees");
                setAttendees(data.attendees || []);
            } catch (err) {
                setError(toApiErrorMessage(err, "Failed to load attendees"));
            } finally {
                setLoading(false);
            }
        };

        loadAttendees();
    }, [session?.access_token, params.id]);

    const toggleCheckIn = async (bookingId: string, currentStatus: boolean) => {
        if (!session?.access_token) return;

        const newStatus = !currentStatus;

        // Optimistic update
        setAttendees(prev => prev.map(a => a.id === bookingId ? { ...a, attended: newStatus } : a));

        try {
            const res = await fetch(`/api/host/bookings/${bookingId}/check-in`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ attended: newStatus }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to update check-in status");
        } catch (err) {
            // Revert on failure
            setAttendees(prev => prev.map(a => a.id === bookingId ? { ...a, attended: currentStatus } : a));
            alert(toApiErrorMessage(err, "Failed to check in attendee"));
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-cream flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-terracotta" />
            </div>
        );
    }

    const totalGuests = attendees.reduce((sum, a) => sum + a.guests, 0);
    const checkedInGuests = attendees.filter(a => a.attended).reduce((sum, a) => sum + a.guests, 0);

    return (
        <div className="min-h-screen bg-cream py-12">
            <div className="max-w-4xl mx-auto px-6">
                <div className="mb-8">
                    <Link href="/profile" className="inline-flex items-center gap-2 text-sm text-dark-muted hover:text-terracotta transition-colors mb-4">
                        <ArrowLeft className="w-4 h-4" />
                        Back to Dashboard
                    </Link>
                    <h1 className="heading-md">Attendee Check-in</h1>
                    <div className="flex items-center gap-4 mt-2">
                        <div className="inline-flex items-center gap-2 text-sm text-dark-secondary">
                            <Users className="w-4 h-4 text-dark-muted" />
                            {totalGuests} total guests
                        </div>
                        <div className="inline-flex items-center gap-2 text-sm text-dark-secondary bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full border border-emerald-100 font-semibold">
                            {checkedInGuests} checked in
                        </div>
                    </div>
                </div>

                {error ? (
                    <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl">
                        {error}
                    </div>
                ) : attendees.length === 0 ? (
                    <div className="bg-white rounded-2xl p-8 text-center text-dark-muted shadow-soft">
                        No bookings yet for this workshop.
                    </div>
                ) : (
                    <div className="bg-white rounded-2xl shadow-soft overflow-hidden">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-gray-100 bg-cream-50">
                                    <th className="p-4 text-xs font-inter font-semibold uppercase text-dark-muted tracking-wider">Attendee</th>
                                    <th className="p-4 text-xs font-inter font-semibold uppercase text-dark-muted tracking-wider">Contact</th>
                                    <th className="p-4 text-xs font-inter font-semibold uppercase text-dark-muted tracking-wider">Guests</th>
                                    <th className="p-4 text-xs font-inter font-semibold uppercase text-dark-muted tracking-wider text-right">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {attendees.map(attendee => (
                                    <tr key={attendee.id} className="hover:bg-cream-50/50 transition-colors">
                                        <td className="p-4 align-middle">
                                            <p className="font-semibold text-dark font-inter text-sm">{attendee.first_name} {attendee.last_name}</p>
                                        </td>
                                        <td className="p-4 align-middle">
                                            <p className="text-sm text-dark-secondary">{attendee.email}</p>
                                            <p className="text-xs text-dark-muted mt-0.5">{attendee.phone || "No phone"}</p>
                                        </td>
                                        <td className="p-4 align-middle">
                                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-cream-100 text-dark font-semibold text-xs border border-gray-200">
                                                {attendee.guests}
                                            </span>
                                        </td>
                                        <td className="p-4 align-middle text-right">
                                            <button
                                                onClick={() => toggleCheckIn(attendee.id, attendee.attended)}
                                                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold transition-colors border ${
                                                    attendee.attended
                                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300'
                                                        : 'bg-white text-dark-secondary border-gray-200 hover:border-terracotta hover:text-terracotta'
                                                }`}
                                            >
                                                {attendee.attended ? (
                                                    <><CheckCircle2 className="w-4 h-4" /> Checked In</>
                                                ) : (
                                                    <><Circle className="w-4 h-4" /> Check in</>
                                                )}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
