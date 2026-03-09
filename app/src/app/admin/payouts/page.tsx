"use client";

import { useEffect, useState } from "react";
import { IndianRupee, Loader2, Wallet } from "lucide-react";
import AdminShell from "@/components/admin/AdminShell";
import {
    createAdminPayout,
    getAdminPayoutBalances,
    getAdminPayouts,
    toApiErrorMessage,
    type AdminPayout,
    type AdminPayoutBalance,
} from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { formatCurrency, formatDate } from "@/lib/utils";

export default function AdminPayoutsPage() {
    const { session } = useAuth();

    const [balances, setBalances] = useState<AdminPayoutBalance[]>([]);
    const [payouts, setPayouts] = useState<AdminPayout[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [reloadKey, setReloadKey] = useState(0);
    const [processingHostId, setProcessingHostId] = useState<string | null>(null);
    const [referenceNotes, setReferenceNotes] = useState<Record<string, string>>({});

    useEffect(() => {
        let cancelled = false;

        const loadPayoutData = async () => {
            if (!session?.access_token) return;

            setLoading(true);
            setError(null);
            try {
                const [balancesResult, payoutsResult] = await Promise.all([
                    getAdminPayoutBalances(session.access_token),
                    getAdminPayouts(session.access_token),
                ]);

                if (!cancelled) {
                    setBalances(
                        Array.isArray(balancesResult.balances) ? balancesResult.balances : []
                    );
                    setPayouts(Array.isArray(payoutsResult.payouts) ? payoutsResult.payouts : []);
                }
            } catch (loadError) {
                if (!cancelled) {
                    setError(toApiErrorMessage(loadError, "Unable to load payouts dashboard."));
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        void loadPayoutData();

        return () => {
            cancelled = true;
        };
    }, [session, reloadKey]);

    const handleRetry = () => {
        setError(null);
        setReloadKey((prev) => prev + 1);
    };

    const handleMarkPaid = async (balance: AdminPayoutBalance) => {
        if (!session?.access_token) return;

        const confirmation = window.confirm(
            `Mark ${formatCurrency(balance.availableBalance)} as paid to ${balance.name}?`
        );
        if (!confirmation) return;

        setProcessingHostId(balance.hostId);
        setError(null);

        try {
            await createAdminPayout(session.access_token, {
                hostId: balance.hostId,
                referenceNote: referenceNotes[balance.hostId]?.trim() || undefined,
            });

            setReferenceNotes((prev) => ({
                ...prev,
                [balance.hostId]: "",
            }));
            setReloadKey((prev) => prev + 1);
        } catch (createError) {
            setError(toApiErrorMessage(createError, "Unable to record payout."));
        } finally {
            setProcessingHostId(null);
        }
    };

    return (
        <AdminShell>
            <div className="mb-8">
                <p className="text-xs font-inter font-bold uppercase tracking-wider text-terracotta mb-2">
                    Admin
                </p>
                <h1 className="heading-md">Payouts</h1>
                <p className="text-body text-dark-muted mt-1">
                    Track host earnings and record manual payouts.
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

            {loading ? (
                <div className="flex items-center gap-2 text-sm font-inter text-dark-muted">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading payout data...
                </div>
            ) : (
                <div className="space-y-8">
                    <section>
                        <h2 className="font-playfair text-2xl font-semibold text-dark mb-4">
                            Available Balances
                        </h2>

                        {balances.length === 0 ? (
                            <div className="bg-white rounded-2xl shadow-soft p-8 text-center">
                                <p className="text-sm font-inter text-dark-muted">
                                    No hosts have available earnings to pay right now.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {balances.map((balance) => {
                                    const isProcessing = processingHostId === balance.hostId;

                                    return (
                                        <div
                                            key={balance.hostId}
                                            className="bg-white rounded-2xl shadow-soft border border-gray-100 p-5"
                                        >
                                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                                <div>
                                                    <p className="font-inter text-lg font-semibold text-dark">
                                                        {balance.name}
                                                    </p>
                                                    <p className="text-sm font-inter text-dark-muted mt-1">
                                                        {balance.availableEarningsCount} earnings
                                                        ready for payout
                                                    </p>
                                                </div>
                                                <div className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-4 py-2 text-sm font-inter font-semibold text-emerald-900">
                                                    <IndianRupee className="w-4 h-4" />
                                                    {formatCurrency(balance.availableBalance)}
                                                </div>
                                            </div>

                                            <div className="mt-4 grid grid-cols-1 md:grid-cols-[1fr,auto] gap-3">
                                                <input
                                                    value={referenceNotes[balance.hostId] || ""}
                                                    onChange={(event) =>
                                                        setReferenceNotes((prev) => ({
                                                            ...prev,
                                                            [balance.hostId]: event.target.value,
                                                        }))
                                                    }
                                                    placeholder="Reference note (bank transaction id, Razorpay transfer id, etc.)"
                                                    className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => void handleMarkPaid(balance)}
                                                    disabled={isProcessing}
                                                    className="btn-primary !py-3 !px-5 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                                                >
                                                    {isProcessing ? (
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                    ) : (
                                                        <Wallet className="w-4 h-4" />
                                                    )}
                                                    Mark as Paid
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </section>

                    <section>
                        <h2 className="font-playfair text-2xl font-semibold text-dark mb-4">
                            Payout History
                        </h2>

                        {payouts.length === 0 ? (
                            <div className="bg-white rounded-2xl shadow-soft p-8 text-center">
                                <p className="text-sm font-inter text-dark-muted">
                                    No payouts recorded yet.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {payouts.map((payout) => (
                                    <div
                                        key={payout.id}
                                        className="bg-white rounded-2xl shadow-soft border border-gray-100 p-5"
                                    >
                                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                            <div>
                                                <p className="font-inter font-semibold text-dark">
                                                    {payout.host?.name || "Unknown host"}
                                                </p>
                                                <p className="text-xs font-inter text-dark-muted mt-1">
                                                    {formatDate(payout.created_at.slice(0, 10))}
                                                </p>
                                            </div>
                                            <div className="text-sm font-inter font-semibold text-dark">
                                                {formatCurrency(Number(payout.amount || 0))}
                                            </div>
                                        </div>

                                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-inter">
                                            <span className="inline-flex items-center rounded-full border border-gray-200 bg-cream-100 px-2.5 py-1 font-semibold uppercase tracking-wide text-dark-muted">
                                                {payout.status}
                                            </span>
                                            {payout.reference_note && (
                                                <span className="text-dark-muted">
                                                    Ref: {payout.reference_note}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                </div>
            )}
        </AdminShell>
    );
}
