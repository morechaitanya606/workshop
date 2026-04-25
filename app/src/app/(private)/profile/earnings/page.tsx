"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Wallet } from "lucide-react";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import { getHostEarnings, toApiErrorMessage, type HostEarningsResponse } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { formatCurrency, formatDate } from "@/lib/utils";

const earningStatusClasses: Record<"pending" | "available" | "paid", string> = {
    pending: "bg-amber-100 text-amber-900 border-amber-200",
    available: "bg-blue-100 text-blue-900 border-blue-200",
    paid: "bg-emerald-100 text-emerald-900 border-emerald-200",
};

export default function HostEarningsPage() {
    const router = useRouter();
    const { user, session, loading, role, roleLoading } = useAuth();

    const [data, setData] = useState<HostEarningsResponse | null>(null);
    const [fetching, setFetching] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        if (!loading && !user) {
            router.replace(`/auth/login?redirect=${encodeURIComponent("/profile/earnings")}`);
        }
    }, [loading, user, router]);

    useEffect(() => {
        let cancelled = false;

        const loadData = async () => {
            if (!session?.access_token || role !== "host") return;

            setFetching(true);
            setError(null);
            try {
                const result = await getHostEarnings(session.access_token);
                if (!cancelled) {
                    setData(result);
                }
            } catch (loadError) {
                if (!cancelled) {
                    setError(toApiErrorMessage(loadError, "Unable to load host earnings."));
                }
            } finally {
                if (!cancelled) {
                    setFetching(false);
                }
            }
        };

        void loadData();

        return () => {
            cancelled = true;
        };
    }, [session, role, reloadKey]);

    const handleRetry = () => {
        setError(null);
        setReloadKey((prev) => prev + 1);
    };

    if (loading || roleLoading) {
        return (
            <main className="min-h-screen flex items-center justify-center bg-cream">
                <Loader2 className="w-8 h-8 animate-spin text-terracotta" />
            </main>
        );
    }

    if (!user) {
        return null;
    }

    if (role !== "host") {
        return (
            <main className="min-h-screen bg-cream">
                <Navbar />
                <section className="pt-28 pb-16 section-padding">
                    <div className="max-w-2xl mx-auto bg-white rounded-2xl border border-gray-200 shadow-soft p-8 text-center">
                        <h1 className="heading-sm mb-2">Host access required</h1>
                        <p className="text-body text-dark-muted mb-6">
                            This page is only available for approved host accounts.
                        </p>
                        <Link href="/profile" className="btn-primary !py-3 !px-5 text-sm">
                            Back to Profile
                        </Link>
                    </div>
                </section>
                <Footer />
            </main>
        );
    }

    const summary = data?.summary || { pending: 0, available: 0, paid: 0 };

    return (
        <main className="min-h-screen bg-cream text-dark">
            <Navbar />

            <section className="pt-28 pb-16 section-padding">
                <div className="max-w-5xl mx-auto">
                    <Link
                        href="/profile"
                        className="inline-flex items-center gap-2 text-sm font-inter text-dark-muted hover:text-terracotta transition-colors mb-6"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back to Profile
                    </Link>

                    <div className="mb-8">
                        <p className="text-xs font-inter font-bold uppercase tracking-wider text-terracotta mb-2">
                            Host Dashboard
                        </p>
                        <h1 className="heading-md">Earnings & Payouts</h1>
                        <p className="text-body text-dark-muted mt-1">
                            Track pending, available, and paid earnings from your bookings.
                        </p>
                    </div>

                    {error && (
                        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-inter text-red-700">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <span>{error}</span>
                                <button
                                    type="button"
                                    onClick={handleRetry}
                                    className="inline-flex items-center justify-center rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                                >
                                    Try again
                                </button>
                            </div>
                        </div>
                    )}

                    {fetching ? (
                        <div className="flex items-center gap-2 text-sm font-inter text-dark-muted">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Loading earnings...
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                                <div className="bg-white rounded-2xl shadow-soft p-5">
                                    <p className="text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-1">
                                        Pending
                                    </p>
                                    <p className="font-playfair text-2xl font-bold text-dark">
                                        {formatCurrency(summary.pending)}
                                    </p>
                                </div>
                                <div className="bg-white rounded-2xl shadow-soft p-5">
                                    <p className="text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-1">
                                        Available
                                    </p>
                                    <p className="font-playfair text-2xl font-bold text-dark">
                                        {formatCurrency(summary.available)}
                                    </p>
                                </div>
                                <div className="bg-white rounded-2xl shadow-soft p-5">
                                    <p className="text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-1">
                                        Paid
                                    </p>
                                    <p className="font-playfair text-2xl font-bold text-dark">
                                        {formatCurrency(summary.paid)}
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                                <section className="bg-white rounded-2xl shadow-soft p-5">
                                    <h2 className="font-playfair text-xl font-semibold text-dark mb-4">
                                        Earnings Ledger
                                    </h2>
                                    <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
                                        {data?.earnings?.map((earning) => (
                                            <div
                                                key={earning.id}
                                                className="rounded-xl border border-gray-100 bg-cream-50 p-4"
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div>
                                                        <p className="text-sm font-inter font-semibold text-dark">
                                                            {formatCurrency(
                                                                Number(earning.amount || 0)
                                                            )}
                                                        </p>
                                                        <p className="text-xs font-inter text-dark-muted mt-1">
                                                            Fee deducted:{" "}
                                                            {formatCurrency(
                                                                Number(earning.fee_deducted || 0)
                                                            )}
                                                        </p>
                                                        <p className="text-xs font-inter text-dark-muted mt-1">
                                                            Booking:{" "}
                                                            {earning.booking_id.slice(0, 8)}
                                                        </p>
                                                    </div>
                                                    <span
                                                        className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-inter font-semibold uppercase tracking-wide ${earningStatusClasses[earning.status]}`}
                                                    >
                                                        {earning.status}
                                                    </span>
                                                </div>
                                                <p className="text-xs font-inter text-dark-muted mt-3">
                                                    {formatDate(earning.created_at.slice(0, 10))}
                                                </p>
                                            </div>
                                        ))}

                                        {(!data?.earnings || data.earnings.length === 0) && (
                                            <div className="rounded-xl border border-gray-100 bg-cream-50 px-4 py-8 text-center text-sm font-inter text-dark-muted">
                                                No earnings records yet.
                                            </div>
                                        )}
                                    </div>
                                </section>

                                <section className="bg-white rounded-2xl shadow-soft p-5">
                                    <h2 className="font-playfair text-xl font-semibold text-dark mb-4">
                                        Payout History
                                    </h2>
                                    <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
                                        {data?.payouts?.map((payout) => (
                                            <div
                                                key={payout.id}
                                                className="rounded-xl border border-gray-100 bg-cream-50 p-4"
                                            >
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="inline-flex items-center gap-1 text-sm font-inter font-semibold text-dark">
                                                        <Wallet className="w-4 h-4" />
                                                        {formatCurrency(Number(payout.amount || 0))}
                                                    </div>
                                                    <span className="inline-flex items-center rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-inter font-semibold uppercase tracking-wide text-dark-muted">
                                                        {payout.status}
                                                    </span>
                                                </div>

                                                {payout.reference_note && (
                                                    <p className="text-xs font-inter text-dark-muted mt-2">
                                                        Ref: {payout.reference_note}
                                                    </p>
                                                )}

                                                <p className="text-xs font-inter text-dark-muted mt-2">
                                                    {formatDate(payout.created_at.slice(0, 10))}
                                                </p>
                                            </div>
                                        ))}

                                        {(!data?.payouts || data.payouts.length === 0) && (
                                            <div className="rounded-xl border border-gray-100 bg-cream-50 px-4 py-8 text-center text-sm font-inter text-dark-muted">
                                                No payouts recorded yet.
                                            </div>
                                        )}
                                    </div>
                                </section>
                            </div>
                        </>
                    )}
                </div>
            </section>

            <Footer />
        </main>
    );
}
