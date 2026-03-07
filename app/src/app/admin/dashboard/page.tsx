"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
    Loader2,
    CalendarDays,
    Users,
    IndianRupee,
    Star,
    ArrowRight,
} from "lucide-react";
import type { Workshop } from "@/lib/data";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import AdminShell from "@/components/admin/AdminShell";

type AdminStats = {
    activeWorkshops: number;
    totalBookedSeats: number;
    revenue: number;
    avgRating: string;
};

export default function AdminDashboardPage() {
    const { session } = useAuth();
    const [loadingData, setLoadingData] = useState(true);
    const [stats, setStats] = useState<AdminStats | null>(null);
    const [workshops, setWorkshops] = useState<Workshop[]>([]);

    useEffect(() => {
        let cancelled = false;

        const loadData = async () => {
            if (!session?.access_token) return;

            setLoadingData(true);
            try {
                const [statsRes, workshopsRes] = await Promise.all([
                    fetch("/api/admin/stats", {
                        headers: { Authorization: `Bearer ${session.access_token}` },
                        cache: "no-store",
                    }),
                    fetch("/api/admin/workshops", {
                        headers: { Authorization: `Bearer ${session.access_token}` },
                        cache: "no-store",
                    }),
                ]);

                if (!cancelled && statsRes.ok) {
                    const result = await statsRes.json();
                    setStats(result.stats || null);
                }

                if (!cancelled && workshopsRes.ok) {
                    const result = await workshopsRes.json();
                    setWorkshops(Array.isArray(result.data) ? result.data : []);
                }
            } finally {
                if (!cancelled) {
                    setLoadingData(false);
                }
            }
        };

        loadData();
        return () => {
            cancelled = true;
        };
    }, [session]);

    return (
        <AdminShell>
            <div className="mb-8">
                <p className="text-xs font-inter font-bold uppercase tracking-wider text-terracotta mb-2">
                    Admin Dashboard
                </p>
                <h1 className="heading-md">Overview</h1>
            </div>

            {loadingData ? (
                <div className="flex items-center gap-2 text-sm font-inter text-dark-muted">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading dashboard data...
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
                        <div className="bg-white rounded-2xl p-5 shadow-soft">
                            <p className="text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-1">
                                Active Workshops
                            </p>
                            <p className="font-playfair text-2xl font-bold text-dark">
                                {stats?.activeWorkshops ?? workshops.length}
                            </p>
                        </div>
                        <div className="bg-white rounded-2xl p-5 shadow-soft">
                            <p className="text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-1">
                                Booked Seats
                            </p>
                            <p className="font-playfair text-2xl font-bold text-dark">
                                {stats?.totalBookedSeats ?? 0}
                            </p>
                        </div>
                        <div className="bg-white rounded-2xl p-5 shadow-soft">
                            <p className="text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-1">
                                Revenue
                            </p>
                            <p className="font-playfair text-2xl font-bold text-dark">
                                {formatCurrency(stats?.revenue ?? 0)}
                            </p>
                        </div>
                        <div className="bg-white rounded-2xl p-5 shadow-soft">
                            <p className="text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-1">
                                Avg Rating
                            </p>
                            <p className="font-playfair text-2xl font-bold text-dark">
                                {stats?.avgRating ?? "-"}
                            </p>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl shadow-soft overflow-hidden">
                        <div className="px-4 sm:px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
                            <h2 className="font-playfair text-lg sm:text-xl font-semibold text-dark">
                                Recent Workshops
                            </h2>
                            <Link
                                href="/admin/workshops"
                                className="text-xs sm:text-sm font-inter font-semibold text-terracotta inline-flex items-center gap-1 whitespace-nowrap"
                            >
                                Manage
                                <ArrowRight className="w-4 h-4" />
                            </Link>
                        </div>

                        <div className="divide-y divide-gray-100">
                            {workshops.slice(0, 6).map((workshop) => (
                                <div
                                    key={workshop.id}
                                    className="px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-4"
                                >
                                    <div className="relative w-full sm:w-16 h-40 sm:h-16 rounded-xl overflow-hidden flex-shrink-0">
                                        <Image
                                            src={workshop.coverImage}
                                            alt={workshop.title}
                                            fill
                                            className="object-cover"
                                        />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-inter font-semibold text-dark truncate">
                                            {workshop.title}
                                        </p>
                                        <div className="text-xs text-dark-muted font-inter mt-2 grid grid-cols-1 sm:flex sm:flex-wrap gap-2 sm:gap-3">
                                            <span className="inline-flex items-center gap-1">
                                                <CalendarDays className="w-3.5 h-3.5" />
                                                {formatDate(workshop.date)}
                                            </span>
                                            <span className="inline-flex items-center gap-1">
                                                <Users className="w-3.5 h-3.5" />
                                                {workshop.seatsRemaining}/{workshop.maxSeats} seats left
                                            </span>
                                            <span className="inline-flex items-center gap-1">
                                                <IndianRupee className="w-3.5 h-3.5" />
                                                {formatCurrency(workshop.price)}
                                            </span>
                                            <span className="inline-flex items-center gap-1">
                                                <Star className="w-3.5 h-3.5" />
                                                {workshop.rating}
                                            </span>
                                        </div>
                                    </div>
                                    <Link
                                        href={`/admin/workshops/${workshop.id}/edit`}
                                        className="btn-secondary !py-2 !px-4 text-sm w-full sm:w-auto justify-center"
                                    >
                                        Edit
                                    </Link>
                                </div>
                            ))}

                            {workshops.length === 0 && (
                                <div className="px-4 sm:px-6 py-10 text-center text-sm font-inter text-dark-muted">
                                    No workshops found yet.
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </AdminShell>
    );
}
