"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
    CalendarDays,
    Clock,
    MapPin,
    Settings,
    LogOut,
    Ticket,
    Loader2,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import MobileNav from "@/components/MobileNav";
import { formatDate, formatCurrency } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

type BookingItem = {
    id: string;
    guests: number;
    total: number;
    status: string;
    created_at: string;
    workshop?: {
        id: string;
        title: string;
        date: string;
        time: string;
        duration?: string;
        location: string;
        city: string;
        cover_image: string;
        host_name?: string;
    };
};

const tabs = [
    { id: "upcoming", label: "Upcoming Sessions", icon: CalendarDays },
    { id: "past", label: "Past Workshops", icon: Clock },
    { id: "settings", label: "Account Settings", icon: Settings },
];

export default function DashboardPage() {
    const router = useRouter();
    const { user, session, role, roleLoading, loading, signOut } = useAuth();
    const [activeTab, setActiveTab] = useState("upcoming");
    const [bookings, setBookings] = useState<BookingItem[]>([]);
    const [fetchingBookings, setFetchingBookings] = useState(false);
    const [bookingsError, setBookingsError] = useState<string | null>(null);

    useEffect(() => {
        if (!loading && !user) {
            const redirectPath = encodeURIComponent("/dashboard");
            router.push(`/auth/login?redirect=${redirectPath}`);
        }
    }, [loading, user, router]);

    useEffect(() => {
        if (!loading && !roleLoading && user && role !== "admin") {
            router.push("/");
        }
    }, [loading, roleLoading, user, role, router]);

    useEffect(() => {
        let cancelled = false;

        const loadBookings = async () => {
            if (!user || !session?.access_token || roleLoading || role !== "admin") {
                return;
            }

            setFetchingBookings(true);
            setBookingsError(null);
            try {
                const response = await fetch("/api/bookings", {
                    headers: {
                        Authorization: `Bearer ${session.access_token}`,
                    },
                    cache: "no-store",
                });
                const result = await response.json();
                if (!response.ok) {
                    throw new Error(result.error || "Failed to load bookings.");
                }
                if (!cancelled) {
                    setBookings((result.data || []) as BookingItem[]);
                }
            } catch (error) {
                if (!cancelled) {
                    setBookingsError(
                        error instanceof Error
                            ? error.message
                            : "Unable to load your bookings."
                    );
                }
            } finally {
                if (!cancelled) {
                    setFetchingBookings(false);
                }
            }
        };

        loadBookings();
        return () => {
            cancelled = true;
        };
    }, [role, roleLoading, user, session]);

    const today = new Date().toISOString().slice(0, 10);
    const upcomingBookings = useMemo(
        () =>
            bookings.filter(
                (booking) =>
                    booking.workshop?.date && booking.workshop.date >= today
            ),
        [bookings, today]
    );
    const pastBookings = useMemo(
        () =>
            bookings.filter(
                (booking) =>
                    booking.workshop?.date && booking.workshop.date < today
            ),
        [bookings, today]
    );

    const userName =
        user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Creator";
    const memberSince = user?.created_at
        ? new Date(user.created_at).getFullYear()
        : new Date().getFullYear();
    const avatarUrl =
        user?.user_metadata?.avatar_url || "/images/workshops/IMG-20260306-WA0006.webp";

    const handleSignOut = async () => {
        await signOut();
        router.push("/");
    };

    if (loading || roleLoading || !user) {
        return (
            <main className="min-h-screen flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-terracotta" />
            </main>
        );
    }

    if (role !== "admin") {
        return null;
    }

    const activeList = activeTab === "past" ? pastBookings : upcomingBookings;

    return (
        <main className="min-h-screen pb-20 md:pb-0 bg-cream">
            <Navbar />

            <div className="pt-20 sm:pt-24">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="grid grid-cols-1 lg:grid-cols-[240px,1fr] gap-8">
                        <motion.aside
                            initial={{ opacity: 0, x: -30 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.5 }}
                            className="hidden lg:block"
                        >
                            <div className="sticky top-28">
                                <div className="text-center mb-8">
                                    <div className="relative w-20 h-20 mx-auto mb-3 rounded-full overflow-hidden ring-3 ring-terracotta/20">
                                        <Image src={avatarUrl} alt={userName} fill className="object-cover" />
                                    </div>
                                    <h3 className="font-playfair text-lg font-bold text-dark">{userName}</h3>
                                    <p className="text-xs font-inter text-dark-muted mt-0.5">
                                        Member since {memberSince}
                                    </p>
                                </div>

                                <nav className="space-y-1">
                                    {tabs.map((tab) => {
                                        const Icon = tab.icon;
                                        const isActive = activeTab === tab.id;
                                        return (
                                            <button
                                                key={tab.id}
                                                onClick={() => setActiveTab(tab.id)}
                                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-inter font-medium transition-all duration-300 ${isActive
                                                        ? "bg-terracotta/10 text-terracotta"
                                                        : "text-dark-muted hover:bg-clay/20 hover:text-dark"
                                                    }`}
                                            >
                                                <Icon className="w-5 h-5" />
                                                {tab.label}
                                            </button>
                                        );
                                    })}
                                </nav>

                                <button
                                    onClick={handleSignOut}
                                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-inter font-medium text-dark-muted hover:text-terracotta hover:bg-terracotta/5 transition-all duration-300 mt-8 border border-gray-200"
                                >
                                    <LogOut className="w-5 h-5" />
                                    LOG OUT
                                </button>
                            </div>
                        </motion.aside>

                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: 0.1 }}
                        >
                            <div className="mb-8">
                                <p className="text-xs font-inter font-bold text-terracotta uppercase tracking-wider mb-1">
                                    My Studio
                                </p>
                                <h1 className="heading-lg">
                                    {activeTab === "upcoming" && "Your Upcoming Sessions"}
                                    {activeTab === "past" && "Past Workshops"}
                                    {activeTab === "settings" && "Account Settings"}
                                </h1>
                            </div>

                            <div className="flex gap-2 mb-8 overflow-x-auto scrollbar-hide lg:hidden">
                                {tabs.map((tab) => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id)}
                                        className={`px-4 py-2 rounded-full text-sm font-inter font-medium whitespace-nowrap transition-all ${activeTab === tab.id
                                                ? "bg-terracotta text-white"
                                                : "bg-white text-dark-secondary border border-gray-200"
                                            }`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            {bookingsError && activeTab !== "settings" && (
                                <div className="mb-6 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-inter">
                                    {bookingsError}
                                </div>
                            )}

                            {activeTab !== "settings" && fetchingBookings && (
                                <div className="flex items-center gap-2 text-sm font-inter text-dark-muted">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Loading your bookings...
                                </div>
                            )}

                            {activeTab !== "settings" && !fetchingBookings && activeList.length === 0 && (
                                <div className="bg-white rounded-2xl p-8 shadow-soft text-center">
                                    <h2 className="heading-sm mb-2">No bookings yet</h2>
                                    <p className="text-body text-dark-muted mb-6">
                                        {activeTab === "upcoming"
                                            ? "You have no upcoming bookings right now."
                                            : "You have no past bookings yet."}
                                    </p>
                                    <button
                                        onClick={() => router.push("/explore")}
                                        className="btn-primary"
                                    >
                                        Explore Workshops
                                    </button>
                                </div>
                            )}

                            {activeTab !== "settings" && !fetchingBookings && activeList.length > 0 && (
                                <div className="space-y-6">
                                    {activeList.map((booking, index) => (
                                        <motion.div
                                            key={booking.id}
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: index * 0.08 }}
                                            className="bg-white rounded-2xl shadow-soft overflow-hidden"
                                        >
                                            <div className="flex flex-col sm:flex-row">
                                                <div className="relative w-full sm:w-56 h-48 sm:h-auto flex-shrink-0">
                                                    <Image
                                                        src={booking.workshop?.cover_image || "/images/workshops/IMG-20260306-WA0006.webp"}
                                                        alt={booking.workshop?.title || "Workshop"}
                                                        fill
                                                        className="object-cover"
                                                    />
                                                </div>
                                                <div className="flex-1 p-5 sm:p-6">
                                                    <h3 className="font-playfair text-xl font-bold text-dark mb-1">
                                                        {booking.workshop?.title || "Workshop"}
                                                    </h3>
                                                    <p className="text-sm font-inter text-dark-muted mb-4">
                                                        Booking #{booking.id.slice(0, 8)}
                                                    </p>
                                                    <div className="flex flex-wrap gap-3 mb-5">
                                                        <span className="inline-flex items-center gap-1.5 text-xs font-inter text-dark-secondary bg-cream-200/50 px-3 py-1.5 rounded-lg">
                                                            <Clock className="w-3.5 h-3.5 text-terracotta" />
                                                            {booking.workshop?.time || "--:--"} · {booking.workshop?.duration || "Session"}
                                                        </span>
                                                        <span className="inline-flex items-center gap-1.5 text-xs font-inter text-dark-secondary bg-cream-200/50 px-3 py-1.5 rounded-lg">
                                                            <CalendarDays className="w-3.5 h-3.5 text-terracotta" />
                                                            {booking.workshop?.date ? formatDate(booking.workshop.date) : "Date TBA"}
                                                        </span>
                                                        <span className="inline-flex items-center gap-1.5 text-xs font-inter text-dark-secondary bg-cream-200/50 px-3 py-1.5 rounded-lg">
                                                            <MapPin className="w-3.5 h-3.5 text-terracotta" />
                                                            {booking.workshop?.location || "Location"}{booking.workshop?.city ? `, ${booking.workshop.city}` : ""}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-sm font-inter font-semibold text-dark">
                                                            {booking.guests} guests · {formatCurrency(booking.total)}
                                                        </span>
                                                        <button className="btn-primary !py-2.5 !px-6 text-sm">
                                                            <Ticket className="w-4 h-4" />
                                                            View Ticket
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            )}

                            {activeTab === "settings" && (
                                <div className="bg-white rounded-2xl shadow-soft p-6 max-w-2xl">
                                    <div className="space-y-6">
                                        <div>
                                            <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                                                Full Name
                                            </label>
                                            <input
                                                type="text"
                                                defaultValue={userName}
                                                className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta transition-colors"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                                                Email
                                            </label>
                                            <input
                                                type="email"
                                                defaultValue={user.email || ""}
                                                className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta transition-colors"
                                            />
                                        </div>
                                        <button className="btn-primary !py-3">
                                            Save Changes
                                        </button>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    </div>
                </div>
            </div>

            <MobileNav />
        </main>
    );
}
