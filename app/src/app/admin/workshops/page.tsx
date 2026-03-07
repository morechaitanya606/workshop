"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
    Loader2,
    Plus,
    PencilLine,
    MapPin,
    CalendarDays,
    Trash2,
} from "lucide-react";
import type { Workshop } from "@/lib/data";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import AdminShell from "@/components/admin/AdminShell";

export default function AdminWorkshopsPage() {
    const { session } = useAuth();
    const [workshops, setWorkshops] = useState<Workshop[]>([]);
    const [loadingWorkshops, setLoadingWorkshops] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        const loadWorkshops = async () => {
            if (!session?.access_token) return;

            setLoadingWorkshops(true);
            setError(null);
            try {
                const response = await fetch("/api/admin/workshops", {
                    headers: {
                        Authorization: `Bearer ${session.access_token}`,
                    },
                    cache: "no-store",
                });
                const result = await response.json();
                if (!response.ok) {
                    throw new Error(result.error || "Failed to load workshops.");
                }
                if (!cancelled) {
                    setWorkshops(Array.isArray(result.data) ? result.data : []);
                }
            } catch (fetchError) {
                if (!cancelled) {
                    setError(
                        fetchError instanceof Error
                            ? fetchError.message
                            : "Unable to load workshops."
                    );
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
    }, [session]);

    const handleDeleteWorkshop = async (workshop: Workshop) => {
        if (!session?.access_token) return;
        const confirmed = window.confirm(
            `Delete "${workshop.title}"? This cannot be undone.`
        );
        if (!confirmed) return;

        setDeletingId(workshop.id);
        setError(null);
        try {
            const response = await fetch(`/api/admin/workshops/${workshop.id}`, {
                method: "DELETE",
                headers: {
                    Authorization: `Bearer ${session.access_token}`,
                },
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || "Failed to delete workshop.");
            }

            setWorkshops((prev) => prev.filter((item) => item.id !== workshop.id));
        } catch (deleteError) {
            setError(
                deleteError instanceof Error
                    ? deleteError.message
                    : "Unable to delete workshop."
            );
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <AdminShell>
            <div className="mb-8 flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
                <div>
                    <p className="text-xs font-inter font-bold uppercase tracking-wider text-terracotta mb-2">
                        Admin
                    </p>
                    <h1 className="heading-md">Workshops</h1>
                </div>
                <Link href="/admin/workshops/new" className="btn-primary">
                    <Plus className="w-4 h-4" />
                    Create Workshop
                </Link>
            </div>

            {loadingWorkshops && (
                <div className="flex items-center gap-2 text-sm font-inter text-dark-muted">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading workshops...
                </div>
            )}

            {!loadingWorkshops && error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-inter">
                    {error}
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
                                <p className="text-xs font-inter font-semibold uppercase tracking-wider text-terracotta mb-1">
                                    {workshop.category}
                                </p>
                                <h2 className="font-playfair text-xl font-semibold text-dark mb-2">
                                    {workshop.title}
                                </h2>
                                <div className="text-sm font-inter text-dark-muted space-y-1 mb-4">
                                    <p className="inline-flex items-center gap-1.5">
                                        <CalendarDays className="w-4 h-4" />
                                        {formatDate(workshop.date)} · {workshop.time}
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
                                    <div className="flex items-center gap-2">
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
                            <p className="text-body text-dark-muted mb-4">
                                No workshops yet.
                            </p>
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
