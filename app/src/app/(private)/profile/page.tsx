"use client";

import { useEffect, useMemo, useState, useRef, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
    Loader2,
    X,
    Ticket,
    History,
    MessageSquare,
    Settings,
    Heart,
    Banknote,
} from "lucide-react";
import WorkshopTicket from "@/app/(private)/booking/WorkshopTicket";
import Navbar from "@/components/Navbar";
import ProfileEarningsPanel from "@/components/profile/ProfileEarningsPanel";
import ProfileSettingsPanel from "@/components/profile/ProfileSettingsPanel";
import ProfileWishlistPanel from "@/components/profile/ProfileWishlistPanel";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import {
    getFavorites,
    removeFavorite,
    getWorkshopById,
    getMyBookings,
    toApiErrorMessage,
    uploadMedia,
    getProfile,
    updateProfile,
    getHostLedger,
    type HostLedgerResponse,
} from "@/lib/api-client";
import type { Workshop } from "@/lib/data";

const BOOKINGS_PAGE_SIZE = 50;

type BookingItem = {
    id: string;
    guests: number;
    total: number;
    created_at: string;
    first_name?: string;
    last_name?: string;
    workshop?: {
        id: string;
        title: string;
        date: string;
        time: string;
        location: string;
        city: string;
        cover_image?: string;
    };
};

export default function ProfilePage() {
    const router = useRouter();
    const { user, session, loading, signOut, role } = useAuth();
    const prefersReducedMotion = Boolean(useReducedMotion());

    const [tab, setTab] = useState<
        "tickets" | "history" | "past" | "wishlist" | "settings" | "earnings"
    >("tickets");
    const [bookings, setBookings] = useState<BookingItem[]>([]);
    const [favoriteWorkshops, setFavoriteWorkshops] = useState<Workshop[]>([]);
    const [ledger, setLedger] = useState<HostLedgerResponse | null>(null);
    const [fetching, setFetching] = useState(false);
    // /api/bookings pages at 50. Without these the page would quietly show the first 50 of a
    // long history and give no sign the rest existed.
    const [hasMoreBookings, setHasMoreBookings] = useState(false);
    const [loadingMoreBookings, setLoadingMoreBookings] = useState(false);
    const [loadingFavorites, setLoadingFavorites] = useState(false);
    const [loadingLedger, setLoadingLedger] = useState(false);
    const [removingFavoriteId, setRemovingFavoriteId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [reloadKey, setReloadKey] = useState(0);

    const [profileName, setProfileName] = useState("");
    const [profileAvatar, setProfileAvatar] = useState<string | null>(null);
    const [profileDob, setProfileDob] = useState("");
    const [profilePhone, setProfilePhone] = useState("");
    const [profileLoading, setProfileLoading] = useState(false);
    const [profileSaving, setProfileSaving] = useState(false);
    const [profileMessage, setProfileMessage] = useState<string | null>(null);
    const [profileError, setProfileError] = useState<string | null>(null);
    const [avatarUploading, setAvatarUploading] = useState(false);

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
        let cancelled = false;
        const loadBookings = async () => {
            if (!user || !session?.access_token) return;
            setFetching(true);
            setError(null);
            try {
                const result = await getMyBookings(session.access_token, {
                    limit: BOOKINGS_PAGE_SIZE,
                });
                if (!cancelled) {
                    setBookings((result.data || []) as BookingItem[]);
                    setHasMoreBookings(Boolean(result.pagination?.hasMore));
                }
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

    const handleLoadMoreBookings = async () => {
        if (!session?.access_token || loadingMoreBookings) return;
        setLoadingMoreBookings(true);
        try {
            const result = await getMyBookings(session.access_token, {
                limit: BOOKINGS_PAGE_SIZE,
                offset: bookings.length,
            });
            setBookings((current) => [...current, ...((result.data || []) as BookingItem[])]);
            setHasMoreBookings(Boolean(result.pagination?.hasMore));
        } catch (e) {
            setError(toApiErrorMessage(e, "Unable to load more bookings."));
        } finally {
            setLoadingMoreBookings(false);
        }
    };

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

    const syncProfileAvatar = async (nextAvatar: string | null) => {
        if (!session?.access_token) return nextAvatar;

        const result = await updateProfile(session.access_token, {
            avatarUrl: nextAvatar || "",
        });

        if (isSupabaseConfigured) {
            await supabase.auth.updateUser({
                data: {
                    avatar_url: nextAvatar || null,
                },
            });
        }

        return result.profile.avatarUrl || null;
    };

    const handleAvatarUpload = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file || !session?.access_token) return;

        const previousAvatar = profileAvatar;
        setAvatarUploading(true);
        setProfileError(null);
        setProfileMessage(null);
        try {
            const data = await uploadMedia(session.access_token, file);
            setProfileAvatar(data.url);
            const persistedAvatar = await syncProfileAvatar(data.url);
            setProfileAvatar(persistedAvatar);
            setProfileMessage("Profile photo updated.");
        } catch (error) {
            setProfileAvatar(previousAvatar);
            setProfileError(toApiErrorMessage(error, "Unable to upload profile photo."));
        } finally {
            setAvatarUploading(false);
        }
    };

    const handleRemoveAvatar = async () => {
        if (!session?.access_token) return;

        const previousAvatar = profileAvatar;
        setProfileAvatar(null);
        setProfileError(null);
        setProfileMessage(null);

        try {
            const persistedAvatar = await syncProfileAvatar(null);
            setProfileAvatar(persistedAvatar);
            setProfileMessage("Profile photo removed.");
        } catch (error) {
            setProfileAvatar(previousAvatar);
            setProfileError(toApiErrorMessage(error, "Unable to remove profile photo."));
        }
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
                        <h1 className="text-3xl md:text-4xl font-playfair font-medium text-dark mb-2 flex items-center gap-3">
                            Welcome Back! 👋
                        </h1>
                        <div className="flex flex-col gap-1">
                            <p className="text-dark-muted">{user.email}</p>
                            <p className="text-sm font-medium text-terracotta bg-terracotta/10 inline-block px-3 py-1 rounded-full w-max mt-2">
                                Member since {new Date(user.created_at || Date.now()).getFullYear()}
                            </p>
                        </div>
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
                                    <ProfileEarningsPanel ledger={ledger} loading={loadingLedger} />
                                ) : tab === "settings" ? (
                                    <ProfileSettingsPanel
                                        avatarInputRef={avatarInputRef}
                                        avatarUploading={avatarUploading}
                                        onAvatarUpload={handleAvatarUpload}
                                        onRemoveAvatar={handleRemoveAvatar}
                                        onSaveProfile={handleSaveProfile}
                                        profileAvatar={profileAvatar}
                                        profileDob={profileDob}
                                        profileError={profileError}
                                        profileLoading={profileLoading}
                                        profileMessage={profileMessage}
                                        profileName={profileName}
                                        profilePhone={profilePhone}
                                        profileSaving={profileSaving}
                                        setProfileDob={setProfileDob}
                                        setProfileName={setProfileName}
                                        setProfilePhone={setProfilePhone}
                                        userEmail={user.email}
                                    />
                                ) : tab === "wishlist" ? (
                                    <ProfileWishlistPanel
                                        favoriteWorkshops={favoriteWorkshops}
                                        loadingFavorites={loadingFavorites}
                                        onExplore={() => router.push("/explore")}
                                        onUnsaveWorkshop={handleUnsaveWorkshop}
                                        onViewWorkshop={(workshopId) =>
                                            router.push(`/workshop/${workshopId}`)
                                        }
                                        removingFavoriteId={removingFavoriteId}
                                    />
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
                                            const ticketAttendeeName =
                                                [b.first_name, b.last_name]
                                                    .filter((value): value is string =>
                                                        Boolean(value)
                                                    )
                                                    .join(" ") ||
                                                profileName ||
                                                "Guest";
                                            const ticketLocation = b.workshop?.city
                                                ? `${b.workshop.location || "Location"}, ${b.workshop.city}`
                                                : b.workshop?.location || "Location";

                                            return tab === "tickets" ? (
                                                <div key={b.id} className="mb-6 last:mb-0">
                                                    <WorkshopTicket
                                                        bookingId={b.id}
                                                        attendeeName={ticketAttendeeName}
                                                        location={ticketLocation}
                                                        workshopId={b.workshop?.id || ""}
                                                        workshopTitle={
                                                            b.workshop?.title || "Workshop"
                                                        }
                                                        workshopDate={b.workshop?.date || ""}
                                                        workshopTime={b.workshop?.time || ""}
                                                        workshopCoverImage={
                                                            b.workshop?.cover_image || null
                                                        }
                                                        guests={b.guests}
                                                        totalPaid={b.total}
                                                        prefersReducedMotion={prefersReducedMotion}
                                                    />
                                                </div>
                                            ) : (
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
                                                </div>
                                            );
                                        })}

                                        {hasMoreBookings && (
                                            <div className="flex justify-center pt-2">
                                                <button
                                                    onClick={handleLoadMoreBookings}
                                                    disabled={loadingMoreBookings}
                                                    className="btn-secondary disabled:opacity-70 disabled:cursor-not-allowed"
                                                >
                                                    {loadingMoreBookings
                                                        ? "Loading..."
                                                        : "Load more bookings"}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </motion.div>
                        </AnimatePresence>
                    </div>
                </div>
            </div>
        </main>
    );
}
