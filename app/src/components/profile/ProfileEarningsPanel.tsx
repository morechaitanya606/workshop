"use client";

import { formatCurrency, formatDate } from "@/lib/utils";
import type { HostLedgerResponse } from "@/lib/api-client";

type ProfileEarningsPanelProps = {
    ledger: HostLedgerResponse | null;
    loading: boolean;
};

export default function ProfileEarningsPanel({ ledger, loading }: ProfileEarningsPanelProps) {
    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-dark/60">
                <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-terracotta/20 border-t-terracotta" />
                <p>Loading your earnings...</p>
            </div>
        );
    }

    if (!ledger) {
        return (
            <div className="bg-white rounded-2xl p-12 text-center shadow-soft border border-dark/5">
                <p className="text-dark/60">No earnings data found.</p>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div className="bg-white rounded-2xl p-8 shadow-soft border border-dark/5">
                <h2 className="text-xl font-playfair font-medium mb-6">Earnings Overview</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="p-5 rounded-xl bg-cream">
                        <p className="text-sm text-dark/60 font-medium mb-1">Available to Payout</p>
                        <p className="text-3xl font-playfair text-terracotta">
                            {formatCurrency(
                                ledger.earnings
                                    .filter((earning) => earning.status === "available")
                                    .reduce((acc, curr) => acc + curr.amount, 0)
                            )}
                        </p>
                    </div>
                    <div className="p-5 rounded-xl bg-cream-50">
                        <p className="text-sm text-dark/60 font-medium mb-1">Pending Clearance</p>
                        <p className="text-3xl font-playfair text-dark">
                            {formatCurrency(
                                ledger.earnings
                                    .filter((earning) => earning.status === "pending")
                                    .reduce((acc, curr) => acc + curr.amount, 0)
                            )}
                        </p>
                    </div>
                    <div className="p-5 rounded-xl bg-cream-50">
                        <p className="text-sm text-dark/60 font-medium mb-1">Total Paid Out</p>
                        <p className="text-3xl font-playfair text-dark">
                            {formatCurrency(
                                ledger.payouts
                                    .filter((payout) => payout.status === "completed")
                                    .reduce((acc, curr) => acc + curr.amount, 0)
                            )}
                        </p>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-2xl p-8 shadow-soft border border-dark/5">
                <h2 className="text-xl font-playfair font-medium mb-6">Recent Earnings</h2>
                {ledger.earnings.length === 0 ? (
                    <p className="text-dark/60">No transactions yet.</p>
                ) : (
                    <div className="space-y-4">
                        {ledger.earnings.slice(0, 10).map((earning) => (
                            <div
                                key={earning.id}
                                className="flex justify-between items-center p-4 border border-dark/5 rounded-xl hover:border-dark/10 transition-colors"
                            >
                                <div>
                                    <p className="font-medium text-dark">
                                        {earning.booking?.workshop?.title || "Workshop Booking"}
                                    </p>
                                    <p className="text-sm text-dark/60">
                                        {formatDate(earning.created_at.split("T")[0])} &middot;{" "}
                                        {earning.booking?.guests} guest
                                        {earning.booking?.guests !== 1 ? "s" : ""}
                                    </p>
                                </div>
                                <div className="text-right flex flex-col items-end gap-1">
                                    <p className="font-semibold text-dark">
                                        +{formatCurrency(earning.amount)}
                                    </p>
                                    <span
                                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                                            earning.status === "available"
                                                ? "bg-emerald-100 text-emerald-800"
                                                : earning.status === "pending"
                                                  ? "bg-amber-100 text-amber-800"
                                                  : "bg-blue-100 text-blue-800"
                                        }`}
                                    >
                                        {earning.status}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="bg-white rounded-2xl p-8 shadow-soft border border-dark/5">
                <h2 className="text-xl font-playfair font-medium mb-6">Payout History</h2>
                {ledger.payouts.length === 0 ? (
                    <p className="text-dark/60">No payouts yet.</p>
                ) : (
                    <div className="space-y-4">
                        {ledger.payouts.map((payout) => (
                            <div
                                key={payout.id}
                                className="flex justify-between items-center p-4 border border-dark/5 rounded-xl"
                            >
                                <div>
                                    <p className="font-medium text-dark">Payout</p>
                                    <p className="text-sm text-dark/60">
                                        {formatDate(payout.created_at.split("T")[0])}{" "}
                                        {payout.reference_note ? `· ${payout.reference_note}` : ""}
                                    </p>
                                </div>
                                <div className="text-right flex flex-col items-end gap-1">
                                    <p className="font-semibold text-dark">
                                        {formatCurrency(payout.amount)}
                                    </p>
                                    <span
                                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                                            payout.status === "completed"
                                                ? "bg-emerald-100 text-emerald-800"
                                                : "bg-amber-100 text-amber-800"
                                        }`}
                                    >
                                        {payout.status}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
