"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Users, Ticket, IndianRupee, Search } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { formatCurrency, formatDate } from "@/lib/utils";
import AdminShell from "@/components/admin/AdminShell";

type Registration = {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
    guests: number;
    total: number;
    status: string;
    created_at: string;
    workshop: {
        id: string;
        title: string;
        date: string;
        time: string;
        city: string;
        location: string;
    } | null;
};

export default function AdminAnalyticsPage() {
    const { session } = useAuth();
    const [registrations, setRegistrations] = useState<Registration[]>([]);
    const [loadingRegistrations, setLoadingRegistrations] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchInput, setSearchInput] = useState("");
    const [query, setQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const pageSize = 12;

    useEffect(() => {
        let cancelled = false;

        const loadRegistrations = async () => {
            if (!session?.access_token) return;

            setLoadingRegistrations(true);
            setError(null);
            try {
                const params = new URLSearchParams({
                    page: String(page),
                    pageSize: String(pageSize),
                    status: statusFilter,
                });
                if (query.trim()) {
                    params.set("q", query.trim());
                }

                const response = await fetch(`/api/admin/registrations?${params.toString()}`, {
                    headers: {
                        Authorization: `Bearer ${session.access_token}`,
                    },
                    cache: "no-store",
                });
                const result = await response.json();
                if (!response.ok) {
                    throw new Error(result.error || "Failed to load analytics.");
                }
                if (!cancelled) {
                    const nextTotalPages = Number(result.totalPages || 1);
                    setTotal(Number(result.total || 0));
                    setTotalPages(nextTotalPages);
                    if (page > nextTotalPages) {
                        setPage(nextTotalPages);
                        return;
                    }
                    setRegistrations(
                        Array.isArray(result.registrations) ? result.registrations : []
                    );
                }
            } catch (fetchError) {
                if (!cancelled) {
                    setError(
                        fetchError instanceof Error
                            ? fetchError.message
                            : "Unable to load analytics."
                    );
                }
            } finally {
                if (!cancelled) {
                    setLoadingRegistrations(false);
                }
            }
        };

        loadRegistrations();
        return () => {
            cancelled = true;
        };
    }, [session, page, pageSize, query, statusFilter]);

    const pageSummary = useMemo(() => {
        return registrations.reduce(
            (acc, item) => {
                acc.totalGuests += Number(item.guests || 0);
                acc.totalRevenue += Number(item.total || 0);
                return acc;
            },
            { totalGuests: 0, totalRevenue: 0 }
        );
    }, [registrations]);

    const applyFilters = () => {
        setPage(1);
        setQuery(searchInput.trim());
    };

    const resetFilters = () => {
        setSearchInput("");
        setQuery("");
        setStatusFilter("all");
        setPage(1);
    };

    return (
        <AdminShell>
            <div className="mb-8">
                <p className="text-xs font-inter font-bold uppercase tracking-wider text-terracotta mb-2">
                    Admin
                </p>
                <h1 className="heading-md">Analytics</h1>
                <p className="text-body text-dark-muted mt-1">
                    Registered users and booking details.
                </p>
            </div>

            <div className="bg-white rounded-2xl shadow-soft p-4 sm:p-5 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-[1fr,220px,auto,auto] gap-3">
                    <div className="relative">
                        <Search className="w-4 h-4 text-dark-muted absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    applyFilters();
                                }
                            }}
                            placeholder="Search by name or email"
                            className="w-full bg-cream-100 border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm font-inter text-dark"
                        />
                    </div>
                    <select
                        value={statusFilter}
                        onChange={(e) => {
                            setStatusFilter(e.target.value);
                            setPage(1);
                        }}
                        className="bg-cream-100 border border-gray-200 rounded-xl px-3 py-3 text-sm font-inter text-dark"
                    >
                        <option value="all">All Statuses</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="cancelled">Cancelled</option>
                        <option value="refunded">Refunded</option>
                    </select>
                    <button onClick={applyFilters} className="btn-primary !py-3 !px-5 text-sm">
                        Apply
                    </button>
                    <button onClick={resetFilters} className="btn-secondary !py-3 !px-5 text-sm">
                        Reset
                    </button>
                </div>
            </div>

            {loadingRegistrations && (
                <div className="flex items-center gap-2 text-sm font-inter text-dark-muted">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading analytics...
                </div>
            )}

            {!loadingRegistrations && error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-inter">
                    {error}
                </div>
            )}

            {!loadingRegistrations && !error && (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                        <div className="bg-white rounded-2xl shadow-soft p-5">
                            <p className="text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-1">
                                Registrations
                            </p>
                            <p className="font-playfair text-2xl font-bold text-dark inline-flex items-center gap-2">
                                <Users className="w-5 h-5 text-terracotta" />
                                {total}
                            </p>
                        </div>
                        <div className="bg-white rounded-2xl shadow-soft p-5">
                            <p className="text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-1">
                                Guests (Page)
                            </p>
                            <p className="font-playfair text-2xl font-bold text-dark inline-flex items-center gap-2">
                                <Ticket className="w-5 h-5 text-terracotta" />
                                {pageSummary.totalGuests}
                            </p>
                        </div>
                        <div className="bg-white rounded-2xl shadow-soft p-5">
                            <p className="text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-1">
                                Revenue (Page)
                            </p>
                            <p className="font-playfair text-2xl font-bold text-dark inline-flex items-center gap-2">
                                <IndianRupee className="w-5 h-5 text-terracotta" />
                                {formatCurrency(pageSummary.totalRevenue)}
                            </p>
                        </div>
                    </div>

                    <div className="hidden lg:block bg-white rounded-2xl shadow-soft overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100">
                            <h2 className="font-playfair text-xl font-semibold text-dark">
                                User Registrations
                            </h2>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm font-inter">
                                <thead className="bg-cream-100 text-dark-muted">
                                    <tr>
                                        <th className="text-left px-4 py-3">User</th>
                                        <th className="text-left px-4 py-3">Workshop</th>
                                        <th className="text-left px-4 py-3">Guests</th>
                                        <th className="text-left px-4 py-3">Total</th>
                                        <th className="text-left px-4 py-3">Status</th>
                                        <th className="text-left px-4 py-3">Booked At</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {registrations.map((item) => (
                                        <tr key={item.id} className="border-b border-gray-100">
                                            <td className="px-4 py-3">
                                                <p className="font-semibold text-dark">
                                                    {item.first_name} {item.last_name}
                                                </p>
                                                <p className="text-xs text-dark-muted">{item.email}</p>
                                                {item.phone && (
                                                    <p className="text-xs text-dark-muted">{item.phone}</p>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <p className="font-semibold text-dark">
                                                    {item.workshop?.title || "Workshop"}
                                                </p>
                                                <p className="text-xs text-dark-muted">
                                                    {item.workshop?.date
                                                        ? `${formatDate(item.workshop.date)} · ${item.workshop?.time || ""}`
                                                        : "Date TBA"}
                                                </p>
                                            </td>
                                            <td className="px-4 py-3">{item.guests}</td>
                                            <td className="px-4 py-3">{formatCurrency(item.total)}</td>
                                            <td className="px-4 py-3 capitalize">{item.status}</td>
                                            <td className="px-4 py-3">
                                                {formatDate(item.created_at.slice(0, 10))}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="lg:hidden space-y-4">
                        {registrations.map((item) => (
                            <div key={item.id} className="bg-white rounded-2xl shadow-soft p-4">
                                <p className="font-inter font-semibold text-dark">
                                    {item.first_name} {item.last_name}
                                </p>
                                <p className="text-xs font-inter text-dark-muted">{item.email}</p>
                                {item.phone && (
                                    <p className="text-xs font-inter text-dark-muted">{item.phone}</p>
                                )}
                                <div className="mt-3 text-sm font-inter text-dark-secondary space-y-1">
                                    <p>
                                        <span className="text-dark-muted">Workshop: </span>
                                        {item.workshop?.title || "Workshop"}
                                    </p>
                                    <p>
                                        <span className="text-dark-muted">Guests: </span>
                                        {item.guests}
                                    </p>
                                    <p>
                                        <span className="text-dark-muted">Total: </span>
                                        {formatCurrency(item.total)}
                                    </p>
                                    <p>
                                        <span className="text-dark-muted">Status: </span>
                                        <span className="capitalize">{item.status}</span>
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {totalPages > 1 && (
                        <div className="mt-6 flex items-center justify-center gap-3">
                            <button
                                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                                disabled={page <= 1}
                                className="btn-secondary !py-2 !px-4 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                Previous
                            </button>
                            <span className="text-sm font-inter text-dark-muted">
                                Page {page} of {totalPages}
                            </span>
                            <button
                                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                                disabled={page >= totalPages}
                                className="btn-secondary !py-2 !px-4 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                Next
                            </button>
                        </div>
                    )}
                </>
            )}
        </AdminShell>
    );
}
