"use client";

import { useEffect, useState } from "react";
import { Wallet, Clock, CheckCircle2, TrendingUp, Loader2, Banknote } from "lucide-react";
import HostShell from "@/components/host/HostShell";
import { useAuth } from "@/lib/auth-context";
import { getHostEarnings, getHostLedger, toApiErrorMessage } from "@/lib/api-client";
import type { HostEarningsResponse, HostLedgerResponse } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils";

export default function HostEarningsPage() {
    const { session } = useAuth();
    const [earningsData, setEarningsData] = useState<HostEarningsResponse | null>(null);
    const [ledgerData, setLedgerData] = useState<HostLedgerResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!session?.access_token) return;

        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                const earnings = await getHostEarnings(session.access_token).catch(() => null);
                const ledger = await getHostLedger(session.access_token).catch(() => null);
                setEarningsData(earnings);
                setLedgerData(ledger);
            } catch (err) {
                setError(toApiErrorMessage(err, "Failed to load earnings."));
            } finally {
                setLoading(false);
            }
        };

        load();
    }, [session?.access_token]);

    const summary = earningsData?.summary ?? { pending: 0, available: 0, paid: 0 };
    const totalEarnings = summary.pending + summary.available + summary.paid;

    const statusBadge = (status: string) => {
        const styles: Record<string, string> = {
            pending: "bg-amber-50 text-amber-700 border-amber-200",
            available: "bg-emerald-50 text-emerald-700 border-emerald-200",
            paid: "bg-blue-50 text-blue-700 border-blue-200",
            processing: "bg-amber-50 text-amber-700 border-amber-200",
            completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
        };
        return `inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-inter font-semibold border ${styles[status] || "bg-gray-50 text-gray-600 border-gray-200"}`;
    };

    return (
        <HostShell>
            <div className="mb-8">
                <p className="text-xs font-inter font-bold uppercase tracking-wider text-terracotta mb-2">
                    Host
                </p>
                <h1 className="heading-md">Earnings & Payouts</h1>
                <p className="text-body text-dark-muted mt-1">
                    Track your workshop earnings and payout history.
                </p>
            </div>

            {loading && (
                <div className="flex items-center gap-2 text-sm font-inter text-dark-muted">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading earnings...
                </div>
            )}

            {!loading && error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-inter mb-6">
                    {error}
                </div>
            )}

            {!loading && !error && (
                <>
                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                        <div className="bg-white rounded-2xl shadow-soft p-5">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                                    <TrendingUp className="w-5 h-5 text-blue-600" />
                                </div>
                                <span className="text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                    Total Earned
                                </span>
                            </div>
                            <p className="font-playfair text-2xl font-bold text-dark">
                                {formatCurrency(totalEarnings)}
                            </p>
                        </div>

                        <div className="bg-white rounded-2xl shadow-soft p-5">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                                    <Clock className="w-5 h-5 text-amber-600" />
                                </div>
                                <span className="text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                    Pending
                                </span>
                            </div>
                            <p className="font-playfair text-2xl font-bold text-dark">
                                {formatCurrency(summary.pending)}
                            </p>
                        </div>

                        <div className="bg-white rounded-2xl shadow-soft p-5">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                                    <Wallet className="w-5 h-5 text-emerald-600" />
                                </div>
                                <span className="text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                    Available
                                </span>
                            </div>
                            <p className="font-playfair text-2xl font-bold text-dark">
                                {formatCurrency(summary.available)}
                            </p>
                        </div>

                        <div className="bg-white rounded-2xl shadow-soft p-5">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                                    <CheckCircle2 className="w-5 h-5 text-blue-600" />
                                </div>
                                <span className="text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                    Paid Out
                                </span>
                            </div>
                            <p className="font-playfair text-2xl font-bold text-dark">
                                {formatCurrency(summary.paid)}
                            </p>
                        </div>
                    </div>

                    {/* Earnings History */}
                    <div className="bg-white rounded-2xl shadow-soft p-5 sm:p-6 mb-6">
                        <h2 className="font-playfair text-xl font-bold text-dark mb-5">
                            Earnings History
                        </h2>

                        {ledgerData && ledgerData.earnings.length > 0 ? (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-gray-100">
                                            <th className="p-3 text-xs font-inter font-semibold uppercase text-dark-muted tracking-wider">
                                                Workshop
                                            </th>
                                            <th className="p-3 text-xs font-inter font-semibold uppercase text-dark-muted tracking-wider">
                                                Amount
                                            </th>
                                            <th className="p-3 text-xs font-inter font-semibold uppercase text-dark-muted tracking-wider">
                                                Fee
                                            </th>
                                            <th className="p-3 text-xs font-inter font-semibold uppercase text-dark-muted tracking-wider">
                                                Status
                                            </th>
                                            <th className="p-3 text-xs font-inter font-semibold uppercase text-dark-muted tracking-wider">
                                                Date
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {ledgerData.earnings.map((earning) => (
                                            <tr
                                                key={earning.id}
                                                className="hover:bg-cream-50/50 transition-colors"
                                            >
                                                <td className="p-3 text-sm font-inter text-dark">
                                                    {earning.booking?.workshop?.title || "—"}
                                                </td>
                                                <td className="p-3 text-sm font-inter font-semibold text-dark">
                                                    {formatCurrency(earning.amount)}
                                                </td>
                                                <td className="p-3 text-sm font-inter text-dark-muted">
                                                    {formatCurrency(earning.fee_deducted)}
                                                </td>
                                                <td className="p-3">
                                                    <span className={statusBadge(earning.status)}>
                                                        {earning.status}
                                                    </span>
                                                </td>
                                                <td className="p-3 text-sm font-inter text-dark-muted">
                                                    {new Date(
                                                        earning.created_at
                                                    ).toLocaleDateString()}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="text-center py-8">
                                <TrendingUp className="w-10 h-10 mx-auto text-dark-muted mb-3" />
                                <p className="text-body text-dark-muted">
                                    No earnings recorded yet. Earnings are created when users book
                                    your workshops.
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Payout History */}
                    <div className="bg-white rounded-2xl shadow-soft p-5 sm:p-6">
                        <h2 className="font-playfair text-xl font-bold text-dark mb-5">
                            Payout History
                        </h2>

                        {ledgerData && ledgerData.payouts.length > 0 ? (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-gray-100">
                                            <th className="p-3 text-xs font-inter font-semibold uppercase text-dark-muted tracking-wider">
                                                Amount
                                            </th>
                                            <th className="p-3 text-xs font-inter font-semibold uppercase text-dark-muted tracking-wider">
                                                Status
                                            </th>
                                            <th className="p-3 text-xs font-inter font-semibold uppercase text-dark-muted tracking-wider">
                                                Reference
                                            </th>
                                            <th className="p-3 text-xs font-inter font-semibold uppercase text-dark-muted tracking-wider">
                                                Date
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {ledgerData.payouts.map((payout) => (
                                            <tr
                                                key={payout.id}
                                                className="hover:bg-cream-50/50 transition-colors"
                                            >
                                                <td className="p-3 text-sm font-inter font-semibold text-dark">
                                                    {formatCurrency(payout.amount)}
                                                </td>
                                                <td className="p-3">
                                                    <span className={statusBadge(payout.status)}>
                                                        {payout.status}
                                                    </span>
                                                </td>
                                                <td className="p-3 text-sm font-inter text-dark-muted">
                                                    {payout.reference_note || "—"}
                                                </td>
                                                <td className="p-3 text-sm font-inter text-dark-muted">
                                                    {new Date(
                                                        payout.created_at
                                                    ).toLocaleDateString()}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="text-center py-8">
                                <Banknote className="w-10 h-10 mx-auto text-dark-muted mb-3" />
                                <p className="text-body text-dark-muted">
                                    No payouts recorded yet. The admin will process payouts when
                                    your available balance is ready.
                                </p>
                            </div>
                        )}
                    </div>
                </>
            )}
        </HostShell>
    );
}
