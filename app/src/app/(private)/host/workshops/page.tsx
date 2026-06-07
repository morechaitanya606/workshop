"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Calendar, MapPin, Users, Loader2, Plus, Clock, Pencil, Lock, Trash2 } from "lucide-react";
import HostShell from "@/components/host/HostShell";
import { useAuth } from "@/lib/auth-context";
import { deleteHostWorkshop, getHostWorkshops, toApiErrorMessage } from "@/lib/api-client";
import type { Workshop } from "@/lib/data";
import { formatCurrency, formatDate } from "@/lib/utils";

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

function getStatusMessage(status: Workshop["approvalStatus"]) {
    switch (status) {
        case "pending":
            return "This workshop is waiting for admin approval before it appears on the website.";
        case "rejected":
            return "This workshop is not live right now. You can edit it before asking admin to review it again.";
        default:
            return "This workshop is approved and visible on the website.";
    }
}

function canHostEditWorkshop(status: Workshop["approvalStatus"]) {
    return status !== "approved";
}

export default function HostWorkshopsPage() {
    const { session } = useAuth();
    const [workshops, setWorkshops] = useState<Workshop[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [deletingWorkshopId, setDeletingWorkshopId] = useState<string | null>(null);

    useEffect(() => {
        if (!session?.access_token) return;

        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                const result = await getHostWorkshops(session.access_token);
                setWorkshops(result.data || []);
            } catch (err) {
                setError(toApiErrorMessage(err, "Failed to load workshops."));
            } finally {
                setLoading(false);
            }
        };

        load();
    }, [session?.access_token]);

    const handleDeleteWorkshop = async (workshop: Workshop) => {
        if (!session?.access_token || workshop.approvalStatus === "approved") {
            return;
        }

        const confirmed = window.confirm(`Delete "${workshop.title}"? This cannot be undone.`);
        if (!confirmed) {
            return;
        }

        setDeletingWorkshopId(workshop.id);
        setError(null);

        try {
            await deleteHostWorkshop(session.access_token, workshop.id);
            setWorkshops((current) => current.filter((item) => item.id !== workshop.id));
        } catch (err) {
            setError(toApiErrorMessage(err, "Unable to delete workshop."));
        } finally {
            setDeletingWorkshopId(null);
        }
    };

    return (
        <HostShell>
            <div className="mb-8 flex items-center justify-between">
                <div>
                    <p className="text-xs font-inter font-bold uppercase tracking-wider text-terracotta mb-2">
                        Host
                    </p>
                    <h1 className="heading-md">My Workshops</h1>
                    <p className="mt-1 text-body text-dark-muted">
                        Submit new workshops and track whether they are pending, approved, or
                        rejected.
                    </p>
                </div>
                <Link href="/host/workshops/new" className="btn-primary">
                    <Plus className="w-4 h-4" />
                    New Workshop
                </Link>
            </div>

            {loading && (
                <div className="flex items-center gap-2 text-sm font-inter text-dark-muted">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading workshops...
                </div>
            )}

            {!loading && error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-inter mb-6">
                    {error}
                </div>
            )}

            {!loading && !error && workshops.length === 0 && (
                <div className="bg-white rounded-2xl shadow-soft p-10 text-center">
                    <Calendar className="w-10 h-10 mx-auto text-dark-muted mb-3" />
                    <p className="text-body text-dark-muted mb-4">
                        You haven&apos;t created any workshops yet.
                    </p>
                    <Link href="/host/workshops/new" className="btn-primary">
                        Create Your First Workshop
                    </Link>
                </div>
            )}

            {!loading && !error && workshops.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {workshops.map((workshop) => (
                        <div
                            key={workshop.id}
                            className="bg-white rounded-2xl shadow-soft overflow-hidden"
                        >
                            {/* Cover Image */}
                            <div className="relative h-48 w-full bg-cream-100">
                                {workshop.coverImage && (
                                    <Image
                                        src={workshop.coverImage}
                                        alt={workshop.title}
                                        fill
                                        className="object-cover"
                                    />
                                )}
                            </div>

                            {/* Content */}
                            <div className="p-5">
                                <div className="mb-2 flex flex-wrap items-center gap-2">
                                    <span className="inline-block bg-white/90 backdrop-blur-sm text-xs font-inter font-bold uppercase tracking-wider text-terracotta px-3 py-1 rounded-full">
                                        {workshop.category}
                                    </span>
                                    <span
                                        className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-inter font-semibold uppercase tracking-wide ${getApprovalBadgeClasses(workshop.approvalStatus)}`}
                                    >
                                        {getApprovalLabel(workshop.approvalStatus)}
                                    </span>
                                </div>
                                <h3 className="font-playfair text-lg font-bold text-dark mb-2 line-clamp-1">
                                    {workshop.title}
                                </h3>

                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-dark-muted font-inter mb-4">
                                    <span className="inline-flex items-center gap-1.5">
                                        <Calendar className="w-3.5 h-3.5" />
                                        {formatDate(workshop.date)}
                                    </span>
                                    <span className="inline-flex items-center gap-1.5">
                                        <Clock className="w-3.5 h-3.5" />
                                        {workshop.time}
                                    </span>
                                    <span className="inline-flex items-center gap-1.5">
                                        <MapPin className="w-3.5 h-3.5" />
                                        {workshop.location}, {workshop.city}
                                    </span>
                                </div>

                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2">
                                        <Users className="w-4 h-4 text-dark-muted" />
                                        <span className="text-sm font-inter text-dark-secondary">
                                            {workshop.maxSeats - workshop.seatsRemaining}/
                                            {workshop.maxSeats} seats booked
                                        </span>
                                    </div>
                                    <span className="font-inter font-bold text-dark text-lg">
                                        {formatCurrency(workshop.price)}
                                    </span>
                                </div>

                                {/* Seat fill bar */}
                                <div className="w-full h-2 bg-cream-100 rounded-full mb-4 overflow-hidden">
                                    <div
                                        className="h-full bg-terracotta rounded-full transition-all"
                                        style={{
                                            width: `${Math.min(100, ((workshop.maxSeats - workshop.seatsRemaining) / workshop.maxSeats) * 100)}%`,
                                        }}
                                    />
                                </div>

                                {/* Actions */}
                                <p className="mb-4 text-sm font-inter text-dark-muted">
                                    {getStatusMessage(workshop.approvalStatus)}
                                </p>

                                <div className="flex flex-wrap items-center gap-2">
                                    <Link
                                        href={`/host/workshops/${workshop.id}/attendees`}
                                        className="btn-secondary !py-2 !px-4 text-sm flex-1 min-w-[8rem] justify-center"
                                    >
                                        <Users className="w-4 h-4" />
                                        Attendees
                                    </Link>
                                    {canHostEditWorkshop(workshop.approvalStatus) ? (
                                        <>
                                            <Link
                                                href={`/host/workshops/${workshop.id}/edit`}
                                                className="btn-secondary !py-2 !px-4 text-sm flex-1 min-w-[8rem] justify-center"
                                            >
                                                <Pencil className="w-4 h-4" />
                                                Edit
                                            </Link>
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteWorkshop(workshop)}
                                                disabled={deletingWorkshopId === workshop.id}
                                                className="btn-secondary !py-2 !px-4 text-sm flex-1 min-w-[8rem] justify-center border-red-200 text-red-700 hover:border-red-300 disabled:opacity-60 disabled:cursor-not-allowed"
                                            >
                                                {deletingWorkshopId === workshop.id ? (
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <Trash2 className="w-4 h-4" />
                                                )}
                                                Delete
                                            </button>
                                        </>
                                    ) : (
                                        <button
                                            type="button"
                                            disabled
                                            className="btn-secondary !py-2 !px-4 text-sm flex-1 min-w-[8rem] justify-center opacity-60 cursor-not-allowed"
                                        >
                                            <Lock className="w-4 h-4" />
                                            Locked
                                        </button>
                                    )}
                                    {workshop.approvalStatus === "approved" ? (
                                        <Link
                                            href={`/workshop/${workshop.id}`}
                                            className="btn-secondary !py-2 !px-4 text-sm flex-1 min-w-[8rem] justify-center"
                                        >
                                            View Listing
                                        </Link>
                                    ) : (
                                        <button
                                            type="button"
                                            disabled
                                            className="btn-secondary !py-2 !px-4 text-sm flex-1 min-w-[8rem] justify-center opacity-60 cursor-not-allowed"
                                        >
                                            Not Live Yet
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </HostShell>
    );
}
