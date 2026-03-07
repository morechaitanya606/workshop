"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Star, Upload, Video, X, CheckCircle2, Ticket, History, MessageSquare, Settings, LayoutDashboard } from "lucide-react";
import Navbar from "@/components/Navbar";
import MobileNav from "@/components/MobileNav";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

type BookingItem = {
    id: string;
    guests: number;
    total: number;
    created_at: string;
    workshop?: {
        id: string;
        title: string;
        date: string;
        time: string;
        location: string;
        city: string;
    };
};

type FeedbackDraft = {
    rating: number;
    comment: string;
    photos: string[];
    videoUrl: string;
};

type SavedFeedback = {
    rating: number;
    comment: string;
    photos: string[];
    videoUrl: string;
    submittedAt: string;
};

const defaultDraft: FeedbackDraft = {
    rating: 5,
    comment: "",
    photos: [],
    videoUrl: "",
};

export default function ProfilePage() {
    const router = useRouter();
    const { user, session, loading, signOut, role } = useAuth();

    const [tab, setTab] = useState<"tickets" | "history" | "past" | "settings" | "admin">("tickets");
    const [bookings, setBookings] = useState<BookingItem[]>([]);
    const [fetching, setFetching] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [openFeedbackId, setOpenFeedbackId] = useState<string | null>(null);
    const [drafts, setDrafts] = useState<Record<string, FeedbackDraft>>({});
    const [records, setRecords] = useState<Record<string, SavedFeedback>>({});
    const [feedbackErrors, setFeedbackErrors] = useState<Record<string, string>>({});
    const [savingFeedback, setSavingFeedback] = useState(false);
    const [uploading, setUploading] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!loading && !user) {
            router.push(`/auth/login?redirect=${encodeURIComponent("/profile")}`);
        }
    }, [loading, user, router]);

    useEffect(() => {
        let cancelled = false;
        const loadBookings = async () => {
            if (!user || !session?.access_token) return;
            setFetching(true);
            setError(null);
            try {
                const response = await fetch("/api/bookings", {
                    headers: { Authorization: `Bearer ${session.access_token}` },
                    cache: "no-store",
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || "Failed to load bookings.");
                if (!cancelled) setBookings((result.data || []) as BookingItem[]);
            } catch (e) {
                if (!cancelled) setError(e instanceof Error ? e.message : "Unable to load bookings.");
            } finally {
                if (!cancelled) setFetching(false);
            }
        };
        loadBookings();
        return () => {
            cancelled = true;
        };
    }, [user, session]);

    // Fetch existing feedback for past events
    useEffect(() => {
        let active = true;
        const fetchFeedback = async () => {
            if (!user || !session?.access_token) return;

            const today = new Date().toISOString().slice(0, 10);
            const pastWorkshops = bookings
                .filter(b => b.workshop?.date && b.workshop.date < today && b.workshop?.id)
                .map(b => ({ bookingId: b.id, workshopId: b.workshop!.id }));

            if (pastWorkshops.length === 0) return;

            const newRecords: Record<string, SavedFeedback> = {};

            await Promise.all(pastWorkshops.map(async ({ bookingId, workshopId }) => {
                try {
                    const res = await fetch(`/api/workshops/${workshopId}/feedback`, {
                        headers: { Authorization: `Bearer ${session.access_token}` },
                    });
                    const data = await res.json();
                    if (res.ok && data.feedback) {
                        newRecords[bookingId] = {
                            rating: data.feedback.rating || 5,
                            comment: data.feedback.comment || "",
                            photos: data.feedback.photos || [],
                            videoUrl: data.feedback.video_url || "",
                            submittedAt: data.feedback.updated_at,
                        };
                    }
                } catch (e) {
                    console.error("Failed to fetch feedback for workshop", workshopId, e);
                }
            }));

            if (active) {
                setRecords(prev => ({ ...prev, ...newRecords }));
            }
        };

        if (bookings.length > 0) {
            fetchFeedback();
        }

        return () => { active = false };
    }, [bookings, user, session]);

    const today = new Date().toISOString().slice(0, 10);
    const tickets = useMemo(
        () => bookings.filter((b) => b.workshop?.date && b.workshop.date >= today),
        [bookings, today]
    );
    const history = useMemo(
        () => [...bookings].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
        [bookings]
    );
    const pastEvents = useMemo(() => {
        return bookings
            .filter((b) => b.workshop?.date && b.workshop.date < today)
            .sort((a, b) => (b.workshop?.date || "").localeCompare(a.workshop?.date || ""));
    }, [bookings, today]);

    const activeList = tab === "tickets" ? tickets : tab === "history" ? history : tab === "past" ? pastEvents : [];

    const getDraft = (id: string) => drafts[id] || defaultDraft;
    const updateDraft = (id: string, patch: Partial<FeedbackDraft>) => {
        setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] || defaultDraft), ...patch } }));
    };

    const handleFileUpload = async (bookingId: string, event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !session?.access_token) return;

        setUploading(true);
        const formData = new FormData();
        formData.append("file", file);

        try {
            const res = await fetch("/api/upload", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${session.access_token}`,
                },
                body: formData,
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Upload failed");

            const currentDraft = getDraft(bookingId);
            updateDraft(bookingId, { photos: [...currentDraft.photos, data.url] });
        } catch (e) {
            setFeedbackErrors(prev => ({ ...prev, [bookingId]: e instanceof Error ? e.message : "Upload failed" }));
        } finally {
            setUploading(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }
    };

    const removePhoto = (bookingId: string, index: number) => {
        const currentDraft = getDraft(bookingId);
        const newPhotos = [...currentDraft.photos];
        newPhotos.splice(index, 1);
        updateDraft(bookingId, { photos: newPhotos });
    };

    const openEditor = (id: string) => {
        const existing = records[id];
        if (existing) {
            setDrafts((prev) => ({
                ...prev,
                [id]: {
                    rating: existing.rating,
                    comment: existing.comment,
                    photos: [...existing.photos],
                    videoUrl: existing.videoUrl,
                },
            }));
        }
        setOpenFeedbackId(id);
    };

    const saveFeedback = async (id: string, workshopId?: string) => {
        if (!workshopId || !session?.access_token) return;

        const d = getDraft(id);
        if (!d.comment.trim()) {
            setFeedbackErrors((prev) => ({ ...prev, [id]: "Please add a feedback comment." }));
            return;
        }

        setSavingFeedback(true);
        try {
            const res = await fetch(`/api/workshops/${workshopId}/feedback`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                    rating: d.rating,
                    comment: d.comment.trim(),
                    photos: d.photos,
                    videoUrl: d.videoUrl.trim() || undefined,
                }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to save feedback");

            setRecords((prev) => ({
                ...prev,
                [id]: {
                    rating: d.rating,
                    comment: d.comment.trim(),
                    photos: [...d.photos],
                    videoUrl: d.videoUrl.trim(),
                    submittedAt: new Date().toISOString(),
                },
            }));
            setFeedbackErrors((prev) => ({ ...prev, [id]: "" }));
            setOpenFeedbackId(null);
        } catch (e) {
            setFeedbackErrors((prev) => ({ ...prev, [id]: e instanceof Error ? e.message : "Failed to save." }));
        } finally {
            setSavingFeedback(false);
        }
    };

    const handleSignOut = async () => {
        await signOut();
        router.push("/");
    };

    if (loading || !user) {
        return (
            <main className="min-h-screen flex items-center justify-center bg-cream">
                <Loader2 className="w-10 h-10 animate-spin text-terracotta" />
            </main>
        );
    }

    const tabs = [
        { id: "tickets", label: "My Tickets", icon: Ticket },
        { id: "history", label: "Purchase History", icon: History },
        { id: "past", label: "Past Events", icon: MessageSquare },
        { id: "settings", label: "Settings", icon: Settings },
    ] as const;

    return (
        <main className="min-h-screen bg-cream pb-24 md:pb-12 text-forest">
            <Navbar />

            <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-28 pb-10">
                <header className="mb-10 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                    <div>
                        <h1 className="text-3xl md:text-4xl font-display font-medium text-forest mb-2">My Profile</h1>
                        <p className="text-dark-muted">{user.email}</p>
                    </div>
                    <button
                        onClick={handleSignOut}
                        className="px-5 py-2.5 rounded-full text-sm font-medium border border-forest/10 hover:bg-forest hover:text-white bg-white transition-colors"
                    >
                        Sign Out
                    </button>
                </header>

                <div className="flex flex-col md:flex-row gap-8">
                    {/* Navigation Sidebar */}
                    <aside className="w-full md:w-64 shrink-0">
                        <nav className="flex md:flex-col gap-2 overflow-x-auto pb-4 md:pb-0 scrollbar-hide">
                            {tabs.map((t) => {
                                const Icon = t.icon;
                                const isActive = tab === t.id;
                                return (
                                    <button
                                        key={t.id}
                                        onClick={() => setTab(t.id)}
                                        className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium whitespace-nowrap transition-all duration-200 ${isActive
                                            ? "bg-forest text-sand shadow-md scale-[1.02]"
                                            : "bg-white/50 text-forest hover:bg-white hover:shadow-sm"
                                            }`}
                                    >
                                        <Icon className={`w-4 h-4 ${isActive ? "text-terracotta" : "text-forest/60"}`} />
                                        {t.label}
                                    </button>
                                )
                            })}
                        </nav>
                    </aside>

                    {/* Main Content Area */}
                    <div className="flex-1 min-w-0">
                        {error && (
                            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 rounded-xl px-5 py-4 text-sm flex items-center gap-3">
                                <X className="w-5 h-5 shrink-0" />
                                {error}
                            </div>
                        )}

                        {fetching ? (
                            <div className="flex flex-col items-center justify-center py-20 text-forest/60">
                                <Loader2 className="w-8 h-8 animate-spin mb-4 text-terracotta" />
                                <p>Loading your profile data...</p>
                            </div>
                        ) : tab === "settings" ? (
                            <div className="bg-white rounded-2xl p-8 shadow-soft border border-forest/5">
                                <h2 className="text-xl font-display font-medium mb-6">Account Settings</h2>
                                <div className="space-y-6">
                                    <div>
                                        <label className="block text-sm font-medium text-forest/70 mb-2">Email Address</label>
                                        <input
                                            type="text"
                                            disabled
                                            value={user.email || ""}
                                            className="w-full max-w-md bg-cream-50 border border-forest/10 rounded-xl px-4 py-3 text-forest cursor-not-allowed"
                                        />
                                        <p className="text-xs text-forest/50 mt-2">Your email address is managed by your authentication provider.</p>
                                    </div>
                                </div>
                            </div>
                        ) : activeList.length === 0 ? (
                            <div className="bg-white rounded-2xl p-12 text-center shadow-soft border border-forest/5">
                                <div className="w-16 h-16 bg-cream rounded-full flex items-center justify-center mx-auto mb-6 text-terracotta">
                                    {tab === "tickets" ? <Ticket className="w-8 h-8" /> : tab === "history" ? <History className="w-8 h-8" /> : <MessageSquare className="w-8 h-8" />}
                                </div>
                                <h3 className="text-lg font-medium mb-2">No {tab === "tickets" ? "upcoming tickets" : tab === "history" ? "booking history" : "past events"}</h3>
                                <p className="text-forest/60 mb-8 max-w-md mx-auto">
                                    When you book workshops, they will appear here. Find your next creative experience!
                                </p>
                                <button onClick={() => router.push("/explore")} className="btn-primary">
                                    Explore Workshops
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {activeList.map((b) => {
                                    const saved = records[b.id];
                                    const isOpen = openFeedbackId === b.id;
                                    const d = getDraft(b.id);

                                    return (
                                        <div key={b.id} className="bg-white rounded-2xl p-6 md:p-8 shadow-soft border border-forest/5">
                                            <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                                                <div className="flex-1">
                                                    <div className="flex flex-wrap items-center gap-3 mb-3">
                                                        <span className="px-3 py-1 bg-cream rounded-lg text-xs font-semibold text-terracotta tracking-wider uppercase">
                                                            Booking #{b.id.slice(0, 8)}
                                                        </span>
                                                        <span className="text-sm text-forest/50">
                                                            Made on {formatDate(b.created_at.split('T')[0])}
                                                        </span>
                                                    </div>

                                                    <h3 className="font-display font-medium text-2xl mb-4 text-forest">
                                                        {b.workshop?.title || "Workshop"}
                                                    </h3>

                                                    <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-forest/80 mb-4 max-w-2xl bg-cream-50 p-4 rounded-xl">
                                                        <div className="flex-1 min-w-[140px]">
                                                            <span className="block text-xs uppercase text-forest/50 font-semibold tracking-wider mb-1">Date & Time</span>
                                                            <div className="font-medium">{b.workshop?.date ? formatDate(b.workshop.date) : "TBA"}</div>
                                                            <div>{b.workshop?.time || "--:--"}</div>
                                                        </div>
                                                        <div className="flex-1 min-w-[140px]">
                                                            <span className="block text-xs uppercase text-forest/50 font-semibold tracking-wider mb-1">Location</span>
                                                            <div className="font-medium">{b.workshop?.location || "Location"}</div>
                                                            <div>{b.workshop?.city || ""}</div>
                                                        </div>
                                                        <div className="flex-1 min-w-[100px]">
                                                            <span className="block text-xs uppercase text-forest/50 font-semibold tracking-wider mb-1">Guests</span>
                                                            <div className="font-medium">{b.guests}</div>
                                                        </div>
                                                        <div className="flex-1 min-w-[100px]">
                                                            <span className="block text-xs uppercase text-forest/50 font-semibold tracking-wider mb-1">Amount</span>
                                                            <div className="font-medium">{formatCurrency(b.total)}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {tab === "past" && (
                                                <div className="mt-8 pt-6 border-t border-forest/10">
                                                    {saved && !isOpen && (
                                                        <div className="bg-cream-100/50 rounded-xl p-6 relative overflow-hidden border border-cream-200">
                                                            <div className="flex items-center justify-between mb-4 relative z-10">
                                                                <h4 className="font-medium text-forest text-lg flex items-center gap-2">
                                                                    Your Review
                                                                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                                                </h4>
                                                                <div className="flex items-center gap-1 bg-white px-3 py-1.5 rounded-full shadow-sm">
                                                                    {[1, 2, 3, 4, 5].map((s) => (
                                                                        <Star key={s} className={`w-3.5 h-3.5 ${saved.rating >= s ? "text-amber-400 fill-amber-400" : "text-forest/20"}`} />
                                                                    ))}
                                                                    <span className="ml-2 text-xs font-semibold text-forest/80">{saved.rating}.0</span>
                                                                </div>
                                                            </div>

                                                            <p className="text-forest/80 mb-5 relative z-10 leading-relaxed text-sm">&quot;{saved.comment}&quot;</p>

                                                            {saved.photos && saved.photos.length > 0 && (
                                                                <div className="flex gap-3 mb-5 overflow-x-auto pb-2 relative z-10 scrollbar-hide">
                                                                    {saved.photos.map((url, i) => (
                                                                        <div key={i} className="relative w-24 h-24 rounded-xl overflow-hidden shrink-0 border border-forest/10 shadow-sm">
                                                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                            <img src={url} alt={`Feedback ${i}`} className="object-cover w-full h-full hover:scale-105 transition-transform" />
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}

                                                            <div className="flex items-center justify-between relative z-10 mt-2">
                                                                {saved.videoUrl ? (
                                                                    <a href={saved.videoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-medium text-terracotta hover:underline bg-terracotta/5 px-3 py-1.5 rounded-lg">
                                                                        <Video className="w-4 h-4" />
                                                                        Watch attached video
                                                                    </a>
                                                                ) : <div />}

                                                                <button onClick={() => openEditor(b.id)} className="text-sm font-medium text-forest/60 hover:text-terracotta hover:bg-terracotta/5 px-4 py-2 rounded-lg transition-colors">
                                                                    Edit Review
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {!saved && !isOpen && (
                                                        <div className="flex flex-col items-center justify-center p-10 border border-dashed border-forest/20 rounded-2xl bg-cream-50 overflow-hidden relative group cursor-pointer transition-colors hover:border-terracotta hover:bg-terracotta/5" onClick={() => openEditor(b.id)}>
                                                            <div className="absolute inset-0 bg-gradient-to-t from-cream/50 to-transparent pointer-events-none" />
                                                            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mb-4 group-hover:scale-110 transition-transform duration-300 relative z-10">
                                                                <MessageSquare className="w-7 h-7 text-terracotta" />
                                                            </div>
                                                            <p className="text-forest/70 mb-5 max-w-sm text-center font-medium relative z-10">We&apos;d love to hear about your experience! Share your thoughts and photos with the host.</p>
                                                            <button className="btn-primary font-medium shadow-sm relative z-10 pointer-events-none">
                                                                Rate Experience
                                                            </button>
                                                        </div>
                                                    )}

                                                    {isOpen && (
                                                        <div className="bg-white border border-forest/10 rounded-2xl p-6 md:p-8 shadow-md">
                                                            <h4 className="font-display text-2xl font-medium mb-1">Write your review</h4>
                                                            <p className="text-forest/60 text-sm mb-8">Share your experience to help future attendees and support the host.</p>

                                                            <div className="space-y-8">
                                                                {/* Rating */}
                                                                <div className="bg-cream-50 rounded-xl p-6 border border-forest/5 flex flex-col items-center">
                                                                    <label className="block text-sm font-semibold uppercase tracking-wider text-forest/50 mb-4">Overall Rating</label>
                                                                    <div className="flex items-center gap-3">
                                                                        {[1, 2, 3, 4, 5].map((s) => (
                                                                            <button
                                                                                key={`${b.id}-${s}`}
                                                                                type="button"
                                                                                onClick={() => updateDraft(b.id, { rating: s })}
                                                                                className="transform hover:scale-110 transition-transform focus:outline-none p-1"
                                                                            >
                                                                                <Star className={`w-10 h-10 ${d.rating >= s ? "text-amber-400 fill-amber-400 drop-shadow-sm" : "text-forest/10"}`} />
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                </div>

                                                                {/* Comment */}
                                                                <div>
                                                                    <label className="block text-sm font-medium text-forest mb-2">Detailed Thoughts <span className="text-red-500">*</span></label>
                                                                    <textarea
                                                                        value={d.comment}
                                                                        onChange={(e) => updateDraft(b.id, { comment: e.target.value })}
                                                                        rows={4}
                                                                        placeholder="What did you enjoy the most? How was the host?"
                                                                        className="w-full bg-cream-50 border border-forest/10 rounded-xl px-5 py-4 text-forest focus:ring-2 focus:ring-terracotta/20 focus:border-terracotta transition-all resize-none shadow-inner"
                                                                    />
                                                                </div>

                                                                {/* Media */}
                                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 border-t border-forest/5">
                                                                    <div>
                                                                        <label className="block text-sm font-medium text-forest mb-3 flex items-center gap-2">
                                                                            <Upload className="w-4 h-4 text-terracotta" /> Photos
                                                                        </label>

                                                                        <div className="grid grid-cols-3 gap-3">
                                                                            {d.photos.map((photo, i) => (
                                                                                <div key={i} className="relative aspect-square rounded-xl overflow-hidden group border border-forest/10 shadow-sm">
                                                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                                    <img src={photo} alt="" className="object-cover w-full h-full" />
                                                                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                                                        <button
                                                                                            onClick={() => removePhoto(b.id, i)}
                                                                                            className="w-8 h-8 bg-white/20 hover:bg-red-500 rounded-full flex items-center justify-center transition-colors backdrop-blur-sm"
                                                                                        >
                                                                                            <X className="w-4 h-4 text-white" />
                                                                                        </button>
                                                                                    </div>
                                                                                </div>
                                                                            ))}
                                                                            {d.photos.length < 5 && (
                                                                                <label className="aspect-square flex flex-col items-center justify-center border-2 border-dashed border-forest/20 rounded-xl text-forest/50 hover:text-terracotta hover:border-terracotta hover:bg-terracotta/5 transition-all cursor-pointer bg-cream-50 group">
                                                                                    {uploading ? <Loader2 className="w-6 h-6 animate-spin mb-2" /> : <Upload className="w-6 h-6 mb-2 group-hover:-translate-y-1 transition-transform" />}
                                                                                    <span className="text-xs font-medium">Add Photo</span>
                                                                                    <input
                                                                                        type="file"
                                                                                        accept="image/*"
                                                                                        className="hidden"
                                                                                        ref={fileInputRef}
                                                                                        onChange={(e) => handleFileUpload(b.id, e)}
                                                                                        disabled={uploading}
                                                                                    />
                                                                                </label>
                                                                            )}
                                                                        </div>
                                                                        <p className="text-xs text-forest/40 mt-3 font-medium uppercase tracking-wide">Up to 5 photos (max 5MB each)</p>
                                                                    </div>

                                                                    <div>
                                                                        <label className="block text-sm font-medium text-forest mb-3 flex items-center gap-2">
                                                                            <Video className="w-4 h-4 text-terracotta" /> Video Link
                                                                        </label>
                                                                        <input
                                                                            type="url"
                                                                            value={d.videoUrl}
                                                                            onChange={(e) => updateDraft(b.id, { videoUrl: e.target.value })}
                                                                            placeholder="YouTube or Instagram Reel URL"
                                                                            className="w-full bg-cream-50 border border-forest/10 rounded-xl px-4 py-3.5 text-sm focus:ring-2 focus:ring-terracotta/20 focus:border-terracotta transition-shadow shadow-inner"
                                                                        />
                                                                    </div>
                                                                </div>

                                                                {feedbackErrors[b.id] && (
                                                                    <div className="bg-red-50 text-red-700 text-sm px-5 py-4 rounded-xl border border-red-100 flex items-center gap-3">
                                                                        <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center shrink-0">
                                                                            <X className="w-4 h-4 text-red-500" />
                                                                        </div>
                                                                        <div className="font-medium">{feedbackErrors[b.id]}</div>
                                                                    </div>
                                                                )}

                                                                <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-forest/10">
                                                                    <button
                                                                        onClick={() => saveFeedback(b.id, b.workshop?.id)}
                                                                        disabled={savingFeedback}
                                                                        className="btn-primary !py-3.5 flex-1 sm:flex-none flex justify-center items-center gap-2 shadow-md hover:shadow-lg"
                                                                    >
                                                                        {savingFeedback && <Loader2 className="w-5 h-5 animate-spin" />}
                                                                        Publish Review
                                                                    </button>
                                                                    <button
                                                                        onClick={() => setOpenFeedbackId(null)}
                                                                        disabled={savingFeedback}
                                                                        className="px-6 py-3.5 rounded-full font-medium border border-forest/10 text-forest/70 hover:text-forest hover:bg-forest/5 flex-1 sm:flex-none transition-all pulse-hover"
                                                                    >
                                                                        Discard changes
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
            <MobileNav />
        </main>
    );
}
