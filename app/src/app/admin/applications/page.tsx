"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, UserRound, XCircle } from "lucide-react";
import AdminShell from "@/components/admin/AdminShell";
import { useAuth } from "@/lib/auth-context";
import {
    approveHostApplication,
    getAdminHostApplications,
    rejectHostApplication,
    toApiErrorMessage,
    type HostApplication,
} from "@/lib/api-client";
import { formatDate } from "@/lib/utils";

type StatusFilter = "all" | "pending" | "approved" | "rejected";

export default function AdminApplicationsPage() {
    const { session } = useAuth();
    const [applications, setApplications] = useState<HostApplication[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [reloadKey, setReloadKey] = useState(0);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [filter, setFilter] = useState<StatusFilter>("all");

    useEffect(() => {
        let cancelled = false;

        const loadApplications = async () => {
            if (!session?.access_token) return;

            setLoading(true);
            setError(null);
            try {
                const result = await getAdminHostApplications(session.access_token);
                if (!cancelled) {
                    setApplications(Array.isArray(result.applications) ? result.applications : []);
                }
            } catch (loadError) {
                if (!cancelled) {
                    setError(toApiErrorMessage(loadError, "Unable to load host applications."));
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        void loadApplications();

        return () => {
            cancelled = true;
        };
    }, [session, reloadKey]);

    const counts = useMemo(() => {
        const summary = { pending: 0, approved: 0, rejected: 0 };
        for (const app of applications) {
            summary[app.status] += 1;
        }
        return summary;
    }, [applications]);

    const filteredApplications = useMemo(() => {
        if (filter === "all") return applications;
        return applications.filter((item) => item.status === filter);
    }, [applications, filter]);

    const handleRetry = () => {
        setError(null);
        setReloadKey((prev) => prev + 1);
    };

    const updateApplication = (next: HostApplication) => {
        setApplications((prev) => prev.map((item) => (item.id === next.id ? next : item)));
    };

    const handleApprove = async (application: HostApplication) => {
        if (!session?.access_token || application.status !== "pending") return;

        setProcessingId(application.id);
        setError(null);
        try {
            const result = await approveHostApplication(session.access_token, application.id);
            updateApplication(result.application);
        } catch (approveError) {
            setError(toApiErrorMessage(approveError, "Unable to approve application."));
        } finally {
            setProcessingId(null);
        }
    };

    const handleReject = async (application: HostApplication) => {
        if (!session?.access_token || application.status !== "pending") return;

        const confirmed = window.confirm("Reject this host application?");
        if (!confirmed) return;

        setProcessingId(application.id);
        setError(null);
        try {
            const result = await rejectHostApplication(session.access_token, application.id);
            updateApplication(result.application);
        } catch (rejectError) {
            setError(toApiErrorMessage(rejectError, "Unable to reject application."));
        } finally {
            setProcessingId(null);
        }
    };

    return (
        <AdminShell>
            <div className="mb-8">
                <p className="mb-2 text-xs font-inter font-bold uppercase tracking-wider text-terracotta">
                    Admin
                </p>
                <h1 className="heading-md">Host Applications</h1>
                <p className="mt-1 text-body text-dark-muted">
                    Review creator applications and approve or reject requests.
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

            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
                <button
                    type="button"
                    onClick={() => setFilter("all")}
                    className={`rounded-2xl border px-4 py-3 text-left ${
                        filter === "all"
                            ? "border-dark bg-dark text-white"
                            : "border-gray-200 bg-white text-dark"
                    }`}
                >
                    <p className="text-xs font-inter font-semibold uppercase tracking-wider opacity-80">
                        All
                    </p>
                    <p className="mt-1 text-2xl font-playfair font-bold">{applications.length}</p>
                </button>
                <button
                    type="button"
                    onClick={() => setFilter("pending")}
                    className={`rounded-2xl border px-4 py-3 text-left ${
                        filter === "pending"
                            ? "border-dark bg-dark text-white"
                            : "border-gray-200 bg-white text-dark"
                    }`}
                >
                    <p className="text-xs font-inter font-semibold uppercase tracking-wider opacity-80">
                        Pending
                    </p>
                    <p className="mt-1 text-2xl font-playfair font-bold">{counts.pending}</p>
                </button>
                <button
                    type="button"
                    onClick={() => setFilter("approved")}
                    className={`rounded-2xl border px-4 py-3 text-left ${
                        filter === "approved"
                            ? "border-dark bg-dark text-white"
                            : "border-gray-200 bg-white text-dark"
                    }`}
                >
                    <p className="text-xs font-inter font-semibold uppercase tracking-wider opacity-80">
                        Approved
                    </p>
                    <p className="mt-1 text-2xl font-playfair font-bold">{counts.approved}</p>
                </button>
                <button
                    type="button"
                    onClick={() => setFilter("rejected")}
                    className={`rounded-2xl border px-4 py-3 text-left ${
                        filter === "rejected"
                            ? "border-dark bg-dark text-white"
                            : "border-gray-200 bg-white text-dark"
                    }`}
                >
                    <p className="text-xs font-inter font-semibold uppercase tracking-wider opacity-80">
                        Rejected
                    </p>
                    <p className="mt-1 text-2xl font-playfair font-bold">{counts.rejected}</p>
                </button>
            </div>

            {loading ? (
                <div className="flex items-center gap-2 text-sm font-inter text-dark-muted">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading host applications...
                </div>
            ) : filteredApplications.length === 0 ? (
                <div className="rounded-2xl bg-white p-10 text-center shadow-soft">
                    <UserRound className="mx-auto mb-3 h-10 w-10 text-dark-muted" />
                    <p className="text-body text-dark-muted">
                        No applications found for this filter.
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {filteredApplications.map((application) => {
                        const isPending = application.status === "pending";
                        const isProcessing = processingId === application.id;

                        return (
                            <div
                                key={application.id}
                                className="rounded-2xl border border-gray-100 bg-white p-5 shadow-soft"
                            >
                                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="min-w-0">
                                        <p className="font-inter text-lg font-semibold text-dark">
                                            {application.name}
                                        </p>
                                        <p className="text-sm font-inter text-dark-muted">
                                            {application.email}
                                        </p>
                                    </div>
                                    <div className="text-left sm:text-right">
                                        <span className="inline-flex rounded-full border border-gray-200 bg-cream-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-dark-muted">
                                            {application.status}
                                        </span>
                                        <p className="mt-2 text-xs font-inter text-dark-muted">
                                            Applied{" "}
                                            {formatDate(application.created_at.slice(0, 10))}
                                        </p>
                                    </div>
                                </div>

                                <p className="mb-4 whitespace-pre-wrap text-sm font-inter text-dark-secondary">
                                    {application.bio}
                                </p>

                                {application.portfolio_url && (
                                    <a
                                        href={application.portfolio_url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="mb-4 inline-flex text-sm font-semibold text-terracotta hover:underline"
                                    >
                                        Portfolio: {application.portfolio_url}
                                    </a>
                                )}

                                {isPending && (
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            onClick={() => void handleApprove(application)}
                                            disabled={isProcessing}
                                            className="btn-primary !py-2 !px-4 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            {isProcessing ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <CheckCircle2 className="h-4 w-4" />
                                            )}
                                            Approve
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => void handleReject(application)}
                                            disabled={isProcessing}
                                            className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-inter font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            <XCircle className="h-4 w-4" />
                                            Reject
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </AdminShell>
    );
}
