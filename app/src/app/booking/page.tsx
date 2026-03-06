"use client";

import { useState, useEffect, Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
    ArrowLeft,
    Calendar,
    Clock,
    MapPin,
    Users,
    Shield,
    CreditCard,
    Check,
    Star,
    Loader2,
    Instagram,
    Youtube,
    Globe,
    Play,
    Lock,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { mockWorkshops } from "@/lib/data";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

function BookingContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user, loading } = useAuth();

    const workshopId = searchParams.get("workshop") || "1";
    const guestsParam = parseInt(searchParams.get("guests") || "2");
    const workshop = mockWorkshops.find((w) => w.id === workshopId) || mockWorkshops[0];

    const [step, setStep] = useState(1);
    const [guests] = useState(guestsParam);
    const [formData, setFormData] = useState({
        firstName: "",
        lastName: "",
        email: user?.email || "",
        phone: "",
        notes: "",
    });
    const [submitting, setSubmitting] = useState(false);

    const serviceFee = 99;
    const subtotal = workshop.price * guests;
    const total = subtotal + serviceFee;

    // Redirect to login if not authenticated
    useEffect(() => {
        if (!loading && !user) {
            router.push(`/auth/login?redirect=/booking?workshop=${workshopId}&guests=${guests}`);
        }
    }, [loading, user, router, workshopId, guests]);

    // Pre-fill email when user loads
    useEffect(() => {
        if (user?.email) {
            setFormData((prev) => ({ ...prev, email: user.email || "" }));
        }
        if (user?.user_metadata?.full_name) {
            const parts = user.user_metadata.full_name.split(" ");
            setFormData((prev) => ({
                ...prev,
                firstName: parts[0] || "",
                lastName: parts.slice(1).join(" ") || "",
            }));
        }
    }, [user]);

    const handleSubmit = async () => {
        setSubmitting(true);
        // Simulate payment processing
        await new Promise((r) => setTimeout(r, 2000));
        setStep(3);
        setSubmitting(false);
    };

    if (loading || !user) {
        return (
            <main className="min-h-screen flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-terracotta" />
            </main>
        );
    }

    // Success step
    if (step === 3) {
        return (
            <main className="min-h-screen bg-cream">
                <Navbar />
                <div className="pt-28 pb-16 section-padding">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="max-w-lg mx-auto text-center"
                    >
                        <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                            <Check className="w-10 h-10 text-emerald-600" />
                        </div>
                        <h1 className="heading-lg mb-3">Booking Confirmed!</h1>
                        <p className="text-body text-dark-muted mb-2">
                            Your spot at <strong>{workshop.title}</strong> has been reserved.
                        </p>
                        <p className="text-sm font-inter text-dark-muted mb-8">
                            Confirmation details have been sent to <strong>{formData.email}</strong>
                        </p>
                        <div className="bg-white rounded-2xl p-6 shadow-soft mb-8 text-left">
                            <div className="flex gap-4 mb-4">
                                <div className="relative w-20 h-20 rounded-xl overflow-hidden flex-shrink-0">
                                    <Image src={workshop.coverImage} alt={workshop.title} fill className="object-cover" />
                                </div>
                                <div>
                                    <h3 className="font-playfair font-semibold text-dark">{workshop.title}</h3>
                                    <p className="text-sm font-inter text-dark-muted mt-1">{formatDate(workshop.date)} · {workshop.time}</p>
                                    <p className="text-sm font-inter text-dark-muted">{guests} guests · {formatCurrency(total)}</p>
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-3 justify-center">
                            <Link href="/dashboard" className="btn-primary">
                                View My Bookings
                            </Link>
                            <Link href="/explore" className="btn-secondary">
                                Explore More
                            </Link>
                        </div>
                    </motion.div>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-cream">
            <Navbar />

            <div className="pt-24 pb-16 section-padding">
                {/* Back link */}
                <Link
                    href={`/workshop/${workshop.id}`}
                    className="inline-flex items-center gap-2 text-sm font-inter text-dark-muted hover:text-terracotta transition-colors mb-6"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back to workshop
                </Link>

                {/* Steps indicator */}
                <div className="flex items-center gap-3 mb-8">
                    {["Guest Info", "Confirm & Pay"].map((label, i) => (
                        <div key={label} className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-inter font-bold ${step > i + 1 ? "bg-emerald-500 text-white" : step === i + 1 ? "bg-terracotta text-white" : "bg-gray-200 text-dark-muted"}`}>
                                {step > i + 1 ? <Check className="w-4 h-4" /> : i + 1}
                            </div>
                            <span className={`text-sm font-inter font-medium ${step === i + 1 ? "text-dark" : "text-dark-muted"}`}>
                                {label}
                            </span>
                            {i < 1 && <div className="w-12 h-px bg-gray-200" />}
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[1fr,400px] gap-8 lg:gap-12">
                    {/* Left - Form */}
                    <div>
                        {step === 1 && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                <h2 className="heading-sm mb-6">Guest Information</h2>
                                <div className="bg-white rounded-2xl p-6 shadow-soft space-y-5">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">First Name</label>
                                            <input
                                                type="text"
                                                value={formData.firstName}
                                                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                                                required
                                                className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta transition-colors"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">Last Name</label>
                                            <input
                                                type="text"
                                                value={formData.lastName}
                                                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                                                required
                                                className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta transition-colors"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">Email</label>
                                        <input
                                            type="email"
                                            value={formData.email}
                                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                            required
                                            className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta transition-colors"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">Phone Number</label>
                                        <input
                                            type="tel"
                                            value={formData.phone}
                                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                            placeholder="+91 XXXXXXXXXX"
                                            className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta transition-colors"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">Special Requests (Optional)</label>
                                        <textarea
                                            value={formData.notes}
                                            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                            rows={3}
                                            placeholder="Any dietary restrictions, allergies, or special needs?"
                                            className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta transition-colors resize-none"
                                        />
                                    </div>
                                </div>
                                <button
                                    onClick={() => setStep(2)}
                                    disabled={!formData.firstName || !formData.lastName || !formData.email}
                                    className="btn-primary w-full sm:w-auto !py-3.5 !px-8 mt-6 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Continue to Payment
                                </button>
                            </motion.div>
                        )}

                        {step === 2 && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                <h2 className="heading-sm mb-6">Confirm & Pay</h2>
                                <div className="bg-white rounded-2xl p-6 shadow-soft space-y-5">
                                    <div>
                                        <h3 className="text-sm font-inter font-bold text-dark mb-3">Booking Details</h3>
                                        <div className="space-y-2 text-sm font-inter">
                                            <div className="flex justify-between"><span className="text-dark-muted">Name</span><span className="text-dark font-medium">{formData.firstName} {formData.lastName}</span></div>
                                            <div className="flex justify-between"><span className="text-dark-muted">Email</span><span className="text-dark font-medium">{formData.email}</span></div>
                                            {formData.phone && <div className="flex justify-between"><span className="text-dark-muted">Phone</span><span className="text-dark font-medium">{formData.phone}</span></div>}
                                        </div>
                                    </div>
                                    <hr className="border-gray-100" />
                                    <div>
                                        <h3 className="text-sm font-inter font-bold text-dark mb-3">Payment</h3>
                                        <p className="text-sm font-inter text-dark-muted mb-4">You will be redirected to a secure payment page after confirming.</p>
                                        <div className="flex items-center gap-2 bg-cream-100 rounded-xl px-4 py-3">
                                            <Shield className="w-5 h-5 text-emerald-600" />
                                            <span className="text-sm font-inter text-dark-secondary">256-bit SSL encrypted payment</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-3 mt-6">
                                    <button onClick={() => setStep(1)} className="btn-secondary">Back</button>
                                    <button
                                        onClick={handleSubmit}
                                        disabled={submitting}
                                        className="btn-primary !py-3.5 !px-8 disabled:opacity-60"
                                    >
                                        {submitting ? (
                                            <><Loader2 className="w-5 h-5 animate-spin" /> Processing...</>
                                        ) : (
                                            <>Confirm & Pay {formatCurrency(total)}</>
                                        )}
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </div>

                    {/* Right - Order Summary Sidebar */}
                    <div className="hidden lg:block">
                        <div className="sticky top-28 bg-white rounded-2xl shadow-soft p-6 border border-gray-100">
                            <h3 className="text-sm font-inter font-bold text-dark-muted uppercase tracking-wider mb-4">Order Summary</h3>

                            {/* Workshop preview */}
                            <div className="flex gap-3 mb-4">
                                <div className="relative w-24 h-24 rounded-xl overflow-hidden flex-shrink-0">
                                    <Image src={workshop.coverImage} alt={workshop.title} fill className="object-cover" />
                                    {workshop.videoUrl && (
                                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                            <Play className="w-6 h-6 text-white" />
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <h4 className="font-playfair font-semibold text-dark text-sm leading-tight">{workshop.title}</h4>
                                    <div className="flex items-center gap-1 mt-1">
                                        <Star className="w-3 h-3 text-terracotta fill-terracotta" />
                                        <span className="text-xs font-inter font-semibold text-dark">{workshop.rating}</span>
                                        <span className="text-xs font-inter text-dark-muted">({workshop.reviewCount})</span>
                                    </div>
                                </div>
                            </div>

                            {/* Creator info */}
                            <div className="flex items-center gap-3 py-3 border-t border-gray-100">
                                <div className="relative w-8 h-8 rounded-full overflow-hidden">
                                    <Image src={workshop.hostAvatar} alt={workshop.hostName} fill className="object-cover" />
                                </div>
                                <div>
                                    <p className="text-xs font-inter font-semibold text-dark">{workshop.hostName}</p>
                                    {workshop.hostExperience && (
                                        <p className="text-[10px] font-inter text-dark-muted">{workshop.hostExperience}</p>
                                    )}
                                </div>
                                {/* Creator social links */}
                                <div className="ml-auto flex gap-1">
                                    {workshop.hostSocialLinks?.instagram && (
                                        <a href={workshop.hostSocialLinks.instagram} target="_blank" rel="noopener noreferrer" className="p-1.5 hover:bg-cream-100 rounded-md transition-colors">
                                            <Instagram className="w-3.5 h-3.5 text-dark-muted" />
                                        </a>
                                    )}
                                    {workshop.hostSocialLinks?.youtube && (
                                        <a href={workshop.hostSocialLinks.youtube} target="_blank" rel="noopener noreferrer" className="p-1.5 hover:bg-cream-100 rounded-md transition-colors">
                                            <Youtube className="w-3.5 h-3.5 text-dark-muted" />
                                        </a>
                                    )}
                                    {workshop.hostSocialLinks?.website && (
                                        <a href={workshop.hostSocialLinks.website} target="_blank" rel="noopener noreferrer" className="p-1.5 hover:bg-cream-100 rounded-md transition-colors">
                                            <Globe className="w-3.5 h-3.5 text-dark-muted" />
                                        </a>
                                    )}
                                </div>
                            </div>

                            {/* Details */}
                            <div className="space-y-3 py-4 border-t border-gray-100">
                                <div className="flex items-center gap-2 text-sm font-inter text-dark-secondary">
                                    <Calendar className="w-4 h-4 text-dark-muted" />
                                    {formatDate(workshop.date)} · {workshop.time}
                                </div>
                                <div className="flex items-center gap-2 text-sm font-inter text-dark-secondary">
                                    <Clock className="w-4 h-4 text-dark-muted" />
                                    {workshop.duration}
                                </div>
                                <div className="flex items-center gap-2 text-sm font-inter text-dark-secondary">
                                    <MapPin className="w-4 h-4 text-dark-muted" />
                                    {workshop.location}, {workshop.city}
                                </div>
                                <div className="flex items-center gap-2 text-sm font-inter text-dark-secondary">
                                    <Users className="w-4 h-4 text-dark-muted" />
                                    {guests} guests
                                </div>
                            </div>

                            {/* Workshop social links */}
                            {workshop.socialLinks && (
                                <div className="flex gap-2 py-3 border-t border-gray-100">
                                    {workshop.socialLinks.instagram && (
                                        <a href={workshop.socialLinks.instagram} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs font-inter text-dark-muted hover:text-terracotta transition-colors bg-cream-100 px-2 py-1 rounded-lg">
                                            <Instagram className="w-3 h-3" /> Instagram
                                        </a>
                                    )}
                                    {workshop.socialLinks.youtube && (
                                        <a href={workshop.socialLinks.youtube} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs font-inter text-dark-muted hover:text-terracotta transition-colors bg-cream-100 px-2 py-1 rounded-lg">
                                            <Youtube className="w-3 h-3" /> YouTube
                                        </a>
                                    )}
                                </div>
                            )}

                            {/* Pricing */}
                            <div className="space-y-2 pt-4 border-t border-gray-100">
                                <div className="flex justify-between text-sm font-inter">
                                    <span className="text-dark-secondary">{formatCurrency(workshop.price)} × {guests} guests</span>
                                    <span className="text-dark font-medium">{formatCurrency(subtotal)}</span>
                                </div>
                                <div className="flex justify-between text-sm font-inter">
                                    <span className="text-dark-secondary">Service fee</span>
                                    <span className="text-dark font-medium">{formatCurrency(serviceFee)}</span>
                                </div>
                                <div className="flex justify-between text-base font-inter font-bold pt-3 border-t border-gray-100">
                                    <span className="text-dark">Total</span>
                                    <span className="text-dark">{formatCurrency(total)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <Footer />
        </main>
    );
}

export default function BookingPage() {
    return (
        <Suspense fallback={
            <main className="min-h-screen flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-terracotta" />
            </main>
        }>
            <BookingContent />
        </Suspense>
    );
}
