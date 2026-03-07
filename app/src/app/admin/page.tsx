"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
    LayoutDashboard,
    Calendar,
    BarChart3,
    Settings,
    Plus,
    X,
    Trash2,
    Upload,
    ImagePlus,
    Video,
    Instagram,
    Youtube,
    Globe,
    Clock,
    MapPin,
    Users,
    IndianRupee,
    FileText,
    ChevronDown,
    Check,
    Loader2,
    ArrowLeft,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { mockWorkshops, categories } from "@/lib/data";
import type { Workshop } from "@/lib/data";
import { formatCurrency } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

interface WorkshopFormData {
    title: string;
    description: string;
    category: string;
    price: string;
    location: string;
    city: string;
    duration: string;
    date: string;
    time: string;
    maxSeats: string;
    coverImage: string;
    galleryImages: string[];
    videoUrl: string;
    instagramLink: string;
    youtubeLink: string;
    websiteLink: string;
    hostName: string;
    hostBio: string;
    hostExperience: string;
    hostInstagram: string;
    hostYoutube: string;
    hostWebsite: string;
    whatYouLearn: string[];
    materialsProvided: string[];
}

const emptyForm: WorkshopFormData = {
    title: "",
    description: "",
    category: "",
    price: "",
    location: "",
    city: "",
    duration: "",
    date: "",
    time: "",
    maxSeats: "",
    coverImage: "",
    galleryImages: [],
    videoUrl: "",
    instagramLink: "",
    youtubeLink: "",
    websiteLink: "",
    hostName: "",
    hostBio: "",
    hostExperience: "",
    hostInstagram: "",
    hostYoutube: "",
    hostWebsite: "",
    whatYouLearn: [""],
    materialsProvided: [""],
};

export default function AdminPage() {
    const router = useRouter();
    const { user, session, loading } = useAuth();
    const [activeTab, setActiveTab] = useState("dashboard");
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [form, setForm] = useState<WorkshopFormData>({ ...emptyForm });
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [adminRoleLoading, setAdminRoleLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);
    const [adminWorkshops, setAdminWorkshops] = useState<Workshop[]>(mockWorkshops);
    const [loadingAdminWorkshops, setLoadingAdminWorkshops] = useState(false);
    const [adminStats, setAdminStats] = useState<{
        activeWorkshops: number;
        totalBookedSeats: number;
        revenue: number;
        avgRating: string;
    } | null>(null);

    useEffect(() => {
        if (!loading && !user) {
            const redirectPath = encodeURIComponent("/admin");
            router.push(`/auth/login?redirect=${redirectPath}`);
        }
    }, [loading, user, router]);

    const loadAdminWorkshops = useCallback(async () => {
        if (!session?.access_token) return;
        setLoadingAdminWorkshops(true);
        try {
            const [workshopsRes, statsRes] = await Promise.all([
                fetch("/api/admin/workshops", {
                    headers: { Authorization: `Bearer ${session.access_token}` },
                    cache: "no-store",
                }),
                fetch("/api/admin/stats", {
                    headers: { Authorization: `Bearer ${session.access_token}` },
                    cache: "no-store",
                }),
            ]);

            if (workshopsRes.ok) {
                const result = await workshopsRes.json();
                if (Array.isArray(result.data)) {
                    setAdminWorkshops(result.data as Workshop[]);
                }
            }

            if (statsRes.ok) {
                const result = await statsRes.json();
                if (result.stats) {
                    setAdminStats(result.stats);
                }
            }
        } finally {
            setLoadingAdminWorkshops(false);
        }
    }, [session]);

    useEffect(() => {
        let cancelled = false;

        const validateAdminRole = async () => {
            if (!user || !session?.access_token) {
                if (!cancelled) {
                    setAdminRoleLoading(false);
                }
                return;
            }

            setAdminRoleLoading(true);
            try {
                const response = await fetch("/api/auth/me", {
                    headers: {
                        Authorization: `Bearer ${session.access_token}`,
                    },
                    cache: "no-store",
                });
                const result = await response.json();
                if (!cancelled) {
                    const hasAdminRole = response.ok && result.role === "admin";
                    setIsAdmin(hasAdminRole);
                    if (hasAdminRole) {
                        await loadAdminWorkshops();
                    }
                }
            } finally {
                if (!cancelled) {
                    setAdminRoleLoading(false);
                }
            }
        };

        validateAdminRole();
        return () => {
            cancelled = true;
        };
    }, [user, session, loadAdminWorkshops]);

    const sidebarItems = [
        { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
        { id: "workshops", label: "Workshops", icon: Calendar },
        { id: "analytics", label: "Analytics", icon: BarChart3 },
        { id: "settings", label: "Settings", icon: Settings },
    ];

    const updateForm = (field: keyof WorkshopFormData, value: string | string[]) => {
        setForm((prev) => ({ ...prev, [field]: value }));
    };

    const addListItem = (field: "whatYouLearn" | "materialsProvided") => {
        setForm((prev) => ({ ...prev, [field]: [...prev[field], ""] }));
    };

    const updateListItem = (field: "whatYouLearn" | "materialsProvided", index: number, value: string) => {
        setForm((prev) => {
            const updated = [...prev[field]];
            updated[index] = value;
            return { ...prev, [field]: updated };
        });
    };

    const removeListItem = (field: "whatYouLearn" | "materialsProvided", index: number) => {
        setForm((prev) => ({
            ...prev,
            [field]: prev[field].filter((_, i) => i !== index),
        }));
    };

    const handleSave = async () => {
        setSaveError(null);
        if (!session?.access_token) {
            setSaveError("Your session expired. Please log in again.");
            return;
        }

        setSaving(true);
        try {
            const payload = {
                title: form.title.trim(),
                description: form.description.trim(),
                category: form.category.trim(),
                price: Number(form.price),
                location: form.location.trim(),
                city: form.city.trim(),
                duration: form.duration.trim(),
                date: form.date.trim(),
                time: form.time.trim(),
                maxSeats: Number(form.maxSeats),
                coverImage: form.coverImage.trim(),
                galleryImages: form.galleryImages
                    .map((item) => item.trim())
                    .filter(Boolean),
                videoUrl: form.videoUrl.trim(),
                socialLinks: {
                    instagram: form.instagramLink.trim(),
                    youtube: form.youtubeLink.trim(),
                    website: form.websiteLink.trim(),
                },
                hostName: form.hostName.trim(),
                hostBio: form.hostBio.trim(),
                hostExperience: form.hostExperience.trim(),
                hostSocialLinks: {
                    instagram: form.hostInstagram.trim(),
                    youtube: form.hostYoutube.trim(),
                    website: form.hostWebsite.trim(),
                },
                whatYouLearn: form.whatYouLearn
                    .map((item) => item.trim())
                    .filter(Boolean),
                materialsProvided: form.materialsProvided
                    .map((item) => item.trim())
                    .filter(Boolean),
            };

            const response = await fetch("/api/admin/workshops", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify(payload),
            });
            const result = await response.json();
            if (!response.ok) {
                setSaveError(
                    result.error ||
                    "Unable to publish workshop. Confirm DB migration is applied."
                );
                return;
            }

            setSaved(true);
            await loadAdminWorkshops();
            setTimeout(() => {
                setSaved(false);
                setShowCreateForm(false);
                setForm({ ...emptyForm });
            }, 1200);
        } catch {
            setSaveError("Unable to publish workshop right now.");
        } finally {
            setSaving(false);
        }
    };

    const stats = [
        {
            label: "Active Workshops",
            value: adminStats?.activeWorkshops ?? adminWorkshops.length,
            change: loadingAdminWorkshops ? "Syncing..." : "Live from database",
        },
        { label: "Total Seats Booked", value: adminStats?.totalBookedSeats ?? 0, change: "Confirmed bookings" },
        {
            label: "Revenue (Actual)",
            value: formatCurrency(adminStats?.revenue ?? 0),
            change: "From paid bookings",
        },
        { label: "Avg Rating", value: adminStats?.avgRating ?? "–", change: adminStats ? `From ${adminStats.activeWorkshops} workshops` : "Loading..." },
    ];

    if (loading || !user || adminRoleLoading) {
        return (
            <main className="min-h-screen flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-terracotta" />
            </main>
        );
    }

    if (!isAdmin) {
        return (
            <main className="min-h-screen bg-cream">
                <Navbar />
                <div className="pt-28 pb-16 section-padding text-center">
                    <h1 className="heading-lg mb-3">Admin access required</h1>
                    <p className="text-body text-dark-muted mb-8">
                        Your account does not have the admin role yet.
                    </p>
                    <button onClick={() => router.push("/")} className="btn-primary">
                        Go to Home
                    </button>
                </div>
                <Footer />
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-cream">
            <Navbar />

            <div className="pt-20 flex">
                {/* Sidebar */}
                <aside className="hidden lg:block w-64 bg-white border-r border-gray-100 min-h-[calc(100vh-80px)] p-6 sticky top-20">
                    <h2 className="font-playfair text-lg font-bold text-dark mb-6">Admin Panel</h2>
                    <nav className="space-y-1">
                        {sidebarItems.map((item) => (
                            <button
                                key={item.id}
                                onClick={() => { setActiveTab(item.id); setShowCreateForm(false); }}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-inter font-medium transition-all ${activeTab === item.id && !showCreateForm
                                    ? "bg-terracotta/10 text-terracotta"
                                    : "text-dark-muted hover:bg-cream-100"
                                    }`}
                            >
                                <item.icon className="w-4.5 h-4.5" />
                                {item.label}
                            </button>
                        ))}
                    </nav>
                    <button
                        onClick={() => setShowCreateForm(true)}
                        className="btn-primary w-full mt-8 text-sm"
                    >
                        <Plus className="w-4 h-4" />
                        Create Workshop
                    </button>
                </aside>

                {/* Main content */}
                <div className="flex-1 p-6 sm:p-8 lg:p-10 max-w-5xl">
                    <AnimatePresence mode="wait">
                        {showCreateForm ? (
                            <motion.div
                                key="form"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                            >
                                {/* Form header */}
                                <div className="flex items-center justify-between mb-8">
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={() => setShowCreateForm(false)}
                                            className="p-2 hover:bg-cream-100 rounded-xl transition-colors"
                                        >
                                            <ArrowLeft className="w-5 h-5 text-dark-muted" />
                                        </button>
                                        <div>
                                            <h1 className="heading-md">Create New Workshop</h1>
                                            <p className="text-sm font-inter text-dark-muted mt-0.5">Fill in all the details for your workshop</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-8">
                                    {/* ═══ BASIC INFO ═══ */}
                                    <section className="bg-white rounded-2xl p-6 shadow-soft">
                                        <h2 className="font-playfair text-lg font-semibold text-dark mb-5 flex items-center gap-2">
                                            <FileText className="w-5 h-5 text-terracotta" />
                                            Basic Information
                                        </h2>
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">Workshop Title *</label>
                                                <input
                                                    type="text"
                                                    value={form.title}
                                                    onChange={(e) => updateForm("title", e.target.value)}
                                                    placeholder="e.g. Intro to Pottery: Make Your Own Mug"
                                                    className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta transition-colors"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">Description *</label>
                                                <textarea
                                                    value={form.description}
                                                    onChange={(e) => updateForm("description", e.target.value)}
                                                    rows={5}
                                                    placeholder="Describe your workshop — what will attendees experience?"
                                                    className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta transition-colors resize-none"
                                                />
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">Category *</label>
                                                    <select
                                                        value={form.category}
                                                        onChange={(e) => updateForm("category", e.target.value)}
                                                        className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta transition-colors"
                                                    >
                                                        <option value="">Select category</option>
                                                        {categories.filter(c => c.id !== "trending").map((cat) => (
                                                            <option key={cat.id} value={cat.label}>{cat.icon} {cat.label}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">Price (₹) *</label>
                                                    <div className="relative">
                                                        <IndianRupee className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-muted" />
                                                        <input
                                                            type="number"
                                                            value={form.price}
                                                            onChange={(e) => updateForm("price", e.target.value)}
                                                            placeholder="1500"
                                                            className="w-full bg-cream-100 border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta transition-colors"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                                <div>
                                                    <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">Date *</label>
                                                    <input
                                                        type="date"
                                                        value={form.date}
                                                        onChange={(e) => updateForm("date", e.target.value)}
                                                        className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta transition-colors"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">Time *</label>
                                                    <input
                                                        type="time"
                                                        value={form.time}
                                                        onChange={(e) => updateForm("time", e.target.value)}
                                                        className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta transition-colors"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">Duration *</label>
                                                    <input
                                                        type="text"
                                                        value={form.duration}
                                                        onChange={(e) => updateForm("duration", e.target.value)}
                                                        placeholder="2 hours"
                                                        className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta transition-colors"
                                                    />
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                                <div>
                                                    <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">Location *</label>
                                                    <div className="relative">
                                                        <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-muted" />
                                                        <input
                                                            type="text"
                                                            value={form.location}
                                                            onChange={(e) => updateForm("location", e.target.value)}
                                                            placeholder="Studio name"
                                                            className="w-full bg-cream-100 border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta transition-colors"
                                                        />
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">City *</label>
                                                    <input
                                                        type="text"
                                                        value={form.city}
                                                        onChange={(e) => updateForm("city", e.target.value)}
                                                        placeholder="Pune"
                                                        className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta transition-colors"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">Max Seats *</label>
                                                    <div className="relative">
                                                        <Users className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-muted" />
                                                        <input
                                                            type="number"
                                                            value={form.maxSeats}
                                                            onChange={(e) => updateForm("maxSeats", e.target.value)}
                                                            placeholder="15"
                                                            className="w-full bg-cream-100 border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta transition-colors"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </section>

                                    {/* ═══ MEDIA ═══ */}
                                    <section className="bg-white rounded-2xl p-6 shadow-soft">
                                        <h2 className="font-playfair text-lg font-semibold text-dark mb-5 flex items-center gap-2">
                                            <ImagePlus className="w-5 h-5 text-terracotta" />
                                            Media
                                        </h2>
                                        <div className="space-y-5">
                                            {/* Cover image */}
                                            <div>
                                                <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">Cover Image URL</label>
                                                <input
                                                    type="url"
                                                    value={form.coverImage}
                                                    onChange={(e) => updateForm("coverImage", e.target.value)}
                                                    placeholder="https://your-r2-bucket.com/workshops/cover.jpg"
                                                    className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta transition-colors"
                                                />
                                                <p className="text-xs font-inter text-dark-muted mt-1">Recommended: 1200×800px, JPG or WebP</p>
                                            </div>

                                            {/* Gallery images */}
                                            <div>
                                                <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">Gallery Images</label>
                                                <div className="space-y-2">
                                                    {form.galleryImages.map((url, i) => (
                                                        <div key={i} className="flex gap-2">
                                                            <input
                                                                type="url"
                                                                value={url}
                                                                onChange={(e) => {
                                                                    const updated = [...form.galleryImages];
                                                                    updated[i] = e.target.value;
                                                                    updateForm("galleryImages", updated);
                                                                }}
                                                                placeholder="Image URL"
                                                                className="flex-1 bg-cream-100 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-inter text-dark outline-none focus:border-terracotta transition-colors"
                                                            />
                                                            <button
                                                                onClick={() => updateForm("galleryImages", form.galleryImages.filter((_, j) => j !== i))}
                                                                className="p-2.5 text-dark-muted hover:text-red-500 transition-colors"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                                <button
                                                    onClick={() => updateForm("galleryImages", [...form.galleryImages, ""])}
                                                    className="mt-2 text-sm font-inter font-medium text-terracotta hover:underline flex items-center gap-1"
                                                >
                                                    <Plus className="w-3.5 h-3.5" /> Add image
                                                </button>
                                            </div>

                                            {/* Video URL */}
                                            <div>
                                                <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">Video URL (Optional)</label>
                                                <div className="relative">
                                                    <Video className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-muted" />
                                                    <input
                                                        type="url"
                                                        value={form.videoUrl}
                                                        onChange={(e) => updateForm("videoUrl", e.target.value)}
                                                        placeholder="https://youtube.com/embed/... or Cloudflare Stream URL"
                                                        className="w-full bg-cream-100 border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta transition-colors"
                                                    />
                                                </div>
                                                <p className="text-xs font-inter text-dark-muted mt-1">Use YouTube embed URL or Cloudflare Stream URL</p>
                                            </div>
                                        </div>
                                    </section>

                                    {/* ═══ SOCIAL LINKS ═══ */}
                                    <section className="bg-white rounded-2xl p-6 shadow-soft">
                                        <h2 className="font-playfair text-lg font-semibold text-dark mb-5 flex items-center gap-2">
                                            <Globe className="w-5 h-5 text-terracotta" />
                                            Workshop Social Links
                                        </h2>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                            <div>
                                                <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">Instagram</label>
                                                <div className="relative">
                                                    <Instagram className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-muted" />
                                                    <input
                                                        type="url"
                                                        value={form.instagramLink}
                                                        onChange={(e) => updateForm("instagramLink", e.target.value)}
                                                        placeholder="https://instagram.com/..."
                                                        className="w-full bg-cream-100 border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta transition-colors"
                                                    />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">YouTube</label>
                                                <div className="relative">
                                                    <Youtube className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-muted" />
                                                    <input
                                                        type="url"
                                                        value={form.youtubeLink}
                                                        onChange={(e) => updateForm("youtubeLink", e.target.value)}
                                                        placeholder="https://youtube.com/..."
                                                        className="w-full bg-cream-100 border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta transition-colors"
                                                    />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">Website</label>
                                                <div className="relative">
                                                    <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-muted" />
                                                    <input
                                                        type="url"
                                                        value={form.websiteLink}
                                                        onChange={(e) => updateForm("websiteLink", e.target.value)}
                                                        placeholder="https://..."
                                                        className="w-full bg-cream-100 border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta transition-colors"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </section>

                                    {/* ═══ CREATOR INFO ═══ */}
                                    <section className="bg-white rounded-2xl p-6 shadow-soft">
                                        <h2 className="font-playfair text-lg font-semibold text-dark mb-5 flex items-center gap-2">
                                            <Users className="w-5 h-5 text-terracotta" />
                                            Creator / Host Information
                                        </h2>
                                        <div className="space-y-4">
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">Host Name *</label>
                                                    <input
                                                        type="text"
                                                        value={form.hostName}
                                                        onChange={(e) => updateForm("hostName", e.target.value)}
                                                        placeholder="Full name"
                                                        className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta transition-colors"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">Experience</label>
                                                    <input
                                                        type="text"
                                                        value={form.hostExperience}
                                                        onChange={(e) => updateForm("hostExperience", e.target.value)}
                                                        placeholder="e.g. 10+ years in ceramics"
                                                        className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta transition-colors"
                                                    />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">Host Bio *</label>
                                                <textarea
                                                    value={form.hostBio}
                                                    onChange={(e) => updateForm("hostBio", e.target.value)}
                                                    rows={3}
                                                    placeholder="Tell attendees about yourself and your expertise..."
                                                    className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta transition-colors resize-none"
                                                />
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                                <div>
                                                    <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">Host Instagram</label>
                                                    <div className="relative">
                                                        <Instagram className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-muted" />
                                                        <input
                                                            type="url"
                                                            value={form.hostInstagram}
                                                            onChange={(e) => updateForm("hostInstagram", e.target.value)}
                                                            placeholder="https://instagram.com/..."
                                                            className="w-full bg-cream-100 border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta transition-colors"
                                                        />
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">Host YouTube</label>
                                                    <div className="relative">
                                                        <Youtube className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-muted" />
                                                        <input
                                                            type="url"
                                                            value={form.hostYoutube}
                                                            onChange={(e) => updateForm("hostYoutube", e.target.value)}
                                                            placeholder="https://youtube.com/..."
                                                            className="w-full bg-cream-100 border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta transition-colors"
                                                        />
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">Host Website</label>
                                                    <div className="relative">
                                                        <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-muted" />
                                                        <input
                                                            type="url"
                                                            value={form.hostWebsite}
                                                            onChange={(e) => updateForm("hostWebsite", e.target.value)}
                                                            placeholder="https://..."
                                                            className="w-full bg-cream-100 border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta transition-colors"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </section>

                                    {/* ═══ WHAT YOU LEARN ═══ */}
                                    <section className="bg-white rounded-2xl p-6 shadow-soft">
                                        <h2 className="font-playfair text-lg font-semibold text-dark mb-5 flex items-center gap-2">
                                            <Check className="w-5 h-5 text-terracotta" />
                                            What Attendees Will Learn
                                        </h2>
                                        <div className="space-y-2">
                                            {form.whatYouLearn.map((item, i) => (
                                                <div key={i} className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={item}
                                                        onChange={(e) => updateListItem("whatYouLearn", i, e.target.value)}
                                                        placeholder={`Learning outcome ${i + 1}`}
                                                        className="flex-1 bg-cream-100 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-inter text-dark outline-none focus:border-terracotta transition-colors"
                                                    />
                                                    {form.whatYouLearn.length > 1 && (
                                                        <button
                                                            onClick={() => removeListItem("whatYouLearn", i)}
                                                            className="p-2.5 text-dark-muted hover:text-red-500 transition-colors"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                        <button
                                            onClick={() => addListItem("whatYouLearn")}
                                            className="mt-3 text-sm font-inter font-medium text-terracotta hover:underline flex items-center gap-1"
                                        >
                                            <Plus className="w-3.5 h-3.5" /> Add item
                                        </button>
                                    </section>

                                    {/* ═══ MATERIALS PROVIDED ═══ */}
                                    <section className="bg-white rounded-2xl p-6 shadow-soft">
                                        <h2 className="font-playfair text-lg font-semibold text-dark mb-5 flex items-center gap-2">
                                            <Check className="w-5 h-5 text-terracotta" />
                                            {"What's Included / Materials"}
                                        </h2>
                                        <div className="space-y-2">
                                            {form.materialsProvided.map((item, i) => (
                                                <div key={i} className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={item}
                                                        onChange={(e) => updateListItem("materialsProvided", i, e.target.value)}
                                                        placeholder={`Item ${i + 1}`}
                                                        className="flex-1 bg-cream-100 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-inter text-dark outline-none focus:border-terracotta transition-colors"
                                                    />
                                                    {form.materialsProvided.length > 1 && (
                                                        <button
                                                            onClick={() => removeListItem("materialsProvided", i)}
                                                            className="p-2.5 text-dark-muted hover:text-red-500 transition-colors"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                        <button
                                            onClick={() => addListItem("materialsProvided")}
                                            className="mt-3 text-sm font-inter font-medium text-terracotta hover:underline flex items-center gap-1"
                                        >
                                            <Plus className="w-3.5 h-3.5" /> Add item
                                        </button>
                                    </section>

                                    {/* ═══ SAVE ═══ */}
                                    <div className="bg-white rounded-2xl p-6 shadow-soft">
                                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                                            <div>
                                                <p className="text-sm font-inter text-dark-muted">
                                                    All fields marked with * are required
                                                </p>
                                                {saveError && (
                                                    <p className="text-sm font-inter text-red-600 mt-2">
                                                        {saveError}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="flex gap-3">
                                                <button
                                                    onClick={() => setShowCreateForm(false)}
                                                    className="btn-secondary"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    onClick={handleSave}
                                                    disabled={saving || !form.title || !form.category || !form.price || !form.hostName}
                                                    className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    {saving ? (
                                                        <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
                                                    ) : saved ? (
                                                        <><Check className="w-4 h-4" /> Saved!</>
                                                    ) : (
                                                        <>Publish Workshop</>
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="dashboard"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                            >
                                <div className="flex items-center justify-between mb-8">
                                    <div>
                                        <h1 className="heading-md">Dashboard</h1>
                                        <p className="text-sm font-inter text-dark-muted mt-0.5">Manage your workshops and track performance</p>
                                    </div>
                                    <button
                                        onClick={() => setShowCreateForm(true)}
                                        className="btn-primary text-sm lg:hidden"
                                    >
                                        <Plus className="w-4 h-4" />
                                        Create
                                    </button>
                                </div>

                                {/* Stats */}
                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                                    {stats.map((stat) => (
                                        <div key={stat.label} className="bg-white rounded-2xl p-5 shadow-soft">
                                            <p className="text-xs font-inter font-bold text-dark-muted uppercase tracking-wider mb-1">{stat.label}</p>
                                            <p className="font-playfair text-2xl font-bold text-dark">{stat.value}</p>
                                            <p className="text-xs font-inter text-emerald-600 mt-1">{stat.change}</p>
                                        </div>
                                    ))}
                                </div>

                                {/* Workshop list */}
                                <div className="bg-white rounded-2xl shadow-soft overflow-hidden">
                                    <div className="px-6 py-4 border-b border-gray-100">
                                        <h3 className="font-playfair text-lg font-semibold text-dark">Your Workshops</h3>
                                    </div>
                                    <div className="divide-y divide-gray-50">
                                        {adminWorkshops.slice(0, 8).map((ws) => (
                                            <div key={ws.id} className="px-6 py-4 flex items-center gap-4 hover:bg-cream-100/50 transition-colors">
                                                <div className="relative w-16 h-16 rounded-xl overflow-hidden flex-shrink-0">
                                                    <Image src={ws.coverImage} alt={ws.title} fill className="object-cover" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="text-sm font-inter font-semibold text-dark truncate">{ws.title}</h4>
                                                    <p className="text-xs font-inter text-dark-muted mt-0.5">{ws.date} · {ws.location}</p>
                                                </div>
                                                <div className="text-right hidden sm:block">
                                                    <p className="text-sm font-inter font-bold text-dark">{formatCurrency(ws.price)}</p>
                                                    <p className="text-xs font-inter text-dark-muted">{ws.seatsRemaining}/{ws.maxSeats} seats left</p>
                                                </div>
                                                <span className={`text-xs font-inter font-bold px-2.5 py-1 rounded-full ${ws.seatsRemaining <= 3 ? "bg-terracotta/10 text-terracotta" : "bg-emerald-100 text-emerald-700"}`}>
                                                    {ws.seatsRemaining <= 3 ? "Almost Full" : "Active"}
                                                </span>
                                            </div>
                                        ))}
                                        {adminWorkshops.length === 0 && (
                                            <div className="px-6 py-10 text-sm font-inter text-dark-muted text-center">
                                                No workshops found in the database yet.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            <Footer />
        </main>
    );
}
