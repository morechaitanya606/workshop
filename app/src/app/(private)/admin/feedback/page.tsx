"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, MessageSquare, Search, PencilLine, Trash2, Save, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { formatDate } from "@/lib/utils";
import AdminShell from "@/components/admin/AdminShell";
import {
    deleteAdminFeedback,
    getAdminFeedback,
    toApiErrorMessage,
    updateAdminFeedback,
} from "@/lib/api-client";

type FeedbackItem = {
    id: string;
    userId: string;
    workshopId: string;
    rating: number | null;
    comment: string;
    photos: string[];
    videoUrl: string | null;
    createdAt: string;
    updatedAt: string;
    workshop: {
        id: string;
        title: string;
        date: string;
        time: string | null;
        city: string;
        location: string;
    } | null;
    user: {
        fullName: string | null;
        firstName: string | null;
        lastName: string | null;
        email: string | null;
    };
};

type EditDraft = {
    rating: number;
    comment: string;
};

const PAGE_SIZE = 12;

export default function AdminFeedbackPage() {
    const { session } = useAuth();
    const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
    const [loadingFeedback, setLoadingFeedback] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [reloadKey, setReloadKey] = useState(0);

    const [searchInput, setSearchInput] = useState("");
    const [query, setQuery] = useState("");
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
    const [savingId, setSavingId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        const loadFeedback = async () => {
            if (!session?.access_token) return;

            setLoadingFeedback(true);
            setError(null);
            try {
                const result = await getAdminFeedback(session.access_token, {
                    page,
                    pageSize: PAGE_SIZE,
                    q: query.trim(),
                });

                if (!cancelled) {
                    const nextTotalPages = Number(result.totalPages || 1);
                    setTotal(Number(result.total || 0));
                    setTotalPages(nextTotalPages);
                    if (page > nextTotalPages) {
                        setPage(nextTotalPages);
                        return;
                    }
                    setFeedback(Array.isArray(result.feedback) ? result.feedback : []);
                }
            } catch {
                if (!cancelled) {
                    setError("Unable to load feedback right now. Please try again.");
                }
            } finally {
                if (!cancelled) {
                    setLoadingFeedback(false);
                }
            }
        };

        loadFeedback();
        return () => {
            cancelled = true;
        };
    }, [session, page, query, reloadKey]);

    const pageStats = useMemo(() => {
        const rated = feedback.filter((item) => typeof item.rating === "number");
        const sum = rated.reduce((acc, item) => acc + Number(item.rating || 0), 0);
        return {
            ratedCount: rated.length,
            avgRating: rated.length ? (sum / rated.length).toFixed(1) : "-",
        };
    }, [feedback]);

    const getDisplayName = (item: FeedbackItem) => {
        if (item.user.fullName) return item.user.fullName;
        const bookingName = [item.user.firstName, item.user.lastName]
            .filter(Boolean)
            .join(" ")
            .trim();
        if (bookingName) return bookingName;
        if (item.user.email) return item.user.email;
        return `User ${item.userId.slice(0, 8)}`;
    };

    const beginEdit = (item: FeedbackItem) => {
        setEditingId(item.id);
        setEditDraft({
            rating: Number(item.rating || 5),
            comment: item.comment || "",
        });
        setError(null);
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditDraft(null);
    };

    const handleSaveEdit = async (id: string) => {
        if (!session?.access_token || !editDraft) return;
        if (!editDraft.comment.trim()) {
            setError("Comment cannot be empty.");
            return;
        }

        setSavingId(id);
        setError(null);
        try {
            const result = await updateAdminFeedback(session.access_token, id, {
                rating: editDraft.rating,
                comment: editDraft.comment.trim(),
            });

            const updatedFeedback = result.feedback;
            setFeedback((prev) =>
                prev.map((item) =>
                    item.id === id
                        ? {
                              ...item,
                              rating:
                                  typeof updatedFeedback.rating === "number"
                                      ? updatedFeedback.rating
                                      : editDraft.rating,
                              comment: updatedFeedback.comment || editDraft.comment.trim(),
                              updatedAt: updatedFeedback.updated_at || new Date().toISOString(),
                          }
                        : item
                )
            );
            cancelEdit();
        } catch (saveError) {
            setError(toApiErrorMessage(saveError, "Unable to update feedback."));
        } finally {
            setSavingId(null);
        }
    };

    const handleDelete = async (item: FeedbackItem) => {
        if (!session?.access_token) return;
        const confirmed = window.confirm("Delete this feedback? This action cannot be undone.");
        if (!confirmed) return;

        setDeletingId(item.id);
        setError(null);
        try {
            await deleteAdminFeedback(session.access_token, item.id);

            setFeedback((prev) => prev.filter((entry) => entry.id !== item.id));
            setTotal((prev) => Math.max(0, prev - 1));
        } catch (deleteError) {
            setError(toApiErrorMessage(deleteError, "Unable to delete feedback."));
        } finally {
            setDeletingId(null);
        }
    };

    const applySearch = () => {
        setPage(1);
        setQuery(searchInput.trim());
    };

    const resetSearch = () => {
        setSearchInput("");
        setQuery("");
        setPage(1);
    };

    const handleRetry = () => {
        setError(null);
        setReloadKey((prev) => prev + 1);
    };

    return (
        <AdminShell>
            <div className="mb-8">
                <p className="text-xs font-inter font-bold uppercase tracking-wider text-terracotta mb-2">
                    Admin
                </p>
                <h1 className="heading-md">Feedback</h1>
                <p className="text-body text-dark-muted mt-1">
                    Edit or delete user reviews across all workshops.
                </p>
            </div>

            <div className="bg-white rounded-2xl shadow-soft p-4 sm:p-5 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-[1fr,auto,auto] gap-3">
                    <div className="relative">
                        <Search className="w-4 h-4 text-dark-muted absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            value={searchInput}
                            onChange={(event) => setSearchInput(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                    applySearch();
                                }
                            }}
                            placeholder="Search by workshop id or comment"
                            className="w-full bg-cream-100 border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm font-inter text-dark"
                        />
                    </div>
                    <button onClick={applySearch} className="btn-primary !py-3 !px-5 text-sm">
                        Apply
                    </button>
                    <button onClick={resetSearch} className="btn-secondary !py-3 !px-5 text-sm">
                        Reset
                    </button>
                </div>
            </div>

            {loadingFeedback && (
                <div className="flex items-center gap-2 text-sm font-inter text-dark-muted">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading feedback...
                </div>
            )}

            {!loadingFeedback && error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-inter mb-6">
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

            {!loadingFeedback && (
                <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
                        <div className="bg-white rounded-2xl shadow-soft p-5">
                            <p className="text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-1">
                                Total Feedback
                            </p>
                            <p className="font-playfair text-2xl font-bold text-dark">{total}</p>
                        </div>
                        <div className="bg-white rounded-2xl shadow-soft p-5">
                            <p className="text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-1">
                                Rated (Page)
                            </p>
                            <p className="font-playfair text-2xl font-bold text-dark">
                                {pageStats.ratedCount}
                            </p>
                        </div>
                        <div className="bg-white rounded-2xl shadow-soft p-5 col-span-2 sm:col-span-1">
                            <p className="text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-1">
                                Avg Rating (Page)
                            </p>
                            <p className="font-playfair text-2xl font-bold text-dark">
                                {pageStats.avgRating}
                            </p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {feedback.map((item) => (
                            <div key={item.id} className="bg-white rounded-2xl shadow-soft p-5">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between mb-4">
                                    <div className="min-w-0">
                                        <p className="font-inter font-semibold text-dark truncate">
                                            {item.workshop?.title || "Workshop"}
                                        </p>
                                        <p className="text-xs font-inter text-dark-muted">
                                            {item.workshop?.date
                                                ? `${formatDate(item.workshop.date)} | ${item.workshop?.city || ""}`
                                                : item.workshopId}
                                        </p>
                                    </div>
                                    <div className="text-xs font-inter text-dark-muted">
                                        Updated:{" "}
                                        {item.updatedAt
                                            ? new Date(item.updatedAt).toLocaleDateString()
                                            : "-"}
                                    </div>
                                </div>

                                <div className="rounded-xl bg-cream-100 border border-gray-100 p-4 mb-4">
                                    <p className="text-sm font-inter font-semibold text-dark mb-1">
                                        {getDisplayName(item)}
                                    </p>
                                    {item.user.email && (
                                        <p className="text-xs font-inter text-dark-muted mb-2">
                                            {item.user.email}
                                        </p>
                                    )}
                                    <p className="text-xs font-inter font-semibold uppercase tracking-wider text-dark-muted mb-2">
                                        Rating: {item.rating ?? "-"} / 5
                                    </p>
                                    <p className="text-sm font-inter text-dark-secondary whitespace-pre-wrap">
                                        {item.comment}
                                    </p>
                                </div>

                                {editingId === item.id && editDraft ? (
                                    <div className="rounded-xl border border-gray-200 p-4 bg-white mb-4">
                                        <div className="grid grid-cols-1 md:grid-cols-[180px,1fr] gap-3 mb-3">
                                            <select
                                                value={editDraft.rating}
                                                onChange={(event) =>
                                                    setEditDraft((prev) =>
                                                        prev
                                                            ? {
                                                                  ...prev,
                                                                  rating: Number(
                                                                      event.target.value
                                                                  ),
                                                              }
                                                            : prev
                                                    )
                                                }
                                                className="bg-cream-100 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-inter text-dark"
                                            >
                                                <option value={5}>5 - Excellent</option>
                                                <option value={4}>4 - Good</option>
                                                <option value={3}>3 - Average</option>
                                                <option value={2}>2 - Poor</option>
                                                <option value={1}>1 - Bad</option>
                                            </select>
                                            <textarea
                                                value={editDraft.comment}
                                                onChange={(event) =>
                                                    setEditDraft((prev) =>
                                                        prev
                                                            ? {
                                                                  ...prev,
                                                                  comment: event.target.value,
                                                              }
                                                            : prev
                                                    )
                                                }
                                                rows={4}
                                                className="w-full bg-cream-100 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-inter text-dark"
                                            />
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <button
                                                onClick={() => handleSaveEdit(item.id)}
                                                disabled={savingId === item.id}
                                                className="btn-primary !py-2 !px-4 text-sm"
                                            >
                                                {savingId === item.id ? (
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <Save className="w-4 h-4" />
                                                )}
                                                Save
                                            </button>
                                            <button
                                                onClick={cancelEdit}
                                                className="btn-secondary !py-2 !px-4 text-sm"
                                            >
                                                <X className="w-4 h-4" />
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                ) : null}

                                <div className="flex flex-wrap items-center gap-2">
                                    <button
                                        onClick={() => beginEdit(item)}
                                        className="btn-secondary !py-2 !px-4 text-sm"
                                    >
                                        <PencilLine className="w-4 h-4" />
                                        Edit
                                    </button>
                                    <button
                                        onClick={() => handleDelete(item)}
                                        disabled={deletingId === item.id}
                                        className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-inter font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60 disabled:cursor-not-allowed"
                                    >
                                        {deletingId === item.id ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Trash2 className="w-4 h-4" />
                                        )}
                                        Delete
                                    </button>
                                </div>
                            </div>
                        ))}

                        {!feedback.length && (
                            <div className="bg-white rounded-2xl shadow-soft p-10 text-center">
                                <MessageSquare className="w-10 h-10 mx-auto text-dark-muted mb-3" />
                                <p className="text-body text-dark-muted">
                                    No feedback records found.
                                </p>
                            </div>
                        )}
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
