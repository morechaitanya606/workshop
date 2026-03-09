import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CalendarDays, IndianRupee, Star, Users } from "lucide-react";
import AdminShell from "@/components/admin/AdminShell";
import type { Workshop } from "@/lib/data";
import { loadAdminDashboardData, type AdminDashboardStats } from "@/lib/admin-dashboard-data";
import { requireAdminSupabaseRscClient } from "@/lib/supabase-rsc";
import { formatCurrency, formatDate } from "@/lib/utils";

export default async function AdminDashboardPage() {
    const supabase = await requireAdminSupabaseRscClient("/admin/dashboard");

    let stats: AdminDashboardStats = {
        activeWorkshops: 0,
        totalBookedSeats: 0,
        revenue: 0,
        avgRating: "-",
    };
    let workshops: Workshop[] = [];
    let error: string | null = null;

    try {
        const loaded = await loadAdminDashboardData(supabase);
        stats = loaded.stats;
        workshops = loaded.workshops;
    } catch {
        error = "Unable to load dashboard right now. Please try again.";
    }

    const statCards = [
        {
            label: "Active Workshops",
            value: String(stats.activeWorkshops),
            icon: CalendarDays,
            iconClass: "text-terracotta",
            iconBg: "bg-terracotta/10",
        },
        {
            label: "Booked Seats",
            value: String(stats.totalBookedSeats),
            icon: Users,
            iconClass: "text-emerald-700",
            iconBg: "bg-emerald-100",
        },
        {
            label: "Revenue",
            value: formatCurrency(stats.revenue),
            icon: IndianRupee,
            iconClass: "text-blue-700",
            iconBg: "bg-blue-100",
        },
        {
            label: "Avg Rating",
            value: String(stats.avgRating),
            icon: Star,
            iconClass: "text-amber-700",
            iconBg: "bg-amber-100",
        },
    ];

    return (
        <AdminShell>
            <div className="mb-8">
                <p className="text-xs font-inter font-bold uppercase tracking-wider text-terracotta mb-2">
                    Admin Dashboard
                </p>
                <h1 className="heading-md">Overview</h1>
            </div>

            {error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-inter text-red-700">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <span>{error}</span>
                        <Link
                            href="/admin/dashboard"
                            className="inline-flex items-center justify-center rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                        >
                            Try again
                        </Link>
                    </div>
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
                        {statCards.map((card) => {
                            const Icon = card.icon;
                            return (
                                <div
                                    key={card.label}
                                    className="rounded-2xl border border-gray-200 bg-white p-5 shadow-soft"
                                >
                                    <div className="mb-4 flex items-center justify-between gap-3">
                                        <div
                                            className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${card.iconBg}`}
                                        >
                                            <Icon className={`h-5 w-5 ${card.iconClass}`} />
                                        </div>
                                        <p className="text-[11px] font-inter font-bold uppercase tracking-wider text-dark-muted text-right">
                                            {card.label}
                                        </p>
                                    </div>
                                    <p className="font-playfair text-3xl font-bold text-dark leading-none">
                                        {card.value}
                                    </p>
                                </div>
                            );
                        })}
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
                                    className="px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-4 hover:bg-cream-100 transition-colors duration-200"
                                >
                                    <div className="relative w-full sm:w-16 h-40 sm:h-16 rounded-xl overflow-hidden flex-shrink-0">
                                        <Image
                                            src={workshop.coverImage}
                                            alt={workshop.title}
                                            fill
                                            sizes="(max-width: 640px) 100vw, 64px"
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
                                                {workshop.seatsRemaining}/{workshop.maxSeats} seats
                                                left
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
