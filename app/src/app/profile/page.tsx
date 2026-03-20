"use client";

import { useEffect, useMemo, useState, useRef, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import * as Sentry from "@sentry/nextjs";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
    Loader2,
    Star,
    Upload,
    Video,
    X,
    CheckCircle2,
    Ticket,
    History,
    MessageSquare,
    Settings,
    Heart,
    HeartOff,
    Banknote,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import MobileNav from "@/components/MobileNav";
import { formatCurrency, formatDate, getInitials } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import {
    getFavorites,
    removeFavorite,
    getWorkshopById,
    getMyBookings,
    getWorkshopFeedback,
    submitWorkshopFeedback,
    toApiErrorMessage,
    uploadMedia,
    getProfile,
    updateProfile,
    getHostLedger,
    type HostLedgerResponse,
} from "@/lib/api-client";
import type { Workshop } from "@/lib/data";

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
const MIN_REVIEW_LENGTH = 10;

export default function ProfilePage() {
    const router = useRouter();
    const { user, session, loading, signOut, role } = useAuth();
    const prefersReducedMotion = useReducedMotion();

    const [tab, setTab] = useState<
        "tickets" | "history" | "past" | "wishlist" | "settings" | "earnings"
    >("tickets");
    const [bookings, setBookings] = useState<BookingItem[]>([]);
    const [favoriteWorkshops, setFavoriteWorkshops] = useState<Workshop[]>([]);
    const [ledger, setLedger] = useState<HostLedgerResponse | null>(null);
    const [fetching, setFetching] = useState(false);
    const [loadingFavorites, setLoadingFavorites] = useState(false);
    const [loadingLedger, setLoadingLedger] = useState(false);
    const [removingFavoriteId, setRemovingFavoriteId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [reloadKey, setReloadKey] = useState(0);

    const [openFeedbackId, setOpenFeedbackId] = useState<string | null>(null);
    const [drafts, setDrafts] = useState<Record<string, FeedbackDraft>>({});
    const [records, setRecords] = useState<Record<string, SavedFeedback>>({});
    const [feedbackErrors, setFeedbackErrors] = useState<Record<string, string>>({});
    const [savingFeedback, setSavingFeedback] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [profileName, setProfileName] = useState("");
    const [profileAvatar, setProfileAvatar] = useState<string | null>(null);
    const [profileDob, setProfileDob] = useState("");
    const [profilePhone, setProfilePhone] = useState("");
    const [profileLoading, setProfileLoading] = useState(false);
    const [profileSaving, setProfileSaving] = useState(false);
    const [profileMessage, setProfileMessage] = useState<string | null>(null);
    const [profileError, setProfileError] = useState<string | null>(null);
    const [avatarUploading, setAvatarUploading] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const feedbackDialogContainerRef = useRef<HTMLDivElement>(null);
    const avatarInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!loading && !user) {
            router.push(`/auth/login?redirect=${encodeURIComponent("/profile")}`);
        }
    }, [loading, user, router]);

    useEffect(() => {
        if (!session?.access_token) return;
        let active = true;
        setProfileLoading(true);
        setProfileError(null);
        getProfile(session.access_token)
            .then((result) => {
                if (!active) return;
                const fallbackName = String(user?.user_metadata?.full_name || "").trim();
                setProfileName(result.profile.fullName || fallbackName);
                setProfileAvatar(result.profile.avatarUrl || null);
                setProfileDob(result.profile.dateOfBirth || "");
                setProfilePhone(result.profile.phoneNumber || "");
            })
            .catch((error) => {
                if (!active) return;
                const fallbackName = String(user?.user_metadata?.full_name || "").trim();
                setProfileName((prev) => prev || fallbackName);
                setProfileError(toApiErrorMessage(error, "Unable to load profile settings."));
            })
            .finally(() => {
                if (active) setProfileLoading(false);
            });

        return () => {
            active = false;
        };
    }, [session?.access_token, user?.user_metadata?.full_name]);

    useEffect(() => {
        if (!openFeedbackId) {
            return;
        }

        const focusTimer = window.setTimeout(() => {
            feedbackDialogContainerRef.current?.focus();
        }, 0);

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setOpenFeedbackId(null);
            }
        };

        window.addEventListener("keydown", handleEscape);

        return () => {
            window.clearTimeout(focusTimer);
            window.removeEventListener("keydown", handleEscape);
        };
    }, [openFeedbackId]);

    useEffect(() => {
        let cancelled = false;
        const loadBookings = async () => {
            if (!user || !session?.access_token) return;
            setFetching(true);
            setError(null);
            try {
                const result = await getMyBookings(session.access_token);
                if (!cancelled) setBookings((result.data || []) as BookingItem[]);
            } catch (e) {
                if (!cancelled) {
                    setError(toApiErrorMessage(e, "Unable to load bookings."));
                }
            } finally {
                if (!cancelled) setFetching(false);
            }
        };
        loadBookings();
        return () => {
            cancelled = true;
        };
    }, [user, session, reloadKey]);

    // Fetch existing feedback for past events
    useEffect(() => {
        let active = true;
        const fetchFeedback = async () => {
            if (!user || !session?.access_token) return;

            const today = new Date().toISOString().slice(0, 10);
            const pastWorkshops = bookings
                .filter((b) => b.workshop?.date && b.workshop.date < today && b.workshop?.id)
                .map((b) => ({ bookingId: b.id, workshopId: b.workshop!.id }));

            if (pastWorkshops.length === 0) return;

            const newRecords: Record<string, SavedFeedback> = {};

            await Promise.all(
                pastWorkshops.map(async ({ bookingId, workshopId }) => {
                    try {
                        const data = await getWorkshopFeedback(workshopId, session.access_token);
                        if (data.feedback) {
                            newRecords[bookingId] = {
                                rating: data.feedback.rating || 5,
                                comment: data.feedback.comment || "",
                                photos: data.feedback.photos || [],
                                videoUrl: data.feedback.video_url || "",
                                submittedAt: data.feedback.updated_at,
                            };
                        }
                    } catch (e) {
                        Sentry.captureException(e, {
                            tags: {
                                layer: "profile",
                                action: "load_feedback",
                            },
                            extra: {
                                workshopId,
                            },
                        });
                    }
                })
            );

            if (active) {
                setRecords((prev) => ({ ...prev, ...newRecords }));
            }
        };

        if (bookings.length > 0) {
            fetchFeedback();
        }

        return () => {
            active = false;
        };
    }, [bookings, user, session]);

    useEffect(() => {
        let active = true;
        const loadFavorites = async () => {
            if (!session?.access_token) return;
            setLoadingFavorites(true);
            try {
                const favorites = await getFavorites(session.access_token);
                const ids = favorites.favorites || [];
                if (!ids.length) {
                    if (active) setFavoriteWorkshops([]);
                    return;
                }

                const workshopResults = await Promise.all(
                    ids.map(async (workshopId) => {
                        try {
                            const result = await getWorkshopById(workshopId);
                            return result.workshop || null;
                        } catch {
                            return null;
                        }
                    })
                );

                if (active) {
                    setFavoriteWorkshops(
                        workshopResults.filter((item): item is Workshop => Boolean(item))
                    );
                }
            } catch (e) {
                if (active) {
                    setError(toApiErrorMessage(e, "Unable to load wishlist right now."));
                }
            } finally {
                if (active) {
                    setLoadingFavorites(false);
                }
            }
        };

        void loadFavorites();
        return () => {
            active = false;
        };
    }, [session?.access_token, reloadKey]);

    useEffect(() => {
        let active = true;
        const loadLedger = async () => {
            if (role !== "host" || !session?.access_token) return;
            setLoadingLedger(true);
            try {
                const result = await getHostLedger(session.access_token);
                if (active) setLedger(result);
            } catch (e) {
                if (active) setError(toApiErrorMessage(e, "Unable to load earnings."));
            } finally {
                if (active) setLoadingLedger(false);
            }
        };

        if (tab === "earnings") {
            loadLedger();
        }
        return () => {
            active = false;
        };
    }, [role, session?.access_token, tab, reloadKey]);

    const today = new Date().toISOString().slice(0, 10);
    const tickets = useMemo(
        () => bookings.filter((b) => b.workshop?.date && b.workshop.date >= today),
        [bookings, today]
    );
    const history = useMemo(
        () =>
            [...bookings].sort(
                (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            ),
        [bookings]
    );
    const pastEvents = useMemo(() => {
        return bookings
            .filter((b) => b.workshop?.date && b.workshop.date < today)
            .sort((a, b) => (b.workshop?.date || "").localeCompare(a.workshop?.date || ""));
    }, [bookings, today]);

    const activeList =
        tab === "tickets"
            ? tickets
            : tab === "history"
              ? history
              : tab === "past"
                ? pastEvents
                : [];

    const getDraft = (id: string) => drafts[id] || defaultDraft;
    const updateDraft = (id: string, patch: Partial<FeedbackDraft>) => {
        setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] || defaultDraft), ...patch } }));
    };

    const handleFileUpload = async (
        bookingId: string,
        event: React.ChangeEvent<HTMLInputElement>
    ) => {
        const file = event.target.files?.[0];
        if (!file || !session?.access_token) return;

        setUploading(true);

        try {
            const data = await uploadMedia(session.access_token, file);

            const currentDraft = getDraft(bookingId);
            updateDraft(bookingId, { photos: [...currentDraft.photos, data.url] });
        } catch (e) {
            setFeedbackErrors((prev) => ({
                ...prev,
                [bookingId]: toApiErrorMessage(e, "Upload failed"),
            }));
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

    const handleAvatarUpload = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file || !session?.access_token) return;

        setAvatarUploading(true);
        setProfileError(null);
        try {
            const data = await uploadMedia(session.access_token, file);
            setProfileAvatar(data.url);
        } catch (error) {
            setProfileError(toApiErrorMessage(error, "Unable to upload profile photo."));
        } finally {
            setAvatarUploading(false);
        }
    };

    const handleRemoveAvatar = () => {
        setProfileAvatar(null);
    };

    const handleSaveProfile = async () => {
        if (!session?.access_token) return;
        const trimmedName = profileName.trim();
        const trimmedDob = profileDob.trim();
        const trimmedPhone = profilePhone.trim();
        if (trimmedName.length < 2) {
            setProfileError("Please enter a username with at least 2 characters.");
            return;
        }
        if (trimmedPhone && trimmedPhone.length < 10) {
            setProfileError("Please enter a valid phone number with at least 10 digits.");
            return;
        }

        setProfileSaving(true);
        setProfileError(null);
        setProfileMessage(null);
        try {
            const result = await updateProfile(session.access_token, {
                fullName: trimmedName,
                avatarUrl: profileAvatar || "",
                dateOfBirth: trimmedDob,
                phoneNumber: trimmedPhone,
            });
            setProfileName(result.profile.fullName || trimmedName);
            setProfileAvatar(result.profile.avatarUrl || profileAvatar || null);
            setProfileDob(result.profile.dateOfBirth || trimmedDob);
            setProfilePhone(result.profile.phoneNumber || trimmedPhone);
            setProfileMessage("Profile updated.");
            if (isSupabaseConfigured) {
                await supabase.auth.updateUser({
                    data: {
                        full_name: trimmedName,
                        avatar_url: profileAvatar || null,
                        date_of_birth: trimmedDob || null,
                        phone_number: trimmedPhone || null,
                    },
                });
            }
        } catch (error) {
            setProfileError(toApiErrorMessage(error, "Unable to update profile settings."));
        } finally {
            setProfileSaving(false);
        }
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
        const trimmedComment = d.comment.trim();
        if (trimmedComment.length < MIN_REVIEW_LENGTH) {
            setFeedbackErrors((prev) => ({
                ...prev,
                [id]: `Please add at least ${MIN_REVIEW_LENGTH} characters.`,
            }));
            return;
        }

        setSavingFeedback(true);
        try {
            await submitWorkshopFeedback(workshopId, session.access_token, {
                rating: d.rating,
                comment: trimmedComment,
                photos: d.photos,
                videoUrl: d.videoUrl.trim() || undefined,
            });

            setRecords((prev) => ({
                ...prev,
                [id]: {
                    rating: d.rating,
                    comment: trimmedComment,
                    photos: [...d.photos],
                    videoUrl: d.videoUrl.trim(),
                    submittedAt: new Date().toISOString(),
                },
            }));
            setFeedbackErrors((prev) => ({ ...prev, [id]: "" }));
            setOpenFeedbackId(null);
        } catch (e) {
            setFeedbackErrors((prev) => ({
                ...prev,
                [id]: toApiErrorMessage(e, "Failed to save."),
            }));
        } finally {
            setSavingFeedback(false);
        }
    };

    const handleSignOut = async () => {
        await signOut();
        router.push("/");
    };

    const handleRetry = () => {
        setError(null);
        setReloadKey((prev) => prev + 1);
    };

    const handleUnsaveWorkshop = async (workshopId: string) => {
        if (!session?.access_token) return;

        setRemovingFavoriteId(workshopId);
        setError(null);
        try {
            await removeFavorite(session.access_token, workshopId);
            setFavoriteWorkshops((prev) => prev.filter((item) => item.id !== workshopId));
        } catch (e) {
            setError(toApiErrorMessage(e, "Unable to remove workshop from wishlist."));
        } finally {
            setRemovingFavoriteId(null);
        }
    };

    if (loading || !user) {
        return (
            <main className="min-h-screen flex items-center justify-center bg-cream">
                <Loader2 className="w-10 h-10 animate-spin text-terracotta" />
            </main>
        );
    }

    let tabs = [
        { id: "tickets", label: "My Tickets", icon: Ticket },
        { id: "history", label: "Purchase History", icon: History },
        { id: "past", label: "Past Events", icon: MessageSquare },
        { id: "wishlist", label: "Wishlist", icon: Heart },
    ] as Array<{
        id: "tickets" | "history" | "past" | "wishlist" | "settings" | "earnings";
        label: string;
        icon: any;
    }>;

    if (role === "host") {
        tabs.push({ id: "earnings", label: "Earnings", icon: Banknote });
    }
    tabs.push({ id: "settings", label: "Settings", icon: Settings });

    return (
        <main className="min-h-screen bg-cream pb-24 md:pb-12 text-dark">
            <Navbar />

            <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-28 pb-10">
                <header className="mb-10 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                    <div>
                        <h1 className="text-3xl md:text-4xl font-playfair font-medium text-dark mb-2">
                            My Profile
                        </h1>
                        <p className="text-dark-muted">{user.email}</p>
                    </div>
                    <button
                        onClick={handleSignOut}
                        className="px-5 py-2.5 rounded-full text-sm font-medium border border-dark/10 hover:bg-dark hover:text-white bg-white transition-colors"
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
                                        className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                                            isActive
                                                ? "bg-dark text-cream shadow-md scale-[1.02]"
                                                : "bg-white/50 text-dark hover:bg-white hover:shadow-sm"
                                        }`}
                                    >
                                        <Icon
                                            className={`w-4 h-4 ${isActive ? "text-terracotta" : "text-dark/60"}`}
                                        />
                                        {t.label}
                                    </button>
                                );
                            })}
                        </nav>
                    </aside>

                    {/* Main Content Area */}
                    <div className="flex-1 min-w-0">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={tab}
                                initial={prefersReducedMotion ? undefined : { opacity: 0, y: 8 }}
                                animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
                                exit={prefersReducedMotion ? undefined : { opacity: 0, y: -8 }}
                                transition={
                                    prefersReducedMotion
                                        ? { duration: 0 }
                                        : { duration: 0.25, ease: [0.22, 1, 0.36, 1] }
                                }
                            >
                                {error && (
                                    <div className="mb-6 bg-red-50 border border-red-200 text-red-700 rounded-xl px-5 py-4 text-sm flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                        <div className="flex items-center gap-3">
                                            <X className="w-5 h-5 shrink-0" />
                                            {error}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleRetry}
                                            className="inline-flex items-center justify-center rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                                        >
                                            Try again
                                        </button>
                                    </div>
                                )}

                                {fetching ? (
                                    <div className="flex flex-col items-center justify-center py-20 text-dark/60">
                                        <Loader2 className="w-8 h-8 animate-spin mb-4 text-terracotta" />
                                        <p>Loading your profile data...</p>
                                    </div>
                                ) : tab === "earnings" ? (
                                    <div className="space-y-6">
                                        {loadingLedger ? (
                                            <div className="flex flex-col items-center justify-center py-20 text-dark/60">
                                                <Loader2 className="w-8 h-8 animate-spin mb-4 text-terracotta" />
                                                <p>Loading your earnings...</p>
                                            </div>
                                        ) : !ledger ? (
                                            <div className="bg-white rounded-2xl p-12 text-center shadow-soft border border-dark/5">
                                                <p className="text-dark/60">
                                                    No earnings data found.
                                                </p>
                                            </div>
                                        ) : (
                                            <div className="space-y-8">
                                                <div className="bg-white rounded-2xl p-8 shadow-soft border border-dark/5">
                                                    <h2 className="text-xl font-playfair font-medium mb-6">
                                                        Earnings Overview
                                                    </h2>
                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                        <div className="p-5 rounded-xl bg-cream">
                                                            <p className="text-sm text-dark/60 font-medium mb-1">
                                                                Available to Payout
                                                            </p>
                                                            <p className="text-3xl font-playfair text-terracotta">
                                                                {formatCurrency(
                                                                    ledger.earnings
                                                                        .filter(
                                                                            (e) =>
                                                                                e.status ===
                                                                                "available"
                                                                        )
                                                                        .reduce(
                                                                            (acc, curr) =>
                                                                                acc + curr.amount,
                                                                            0
                                                                        )
                                                                )}
                                                            </p>
                                                        </div>
                                                        <div className="p-5 rounded-xl bg-cream-50">
                                                            <p className="text-sm text-dark/60 font-medium mb-1">
                                                                Pending Clearance
                                                            </p>
                                                            <p className="text-3xl font-playfair text-dark">
                                                                {formatCurrency(
                                                                    ledger.earnings
                                                                        .filter(
                                                                            (e) =>
                                                                                e.status ===
                                                                                "pending"
                                                                        )
                                                                        .reduce(
                                                                            (acc, curr) =>
                                                                                acc + curr.amount,
                                                                            0
                                                                        )
                                                                )}
                                                            </p>
                                                        </div>
                                                        <div className="p-5 rounded-xl bg-cream-50">
                                                            <p className="text-sm text-dark/60 font-medium mb-1">
                                                                Total Paid Out
                                                            </p>
                                                            <p className="text-3xl font-playfair text-dark">
                                                                {formatCurrency(
                                                                    ledger.payouts
                                                                        .filter(
                                                                            (p) =>
                                                                                p.status ===
                                                                                "completed"
                                                                        )
                                                                        .reduce(
                                                                            (acc, curr) =>
                                                                                acc + curr.amount,
                                                                            0
                                                                        )
                                                                )}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="bg-white rounded-2xl p-8 shadow-soft border border-dark/5">
                                                    <h2 className="text-xl font-playfair font-medium mb-6">
                                                        Recent Earnings
                                                    </h2>
                                                    {ledger.earnings.length === 0 ? (
                                                        <p className="text-dark/60">
                                                            No transactions yet.
                                                        </p>
                                                    ) : (
                                                        <div className="space-y-4">
                                                            {ledger.earnings
                                                                .slice(0, 10)
                                                                .map((earning) => (
                                                                    <div
                                                                        key={earning.id}
                                                                        className="flex justify-between items-center p-4 border border-dark/5 rounded-xl hover:border-dark/10 transition-colors"
                                                                    >
                                                                        <div>
                                                                            <p className="font-medium text-dark">
                                                                                {earning.booking
                                                                                    ?.workshop
                                                                                    ?.title ||
                                                                                    "Workshop Booking"}
                                                                            </p>
                                                                            <p className="text-sm text-dark/60">
                                                                                {formatDate(
                                                                                    earning.created_at.split(
                                                                                        "T"
                                                                                    )[0]
                                                                                )}{" "}
                                                                                &middot;{" "}
                                                                                {
                                                                                    earning.booking
                                                                                        ?.guests
                                                                                }{" "}
                                                                                guest
                                                                                {earning.booking
                                                                                    ?.guests !== 1
                                                                                    ? "s"
                                                                                    : ""}
                                                                            </p>
                                                                        </div>
                                                                        <div className="text-right flex flex-col items-end gap-1">
                                                                            <p className="font-semibold text-dark">
                                                                                +
                                                                                {formatCurrency(
                                                                                    earning.amount
                                                                                )}
                                                                            </p>
                                                                            <span
                                                                                className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                                                                                    earning.status ===
                                                                                    "available"
                                                                                        ? "bg-emerald-100 text-emerald-800"
                                                                                        : earning.status ===
                                                                                            "pending"
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
                                                    <h2 className="text-xl font-playfair font-medium mb-6">
                                                        Payout History
                                                    </h2>
                                                    {ledger.payouts.length === 0 ? (
                                                        <p className="text-dark/60">
                                                            No payouts yet.
                                                        </p>
                                                    ) : (
                                                        <div className="space-y-4">
                                                            {ledger.payouts.map((payout) => (
                                                                <div
                                                                    key={payout.id}
                                                                    className="flex justify-between items-center p-4 border border-dark/5 rounded-xl"
                                                                >
                                                                    <div>
                                                                        <p className="font-medium text-dark">
                                                                            Payout
                                                                        </p>
                                                                        <p className="text-sm text-dark/60">
                                                                            {formatDate(
                                                                                payout.created_at.split(
                                                                                    "T"
                                                                                )[0]
                                                                            )}{" "}
                                                                            {payout.reference_note
                                                                                ? `· ${payout.reference_note}`
                                                                                : ""}
                                                                        </p>
                                                                    </div>
                                                                    <div className="text-right flex flex-col items-end gap-1">
                                                                        <p className="font-semibold text-dark">
                                                                            {formatCurrency(
                                                                                payout.amount
                                                                            )}
                                                                        </p>
                                                                        <span
                                                                            className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                                                                                payout.status ===
                                                                                "completed"
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
                                        )}
                                    </div>
                                ) : tab === "settings" ? (
                                    <div className="bg-white rounded-2xl p-8 shadow-soft border border-dark/5">
                                        <h2 className="text-xl font-playfair font-medium mb-6">
                                            Account Settings
                                        </h2>
                                        <div className="space-y-6">
                                            <div>
                                                <label className="block text-sm font-medium text-dark/70 mb-2">
                                                    Profile Photo
                                                </label>
                                                <div className="flex flex-wrap items-center gap-4">
                                                    <div className="h-16 w-16 rounded-full bg-cream border border-clay/40 overflow-hidden flex items-center justify-center text-sm font-inter font-semibold text-dark-secondary">
                                                        {profileAvatar ? (
                                                            <Image
                                                                src={profileAvatar}
                                                                alt={profileName || "Profile"}
                                                                width={64}
                                                                height={64}
                                                                className="h-full w-full object-cover"
                                                            />
                                                        ) : (
                                                            getInitials(
                                                                profileName || user.email || "User"
                                                            )
                                                        )}
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-3">
                                                        <label className="inline-flex items-center gap-2 rounded-full border border-clay/40 px-4 py-2 text-xs font-inter font-semibold text-dark-secondary cursor-pointer hover:border-terracotta hover:text-terracotta transition-colors">
                                                            <input
                                                                type="file"
                                                                accept="image/*"
                                                                onChange={handleAvatarUpload}
                                                                ref={avatarInputRef}
                                                                className="sr-only"
                                                                disabled={
                                                                    avatarUploading ||
                                                                    profileLoading
                                                                }
                                                            />
                                                            {avatarUploading
                                                                ? "Uploading..."
                                                                : "Upload photo"}
                                                        </label>
                                                        {profileAvatar && (
                                                            <button
                                                                type="button"
                                                                onClick={handleRemoveAvatar}
                                                                className="text-xs font-inter font-semibold text-dark-muted hover:text-terracotta transition-colors"
                                                            >
                                                                Remove
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-dark/70 mb-2">
                                                    Username
                                                </label>
                                                <input
                                                    type="text"
                                                    value={profileName}
                                                    onChange={(event) =>
                                                        setProfileName(event.target.value)
                                                    }
                                                    placeholder="Enter your username"
                                                    className="w-full max-w-md bg-cream-50 border border-dark/10 rounded-xl px-4 py-3 text-dark"
                                                    disabled={profileLoading}
                                                />
                                                <p className="text-xs text-dark/50 mt-2">
                                                    This name appears on your public workshop
                                                    reviews.
                                                </p>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-dark/70 mb-2">
                                                    Date of Birth
                                                </label>
                                                <input
                                                    type="date"
                                                    value={profileDob}
                                                    onChange={(event) =>
                                                        setProfileDob(event.target.value)
                                                    }
                                                    className="w-full max-w-md bg-cream-50 border border-dark/10 rounded-xl px-4 py-3 text-dark"
                                                    disabled={profileLoading}
                                                />
                                                <p className="text-xs text-dark/50 mt-2">
                                                    We use this for age-appropriate recommendations.
                                                </p>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-dark/70 mb-2">
                                                    Phone Number
                                                </label>
                                                <input
                                                    type="tel"
                                                    value={profilePhone}
                                                    onChange={(event) =>
                                                        setProfilePhone(event.target.value)
                                                    }
                                                    placeholder="Enter your phone number"
                                                    className="w-full max-w-md bg-cream-50 border border-dark/10 rounded-xl px-4 py-3 text-dark"
                                                    disabled={profileLoading}
                                                />
                                                <p className="text-xs text-dark/50 mt-2">
                                                    We&apos;ll only use this for important updates.
                                                </p>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-dark/70 mb-2">
                                                    Email Address
                                                </label>
                                                <input
                                                    type="text"
                                                    disabled
                                                    value={user.email || ""}
                                                    className="w-full max-w-md bg-cream-50 border border-dark/10 rounded-xl px-4 py-3 text-dark cursor-not-allowed"
                                                />
                                                <p className="text-xs text-dark/50 mt-2">
                                                    Your email address is managed by your
                                                    authentication provider.
                                                </p>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-3">
                                                <button
                                                    type="button"
                                                    onClick={handleSaveProfile}
                                                    disabled={profileSaving || profileLoading}
                                                    className="btn-primary !px-6 !py-2.5 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                                                >
                                                    {profileSaving ? "Saving..." : "Save changes"}
                                                </button>
                                                {profileMessage && (
                                                    <span className="text-xs font-inter text-emerald-700">
                                                        {profileMessage}
                                                    </span>
                                                )}
                                                {profileError && (
                                                    <span className="text-xs font-inter text-red-600">
                                                        {profileError}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ) : tab === "wishlist" ? (
                                    <div className="space-y-4">
                                        {loadingFavorites ? (
                                            <div className="flex flex-col items-center justify-center py-20 text-dark/60">
                                                <Loader2 className="w-8 h-8 animate-spin mb-4 text-terracotta" />
                                                <p>Loading your wishlist...</p>
                                            </div>
                                        ) : favoriteWorkshops.length === 0 ? (
                                            <div className="bg-white rounded-2xl p-12 text-center shadow-soft border border-dark/5">
                                                <div className="w-16 h-16 bg-cream rounded-full flex items-center justify-center mx-auto mb-6 text-terracotta">
                                                    <Heart className="w-8 h-8" />
                                                </div>
                                                <h3 className="text-lg font-medium mb-2">
                                                    No saved workshops yet
                                                </h3>
                                                <p className="text-dark/60 mb-8 max-w-md mx-auto">
                                                    Save workshops from the detail page to see them
                                                    here.
                                                </p>
                                                <button
                                                    onClick={() => router.push("/explore")}
                                                    className="btn-primary"
                                                >
                                                    Explore Workshops
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {favoriteWorkshops.map((workshop) => (
                                                    <div
                                                        key={workshop.id}
                                                        className="rounded-2xl bg-white p-5 shadow-soft border border-dark/5 hover:border-terracotta/40 transition-colors"
                                                    >
                                                        <div className="mb-3 flex items-start justify-between gap-2">
                                                            <p className="text-xs font-semibold uppercase tracking-wider text-terracotta">
                                                                {workshop.category}
                                                            </p>
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    void handleUnsaveWorkshop(
                                                                        workshop.id
                                                                    )
                                                                }
                                                                disabled={
                                                                    removingFavoriteId ===
                                                                    workshop.id
                                                                }
                                                                aria-label={`Remove ${workshop.title} from wishlist`}
                                                                className="inline-flex items-center gap-1 rounded-full border border-dark/10 px-3 py-1 text-xs font-medium text-dark/70 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                                                            >
                                                                {removingFavoriteId ===
                                                                workshop.id ? (
                                                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                                ) : (
                                                                    <HeartOff className="h-3.5 w-3.5" />
                                                                )}
                                                                Unsave
                                                            </button>
                                                        </div>
                                                        <h3 className="font-playfair text-xl text-dark mb-2">
                                                            {workshop.title}
                                                        </h3>
                                                        <p className="text-sm text-dark/70 mb-2">
                                                            {workshop.location}, {workshop.city}
                                                        </p>
                                                        <p className="text-sm text-dark/70 mb-4">
                                                            {formatDate(workshop.date)} |{" "}
                                                            {workshop.time}
                                                        </p>
                                                        <div className="flex items-center justify-between gap-2">
                                                            <p className="font-semibold text-dark">
                                                                {formatCurrency(workshop.price)}
                                                            </p>
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    router.push(
                                                                        `/workshop/${workshop.id}`
                                                                    )
                                                                }
                                                                className="text-sm font-semibold text-terracotta hover:underline"
                                                            >
                                                                View workshop
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ) : activeList.length === 0 ? (
                                    <div className="bg-white rounded-2xl p-12 text-center shadow-soft border border-dark/5">
                                        <div className="w-16 h-16 bg-cream rounded-full flex items-center justify-center mx-auto mb-6 text-terracotta">
                                            {tab === "tickets" ? (
                                                <Ticket className="w-8 h-8" />
                                            ) : tab === "history" ? (
                                                <History className="w-8 h-8" />
                                            ) : (
                                                <MessageSquare className="w-8 h-8" />
                                            )}
                                        </div>
                                        <h3 className="text-lg font-medium mb-2">
                                            No{" "}
                                            {tab === "tickets"
                                                ? "upcoming tickets"
                                                : tab === "history"
                                                  ? "booking history"
                                                  : "past events"}
                                        </h3>
                                        <p className="text-dark/60 mb-8 max-w-md mx-auto">
                                            When you book workshops, they will appear here. Find
                                            your next creative experience!
                                        </p>
                                        <button
                                            onClick={() => router.push("/explore")}
                                            className="btn-primary"
                                        >
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
                                                <div
                                                    key={b.id}
                                                    className="bg-white rounded-2xl p-6 md:p-8 shadow-soft border border-dark/5"
                                                >
                                                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                                                        <div className="flex-1">
                                                            <div className="flex flex-wrap items-center gap-3 mb-3">
                                                                <span className="px-3 py-1 bg-cream rounded-lg text-xs font-semibold text-terracotta tracking-wider uppercase">
                                                                    Booking #{b.id.slice(0, 8)}
                                                                </span>
                                                                <span className="text-sm text-dark/50">
                                                                    Made on{" "}
                                                                    {formatDate(
                                                                        b.created_at.split("T")[0]
                                                                    )}
                                                                </span>
                                                            </div>

                                                            <h3 className="font-playfair font-medium text-2xl mb-4 text-dark">
                                                                {b.workshop?.title || "Workshop"}
                                                            </h3>

                                                            <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-dark/80 mb-4 max-w-2xl bg-cream-50 p-4 rounded-xl">
                                                                <div className="flex-1 min-w-[140px]">
                                                                    <span className="block text-xs uppercase text-dark/50 font-semibold tracking-wider mb-1">
                                                                        Date & Time
                                                                    </span>
                                                                    <div className="font-medium">
                                                                        {b.workshop?.date
                                                                            ? formatDate(
                                                                                  b.workshop.date
                                                                              )
                                                                            : "TBA"}
                                                                    </div>
                                                                    <div>
                                                                        {b.workshop?.time ||
                                                                            "--:--"}
                                                                    </div>
                                                                </div>
                                                                <div className="flex-1 min-w-[140px]">
                                                                    <span className="block text-xs uppercase text-dark/50 font-semibold tracking-wider mb-1">
                                                                        Location
                                                                    </span>
                                                                    <div className="font-medium">
                                                                        {b.workshop?.location ||
                                                                            "Location"}
                                                                    </div>
                                                                    <div>
                                                                        {b.workshop?.city || ""}
                                                                    </div>
                                                                </div>
                                                                <div className="flex-1 min-w-[100px]">
                                                                    <span className="block text-xs uppercase text-dark/50 font-semibold tracking-wider mb-1">
                                                                        Guests
                                                                    </span>
                                                                    <div className="font-medium">
                                                                        {b.guests}
                                                                    </div>
                                                                </div>
                                                                <div className="flex-1 min-w-[100px]">
                                                                    <span className="block text-xs uppercase text-dark/50 font-semibold tracking-wider mb-1">
                                                                        Amount
                                                                    </span>
                                                                    <div className="font-medium">
                                                                        {formatCurrency(b.total)}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {tab === "past" && (
                                                        <div className="mt-8 pt-6 border-t border-dark/10">
                                                            {saved && !isOpen && (
                                                                <div className="bg-cream-100/50 rounded-xl p-6 relative overflow-hidden border border-cream-200">
                                                                    <div className="flex items-center justify-between mb-4 relative z-10">
                                                                        <h4 className="font-medium text-dark text-lg flex items-center gap-2">
                                                                            Your Review
                                                                            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                                                        </h4>
                                                                        <div className="flex items-center gap-1 bg-white px-3 py-1.5 rounded-full shadow-sm">
                                                                            {[1, 2, 3, 4, 5].map(
                                                                                (s) => (
                                                                                    <Star
                                                                                        key={s}
                                                                                        className={`w-3.5 h-3.5 ${saved.rating >= s ? "text-amber-400 fill-amber-400" : "text-dark/20"}`}
                                                                                    />
                                                                                )
                                                                            )}
                                                                            <span className="ml-2 text-xs font-semibold text-dark/80">
                                                                                {saved.rating}.0
                                                                            </span>
                                                                        </div>
                                                                    </div>

                                                                    <p className="text-dark/80 mb-5 relative z-10 leading-relaxed text-sm">
                                                                        &quot;{saved.comment}&quot;
                                                                    </p>

                                                                    {saved.photos &&
                                                                        saved.photos.length > 0 && (
                                                                            <div className="flex gap-3 mb-5 overflow-x-auto pb-2 relative z-10 scrollbar-hide">
                                                                                {saved.photos.map(
                                                                                    (url, i) => (
                                                                                        <div
                                                                                            key={i}
                                                                                            className="relative w-24 h-24 rounded-xl overflow-hidden shrink-0 border border-dark/10 shadow-sm"
                                                                                        >
                                                                                            <Image
                                                                                                src={url}
                                                                                                alt={`Feedback ${i}`}
                                                                                                fill
                                                                                                sizes="96px"
                                                                                                className="object-cover hover:scale-105 transition-transform"
                                                                                            />
                                                                                        </div>
                                                                                    )
                                                                                )}
                                                                            </div>
                                                                        )}

                                                                    <div className="flex items-center justify-between relative z-10 mt-2">
                                                                        {saved.videoUrl ? (
                                                                            <a
                                                                                href={
                                                                                    saved.videoUrl
                                                                                }
                                                                                target="_blank"
                                                                                rel="noreferrer"
                                                                                className="inline-flex items-center gap-2 text-sm font-medium text-terracotta hover:underline bg-terracotta/5 px-3 py-1.5 rounded-lg"
                                                                            >
                                                                                <Video className="w-4 h-4" />
                                                                                Watch attached video
                                                                            </a>
                                                                        ) : (
                                                                            <div />
                                                                        )}

                                                                        <button
                                                                            onClick={() =>
                                                                                openEditor(b.id)
                                                                            }
                                                                            className="text-sm font-medium text-dark/60 hover:text-terracotta hover:bg-terracotta/5 px-4 py-2 rounded-lg transition-colors"
                                                                        >
                                                                            Edit Review
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {!saved && !isOpen && (
                                                                <div
                                                                    className="flex flex-col items-center justify-center p-10 border border-dashed border-dark/20 rounded-2xl bg-cream-50 overflow-hidden relative group cursor-pointer transition-colors hover:border-terracotta hover:bg-terracotta/5"
                                                                    onClick={() => openEditor(b.id)}
                                                                >
                                                                    <div className="absolute inset-0 bg-gradient-to-t from-cream/50 to-transparent pointer-events-none" />
                                                                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mb-4 group-hover:scale-110 transition-transform duration-300 relative z-10">
                                                                        <MessageSquare className="w-7 h-7 text-terracotta" />
                                                                    </div>
                                                                    <p className="text-dark/70 mb-5 max-w-sm text-center font-medium relative z-10">
                                                                        We&apos;d love to hear about
                                                                        your experience! Share your
                                                                        thoughts and photos with the
                                                                        host.
                                                                    </p>
                                                                    <button className="btn-primary font-medium shadow-sm relative z-10 pointer-events-none">
                                                                        Rate Experience
                                                                    </button>
                                                                </div>
                                                            )}

                                                            <AnimatePresence initial={false}>
                                                                {isOpen && (
                                                                    <motion.div
                                                                        initial={
                                                                            prefersReducedMotion
                                                                                ? { opacity: 0 }
                                                                                : {
                                                                                      opacity: 0,
                                                                                      y: 16,
                                                                                  }
                                                                        }
                                                                        animate={
                                                                            prefersReducedMotion
                                                                                ? { opacity: 1 }
                                                                                : {
                                                                                      opacity: 1,
                                                                                      y: 0,
                                                                                  }
                                                                        }
                                                                        exit={
                                                                            prefersReducedMotion
                                                                                ? { opacity: 0 }
                                                                                : {
                                                                                      opacity: 0,
                                                                                      y: 8,
                                                                                  }
                                                                        }
                                                                        transition={
                                                                            prefersReducedMotion
                                                                                ? {
                                                                                      duration: 0.2,
                                                                                  }
                                                                                : {
                                                                                      duration: 0.25,
                                                                                      ease: [
                                                                                          0.22, 1,
                                                                                          0.36, 1,
                                                                                      ],
                                                                                  }
                                                                        }
                                                                        className="fixed inset-0 z-[90] overflow-y-auto bg-cream/95 p-4 backdrop-blur-sm md:static md:inset-auto md:z-auto md:overflow-visible md:bg-transparent md:p-0 md:backdrop-blur-0"
                                                                    >
                                                                        <div
                                                                            ref={
                                                                                feedbackDialogContainerRef
                                                                            }
                                                                            role="dialog"
                                                                            aria-modal="true"
                                                                            aria-labelledby={`feedback-editor-title-${b.id}`}
                                                                            aria-describedby={`feedback-editor-description-${b.id}`}
                                                                            tabIndex={-1}
                                                                            className="bg-white border border-dark/10 rounded-2xl p-6 md:p-8 shadow-md min-h-[calc(100dvh-2rem)] md:min-h-0"
                                                                        >
                                                                            <h4
                                                                                id={`feedback-editor-title-${b.id}`}
                                                                                className="sr-only"
                                                                            >
                                                                                Write your review
                                                                            </h4>
                                                                            <p
                                                                                id={`feedback-editor-description-${b.id}`}
                                                                                className="sr-only"
                                                                            >
                                                                                Share your
                                                                                experience to help
                                                                                future attendees and
                                                                                support the host.
                                                                            </p>
                                                                            <div className="sticky -mx-6 -mt-6 top-0 z-10 mb-6 flex items-center justify-between border-b border-dark/10 bg-white px-6 py-4 md:hidden">
                                                                                <h4 className="font-playfair text-xl font-medium">
                                                                                    Write your
                                                                                    review
                                                                                </h4>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() =>
                                                                                        setOpenFeedbackId(
                                                                                            null
                                                                                        )
                                                                                    }
                                                                                    aria-label="Close review editor"
                                                                                    className="rounded-full p-2 text-dark/70 hover:bg-dark/5 hover:text-dark transition-colors"
                                                                                >
                                                                                    <X className="w-4 h-4" />
                                                                                </button>
                                                                            </div>
                                                                            <div className="hidden md:flex items-center justify-between mb-1">
                                                                                <h4 className="font-playfair text-2xl font-medium">
                                                                                    Write your
                                                                                    review
                                                                                </h4>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() =>
                                                                                        setOpenFeedbackId(
                                                                                            null
                                                                                        )
                                                                                    }
                                                                                    aria-label="Close review editor"
                                                                                    className="rounded-full p-2 text-dark/70 hover:bg-dark/5 hover:text-dark transition-colors"
                                                                                >
                                                                                    <X className="w-4 h-4" />
                                                                                </button>
                                                                            </div>
                                                                            <p className="text-dark/60 text-sm mb-8">
                                                                                Share your
                                                                                experience to help
                                                                                future attendees and
                                                                                support the host.
                                                                            </p>

                                                                            <div className="space-y-8">
                                                                                {/* Rating */}
                                                                                <div className="bg-cream-50 rounded-xl p-6 border border-dark/5 flex flex-col items-center">
                                                                                    <label className="block text-sm font-semibold uppercase tracking-wider text-dark/50 mb-4">
                                                                                        Overall
                                                                                        Rating
                                                                                    </label>
                                                                                    <div className="flex items-center gap-3">
                                                                                        {[
                                                                                            1, 2, 3,
                                                                                            4, 5,
                                                                                        ].map(
                                                                                            (s) => (
                                                                                                <button
                                                                                                    key={`${b.id}-${s}`}
                                                                                                    type="button"
                                                                                                    aria-label={`Rate ${s} star${s > 1 ? "s" : ""}`}
                                                                                                    onClick={() =>
                                                                                                        updateDraft(
                                                                                                            b.id,
                                                                                                            {
                                                                                                                rating: s,
                                                                                                            }
                                                                                                        )
                                                                                                    }
                                                                                                    className="transform hover:scale-110 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta/50 focus-visible:ring-offset-2 focus-visible:ring-offset-cream p-1"
                                                                                                >
                                                                                                    <Star
                                                                                                        className={`w-10 h-10 ${d.rating >= s ? "text-amber-400 fill-amber-400 drop-shadow-sm" : "text-dark/10"}`}
                                                                                                    />
                                                                                                </button>
                                                                                            )
                                                                                        )}
                                                                                    </div>
                                                                                </div>

                                                                                {/* Comment */}
                                                                                <div>
                                                                                    <label className="block text-sm font-medium text-dark mb-2">
                                                                                        Detailed
                                                                                        Thoughts{" "}
                                                                                        <span className="text-red-500">
                                                                                            *
                                                                                        </span>
                                                                                    </label>
                                                                                    <textarea
                                                                                        value={
                                                                                            d.comment
                                                                                        }
                                                                                        onChange={(
                                                                                            e
                                                                                        ) =>
                                                                                            updateDraft(
                                                                                                b.id,
                                                                                                {
                                                                                                    comment:
                                                                                                        e
                                                                                                            .target
                                                                                                            .value,
                                                                                                }
                                                                                            )
                                                                                        }
                                                                                        rows={4}
                                                                                        placeholder="What did you enjoy the most? How was the host?"
                                                                                        className="w-full bg-cream-50 border border-dark/10 rounded-xl px-5 py-4 text-dark focus:ring-2 focus:ring-terracotta/20 focus:border-terracotta transition-all resize-none shadow-inner"
                                                                                    />
                                                                                    <p className="mt-2 text-xs text-dark/50">
                                                                                        Minimum{" "}
                                                                                        {
                                                                                            MIN_REVIEW_LENGTH
                                                                                        }{" "}
                                                                                        characters (
                                                                                        {
                                                                                            d.comment.trim()
                                                                                                .length
                                                                                        }
                                                                                        /
                                                                                        {
                                                                                            MIN_REVIEW_LENGTH
                                                                                        }
                                                                                        )
                                                                                    </p>
                                                                                </div>

                                                                                {/* Media */}
                                                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 border-t border-dark/5">
                                                                                    <div>
                                                                                        <label className="block text-sm font-medium text-dark mb-3 flex items-center gap-2">
                                                                                            <Upload className="w-4 h-4 text-terracotta" />{" "}
                                                                                            Photos
                                                                                        </label>

                                                                                        <div className="grid grid-cols-3 gap-3">
                                                                                            {d.photos.map(
                                                                                                (
                                                                                                    photo,
                                                                                                    i
                                                                                                ) => (
                                                                                                    <div
                                                                                                        key={
                                                                                                            i
                                                                                                        }
                                                                                                        className="relative aspect-square rounded-xl overflow-hidden group border border-dark/10 shadow-sm"
                                                                                                    >
                                                                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                                                        <img
                                                                                                            src={
                                                                                                                photo
                                                                                                            }
                                                                                                            alt={`Uploaded feedback photo ${i + 1}`}
                                                                                                            className="object-cover w-full h-full"
                                                                                                        />
                                                                                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                                                                            <button
                                                                                                                onClick={() =>
                                                                                                                    removePhoto(
                                                                                                                        b.id,
                                                                                                                        i
                                                                                                                    )
                                                                                                                }
                                                                                                                aria-label={`Remove photo ${i + 1}`}
                                                                                                                className="w-8 h-8 bg-white/20 hover:bg-red-500 rounded-full flex items-center justify-center transition-colors backdrop-blur-sm"
                                                                                                            >
                                                                                                                <X className="w-4 h-4 text-white" />
                                                                                                            </button>
                                                                                                        </div>
                                                                                                    </div>
                                                                                                )
                                                                                            )}
                                                                                            {d
                                                                                                .photos
                                                                                                .length <
                                                                                                5 && (
                                                                                                <label className="aspect-square flex flex-col items-center justify-center border-2 border-dashed border-dark/20 rounded-xl text-dark/50 hover:text-terracotta hover:border-terracotta hover:bg-terracotta/5 transition-all cursor-pointer bg-cream-50 group">
                                                                                                    {uploading ? (
                                                                                                        <Loader2 className="w-6 h-6 animate-spin mb-2" />
                                                                                                    ) : (
                                                                                                        <Upload className="w-6 h-6 mb-2 group-hover:-translate-y-1 transition-transform" />
                                                                                                    )}
                                                                                                    <span className="text-xs font-medium">
                                                                                                        Add
                                                                                                        Photo
                                                                                                    </span>
                                                                                                    <input
                                                                                                        type="file"
                                                                                                        accept="image/*"
                                                                                                        className="hidden"
                                                                                                        ref={
                                                                                                            fileInputRef
                                                                                                        }
                                                                                                        onChange={(
                                                                                                            e
                                                                                                        ) =>
                                                                                                            handleFileUpload(
                                                                                                                b.id,
                                                                                                                e
                                                                                                            )
                                                                                                        }
                                                                                                        disabled={
                                                                                                            uploading
                                                                                                        }
                                                                                                    />
                                                                                                </label>
                                                                                            )}
                                                                                        </div>
                                                                                        <p className="text-xs text-dark/40 mt-3 font-medium uppercase tracking-wide">
                                                                                            Up to 5
                                                                                            photos
                                                                                            (max 5MB
                                                                                            each)
                                                                                        </p>
                                                                                    </div>

                                                                                    <div>
                                                                                        <label className="block text-sm font-medium text-dark mb-3 flex items-center gap-2">
                                                                                            <Video className="w-4 h-4 text-terracotta" />{" "}
                                                                                            Video
                                                                                            Link
                                                                                        </label>
                                                                                        <input
                                                                                            type="url"
                                                                                            value={
                                                                                                d.videoUrl
                                                                                            }
                                                                                            onChange={(
                                                                                                e
                                                                                            ) =>
                                                                                                updateDraft(
                                                                                                    b.id,
                                                                                                    {
                                                                                                        videoUrl:
                                                                                                            e
                                                                                                                .target
                                                                                                                .value,
                                                                                                    }
                                                                                                )
                                                                                            }
                                                                                            placeholder="YouTube or Instagram Reel URL"
                                                                                            className="w-full bg-cream-50 border border-dark/10 rounded-xl px-4 py-3.5 text-sm focus:ring-2 focus:ring-terracotta/20 focus:border-terracotta transition-shadow shadow-inner"
                                                                                        />
                                                                                    </div>
                                                                                </div>

                                                                                {feedbackErrors[
                                                                                    b.id
                                                                                ] && (
                                                                                    <div className="bg-red-50 text-red-700 text-sm px-5 py-4 rounded-xl border border-red-100 flex items-center gap-3">
                                                                                        <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center shrink-0">
                                                                                            <X className="w-4 h-4 text-red-500" />
                                                                                        </div>
                                                                                        <div className="font-medium">
                                                                                            {
                                                                                                feedbackErrors[
                                                                                                    b
                                                                                                        .id
                                                                                                ]
                                                                                            }
                                                                                        </div>
                                                                                    </div>
                                                                                )}

                                                                                <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-dark/10">
                                                                                    <button
                                                                                        onClick={() =>
                                                                                            saveFeedback(
                                                                                                b.id,
                                                                                                b
                                                                                                    .workshop
                                                                                                    ?.id
                                                                                            )
                                                                                        }
                                                                                        disabled={
                                                                                            savingFeedback ||
                                                                                            d.comment.trim()
                                                                                                .length <
                                                                                                MIN_REVIEW_LENGTH
                                                                                        }
                                                                                        className="btn-primary !py-3.5 flex-1 sm:flex-none flex justify-center items-center gap-2 shadow-md hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
                                                                                    >
                                                                                        {savingFeedback && (
                                                                                            <Loader2 className="w-5 h-5 animate-spin" />
                                                                                        )}
                                                                                        Publish
                                                                                        Review
                                                                                    </button>
                                                                                    <button
                                                                                        onClick={() =>
                                                                                            setOpenFeedbackId(
                                                                                                null
                                                                                            )
                                                                                        }
                                                                                        disabled={
                                                                                            savingFeedback
                                                                                        }
                                                                                        className="px-6 py-3.5 rounded-full font-medium border border-dark/10 text-dark/70 hover:text-dark hover:bg-dark/5 flex-1 sm:flex-none transition-all pulse-hover"
                                                                                    >
                                                                                        Discard
                                                                                        changes
                                                                                    </button>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </motion.div>
                                                                )}
                                                            </AnimatePresence>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </motion.div>
                        </AnimatePresence>
                    </div>
                </div>
            </div>
            <MobileNav />
        </main>
    );
}
