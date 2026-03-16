"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Calendar, Users, Wallet, TrendingUp, Loader2, ArrowRight, MapPin } from "lucide-react";
import HostShell from "@/components/host/HostShell";
import { useAuth } from "@/lib/auth-context";
import { getHostWorkshops, getHostEarnings, toApiErrorMessage } from "@/lib/api-client";
import type { Workshop } from "@/lib/data";
import { formatCurrency, formatDate } from "@/lib/utils";

type EarningsSummary = {
    pending: number;
    available: number;
    paid: number;
};

export default function HostDashboardPage() {
    const { session } = useAuth();
    const [workshops, setWorkshops] = useState<Workshop[]>([]);
    const [earningsSummary, setEarningsSummary] = useState<EarningsSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!session?.access_token) return;

        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                const [workshopsRes, earningsRes] = await Promise.all([
                    getHostWorkshops(session.access_token),
                    getHostEarnings(session.access_token).catch(() => null),
                ]);
                setWorkshops(workshopsRes.data || []);
                if (earningsRes) {
                    setEarningsSummary(earningsRes.summary);
                }
            } catch (err) {
                setError(toApiErrorMessage(err, "Failed to load dashboard data."));
            } finally {
                setLoading(false);
            }
        };

        load();
    }, [session?.access_token]);

    const totalWorkshops = workshops.length;
    const totalSeatsBooked = workshops.reduce((sum, w) => sum + (w.maxSeats - w.seatsRemaining), 0);
    const totalEarnings = earningsSummary
        ? earningsSummary.pending + earningsSummary.available + earningsSummary.paid
        : 0;
    const availableBalance = earningsSummary?.available ?? 0;

    return (
        <HostShell>
            <div className="mb-8">
                <p className="text-xs font-inter font-bold uppercase tracking-wider text-terracotta mb-2">
                    Host Dashboard
                </p>
                <h1 className="heading-md">Overview</h1>
            </div>

            {loading && (
                <div className="flex items-center gap-2 text-sm font-inter text-dark-muted">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading your dashboard...
                </div>
            )}

            {!loading && error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-inter mb-6">
                    {error}
                </div>
            )}

            {!loading && !error && (
                <>
                    {/* Stats Cards */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                        <div className="bg-white rounded-2xl shadow-soft p-5">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-10 h-10 rounded-xl bg-terracotta/10 flex items-center justify-center">
                                    <Calendar className="w-5 h-5 text-terracotta" />
                                </div>
                                <span className="text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                    My Workshops
                                </span>
                            </div>
                            <p className="font-playfair text-3xl font-bold text-dark">
                                {totalWorkshops}
                            </p>
                        </div>

                        <div className="bg-white rounded-2xl shadow-soft p-5">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                                    <Users className="w-5 h-5 text-emerald-600" />
                                </div>
                                <span className="text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                    Booked Seats
                                </span>
                            </div>
                            <p className="font-playfair text-3xl font-bold text-dark">
                                {totalSeatsBooked}
                            </p>
                        </div>

                        <div className="bg-white rounded-2xl shadow-soft p-5">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                                    <TrendingUp className="w-5 h-5 text-blue-600" />
                                </div>
                                <span className="text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                    Total Earnings
                                </span>
                            </div>
                            <p className="font-playfair text-3xl font-bold text-dark">
                                {formatCurrency(totalEarnings)}
                            </p>
                        </div>

                        <div className="bg-white rounded-2xl shadow-soft p-5">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                                    <Wallet className="w-5 h-5 text-amber-600" />
                                </div>
                                <span className="text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                    Available
                                </span>
                            </div>
                            <p className="font-playfair text-3xl font-bold text-dark">
                                {formatCurrency(availableBalance)}
                            </p>
                        </div>
                    </div>

                    {/* Recent Workshops */}
                    <div className="bg-white rounded-2xl shadow-soft p-5 sm:p-6">
                        <div className="flex items-center justify-between mb-5">
                            <h2 className="font-playfair text-xl font-bold text-dark">
                                Recent Workshops
                            </h2>
                            <Link
                                href="/host/workshops"
                                className="inline-flex items-center gap-1 text-sm font-inter font-semibold text-terracotta hover:underline"
                            >
                                View all <ArrowRight className="w-4 h-4" />
                            </Link>
                        </div>

                        {workshops.length === 0 ? (
                            <div className="text-center py-10">
                                <Calendar className="w-10 h-10 mx-auto text-dark-muted mb-3" />
                                <p className="text-body text-dark-muted mb-4">
                                    You haven&apos;t created any workshops yet.
                                </p>
                                <Link href="/host/workshops/new" className="btn-primary">
                                    Create Your First Workshop
                                </Link>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {workshops.slice(0, 5).map((workshop) => (
                                    <div
                                        key={workshop.id}
                                        className="flex items-center gap-4 p-3 rounded-xl hover:bg-cream-50 transition-colors"
                                    >
                                        <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-cream-100">
                                            {workshop.coverImage && (
                                                <Image
                                                    src={workshop.coverImage}
                                                    alt={workshop.title}
                                                    width={56}
                                                    height={56}
                                                    className="w-full h-full object-cover"
                                                />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-inter font-semibold text-dark text-sm truncate">
                                                {workshop.title}
                                            </p>
                                            <div className="flex items-center gap-3 text-xs text-dark-muted font-inter mt-1">
                                                <span className="inline-flex items-center gap-1">
                                                    <Calendar className="w-3 h-3" />
                                                    {formatDate(workshop.date)}
                                                </span>
                                                <span className="inline-flex items-center gap-1">
                                                    <MapPin className="w-3 h-3" />
                                                    {workshop.city}
                                                </span>
                                                <span className="inline-flex items-center gap-1">
                                                    <Users className="w-3 h-3" />
                                                    {workshop.maxSeats - workshop.seatsRemaining}/
                                                    {workshop.maxSeats} booked
                                                </span>
                                            </div>
                                        </div>
                                        <Link
                                            href={`/host/workshops/${workshop.id}/attendees`}
                                            className="btn-secondary !py-2 !px-3 text-sm hidden sm:inline-flex"
                                        >
                                            Attendees
                                        </Link>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            )}
        </HostShell>
    );
}
