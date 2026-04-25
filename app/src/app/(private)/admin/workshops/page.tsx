"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
    CheckCircle2,
    Loader2,
    Plus,
    PencilLine,
    MapPin,
    CalendarDays,
    Trash2,
    Users,
    XCircle,
} from "lucide-react";
import type { Workshop } from "@/lib/data";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import AdminShell from "@/components/admin/AdminShell";
import {
    approveAdminWorkshop,
    deleteAdminWorkshop,
    getAdminWorkshops,
    rejectAdminWorkshop,
    toApiErrorMessage,
} from "@/lib/api-client";

function getApprovalBadgeClasses(status: Workshop["approvalStatus"]) {
    switch (status) {
        case "pending":
            return "border-amber-200 bg-amber-50 text-amber-800";
        case "rejected":
            return "border-red-200 bg-red-50 text-red-700";
        default:
            return "border-emerald-200 bg-emerald-50 text-emerald-700";
    }
}

function getApprovalLabel(status: Workshop["approvalStatus"]) {
    switch (status) {
        case "pending":
            return "Pending Approval";
        case "rejected":
            return "Rejected";
        default:
            return "Approved";
    }
}

export default function AdminWorkshopsPage() {
    const { session } = useAuth();
    const [workshops, setWorkshops] = useState<Workshop[]>([]);
    const [loadingWorkshops, setLoadingWorkshops] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [processingApprovalId, setProcessingApprovalId] = useState<string | null>(null);
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        let cancelled = false;

        const loadWorkshops = async () => {
            if (!session?.access_token) return;

            setLoadingWorkshops(true);
            setError(null);
            try {
                const result = await getAdminWorkshops(session.access_token);
                if (!cancelled) {
                    setWorkshops(Array.isArray(result.data) ? result.data : []);
                }
            } catch {
                if (!cancelled) {
                    setError("Unable to load workshops right now. Please try again.");
                }
            } finally {
                if (!cancelled) {
                    setLoadingWorkshops(false);
                }
            }
        };

        loadWorkshops();
        return () => {
            cancelled = true;
        };
    }, [session, reloadKey]);

    const handleDeleteWorkshop = async (workshop: Workshop) => {
        if (!session?.access_token) return;
        const confirmed = window.confirm(`Delete "${workshop.title}"? This cannot be undone.`);
        if (!confirmed) return;

        setDeletingId(workshop.id);
        setError(null);
        try {
            await deleteAdminWorkshop(session.access_token, workshop.id);

            setWorkshops((prev) => prev.filter((item) => item.id !== workshop.id));
        } catch (deleteError) {
            setError(
                toApiErrorMessage(
                    deleteError,
                    "Unable to delete this workshop right now. Please try again."
                )
            );
        } finally {
            setDeletingId(null);
        }
    };

    const updateWorkshop = (nextWorkshop: Workshop) => {
        setWorkshops((prev) =>
            prev.map((item) => (item.id === nextWorkshop.id ? nextWorkshop : item))
        );
    };

    const handleApproveWorkshop = async (workshop: Workshop) => {
        if (!session?.access_token || workshop.approvalStatus === "approved") return;

        setProcessingApprovalId(workshop.id);
        setError(null);
        try {
            const result = await approveAdminWorkshop(session.access_token, workshop.id);
            updateWorkshop(result.workshop);
        } catch (approveError) {
            setError(toApiErrorMessage(approveError, "Unable to approve this workshop right now."));
        } finally {
            setProcessingApprovalId(null);
        }
    };

    const handleRejectWorkshop = async (workshop: Workshop) => {
        if (!session?.access_token || workshop.approvalStatus === "rejected") return;

        const confirmed = window.confirm(`Reject "${workshop.title}" for now?`);
        if (!confirmed) return;

        setProcessingApprovalId(workshop.id);
        setError(null);
        try {
            const result = await rejectAdminWorkshop(session.access_token, workshop.id);
            updateWorkshop(result.workshop);
        } catch (rejectError) {
            setError(toApiErrorMessage(rejectError, "Unable to reject this workshop right now."));
        } finally {
            setProcessingApprovalId(null);
        }
    };

    const handleRetry = () => {
        setError(null);
        setReloadKey((prev) => prev + 1);
    };

    return (
        <AdminShell>
            <div className="mb-8">
                <div>
                    <p className="text-xs font-inter font-bold uppercase tracking-wider text-terracotta mb-2">
                        Admin
                    </p>
                    <h1 className="heading-md">Workshops</h1>
                    <p className="mt-1 text-body text-dark-muted">
                        Review host submissions and approve workshops before they go live.
                    </p>
                </div>
            </div>

            {loadingWorkshops && (
                <div className="flex items-center gap-2 text-sm font-inter text-dark-muted">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading workshops...
                </div>
            )}

            {!loadingWorkshops && error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-inter">
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

            {!loadingWorkshops && !error && (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                    {workshops.map((workshop) => (
                        <div
                            key={workshop.id}
                            className="bg-white rounded-2xl shadow-soft overflow-hidden"
                        >
                            <div className="relative h-44">
                                <Image
                                    src={workshop.coverImage}
                                    alt={workshop.title}
                                    fill
                                    className="object-cover"
                                />
                            </div>
                            <div className="p-5">
                                <div className="mb-2 flex flex-wrap items-center gap-2">
                                    <p className="text-xs font-inter font-semibold uppercase tracking-wider text-terracotta">
                                        {workshop.category}
                                    </p>
                                    <span
                                        className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-inter font-semibold uppercase tracking-wide ${getApprovalBadgeClasses(workshop.approvalStatus)}`}
                                    >
                                        {getApprovalLabel(workshop.approvalStatus)}
                                    </span>
                                </div>
                                <h2 className="font-playfair text-xl font-semibold text-dark mb-2">
                                    {workshop.title}
                                </h2>
                                <div className="text-sm font-inter text-dark-muted space-y-1 mb-4">
                                    <p className="inline-flex items-center gap-1.5">
                                        <CalendarDays className="w-4 h-4" />
                                        {formatDate(workshop.date)} &middot; {workshop.time}
                                    </p>
                                    <p className="inline-flex items-center gap-1.5">
                                        <MapPin className="w-4 h-4" />
                                        {workshop.location}, {workshop.city}
                                    </p>
                                </div>
                                <div className="flex items-center justify-between">
                                    <p className="font-inter font-semibold text-dark">
                                        {formatCurrency(workshop.price)}
                                    </p>
                                    <div className="flex flex-wrap items-center justify-end gap-2">
                                        {workshop.approvalStatus !== "approved" && (
                                            <button
                                                type="button"
                                                onClick={() => void handleApproveWorkshop(workshop)}
                                                disabled={processingApprovalId === workshop.id}
                                                className="btn-primary !py-2 !px-4 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                                {processingApprovalId === workshop.id ? (
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <CheckCircle2 className="w-4 h-4" />
                                                )}
                                                Approve
                                            </button>
                                        )}
                                        {workshop.approvalStatus === "pending" && (
                                            <button
                                                type="button"
                                                onClick={() => void handleRejectWorkshop(workshop)}
                                                disabled={processingApprovalId === workshop.id}
                                                className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-inter font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60 disabled:cursor-not-allowed"
                                            >
                                                <XCircle className="w-4 h-4" />
                                                Reject
                                            </button>
                                        )}
                                        <Link
                                            href={`/admin/workshops/${workshop.id}/attendees`}
                                            className="btn-secondary !py-2 !px-4 text-sm"
                                        >
                                            <Users className="w-4 h-4" />
                                            Attendees
                                        </Link>
                                        <Link
                                            href={`/admin/workshops/${workshop.id}/edit`}
                                            className="btn-secondary !py-2 !px-4 text-sm"
                                        >
                                            <PencilLine className="w-4 h-4" />
                                            Edit
                                        </Link>
                                        <button
                                            onClick={() => handleDeleteWorkshop(workshop)}
                                            disabled={deletingId === workshop.id}
                                            className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-inter font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60 disabled:cursor-not-allowed"
                                        >
                                            {deletingId === workshop.id ? (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                                <Trash2 className="w-4 h-4" />
                                            )}
                                            Delete
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}

                    {workshops.length === 0 && (
                        <div className="col-span-full bg-white rounded-2xl p-8 text-center shadow-soft">
                            <p className="text-body text-dark-muted mb-4">No workshops yet.</p>
                            <Link href="/admin/workshops/new" className="btn-primary">
                                <Plus className="w-4 h-4" />
                                Create Workshop
                            </Link>
                        </div>
                    )}
                </div>
            )}
        </AdminShell>
    );
}
