"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import MobileNav from "@/components/MobileNav";
import {
    MapPin,
    Users,
    ShieldCheck,
    TrendingUp,
    Sparkles,
    ArrowRight,
    Loader2,
    Send,
} from "lucide-react";
import { submitHostApplication, toApiErrorMessage } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";

const benefits = [
    {
        icon: TrendingUp,
        title: "Monetize Idle Hours",
        description:
            "Turn your empty floor time into steady income by hosting high-quality, pre-vetted workshops.",
    },
    {
        icon: Users,
        title: "Reach a New Audience",
        description:
            "Expose your cafe or studio to hundreds of targeted local creatives who will discover your brand.",
    },
    {
        icon: ShieldCheck,
        title: "Fully Managed",
        description:
            "We handle the ticketing, payments, marketing, and host coordination. You just provide the space.",
    },
    {
        icon: Sparkles,
        title: "Curated Experiences",
        description:
            "Only premium, hands-on, and highly rated experiences perfectly matched for your venue vibe.",
    },
];

export default function ListYourSpacePage() {
    const router = useRouter();
    const { user, session, loading, role, roleLoading } = useAuth();

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [ownerName, setOwnerName] = useState("");
    const [ownerPhone, setOwnerPhone] = useState("");
    const [bio, setBio] = useState("");
    const [portfolioUrl, setPortfolioUrl] = useState("");
    const [location, setLocation] = useState("");
    const [capacity, setCapacity] = useState("");
    const [spaceType, setSpaceType] = useState("");

    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [message, setMessage] = useState<string>("");
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!user) return;
        const fullName = String(user.user_metadata?.full_name || "").trim();
        setOwnerName((prev) => prev || fullName);
        setEmail((prev) => prev || user.email || "");
    }, [user]);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null);

        if (!user || !session?.access_token) {
            router.push(`/auth/login?redirect=${encodeURIComponent("/list-your-space")}`);
            return;
        }

        setSubmitting(true);
        try {
            const result = await submitHostApplication(session.access_token, {
                name: name.trim(),
                email: email.trim(),
                bio: bio.trim(),
                portfolioUrl: portfolioUrl.trim(),
                applicationType: "space",
                details: {
                    location: location.trim(),
                    capacity: capacity.trim(),
                    ownerName: ownerName.trim(),
                    ownerPhone: ownerPhone.trim(),
                    spaceType: spaceType.trim(),
                },
            });
            setMessage(result.message || "Venue application submitted.");
            setSubmitted(true);
        } catch (submitError) {
            setError(toApiErrorMessage(submitError, "Unable to submit application right now."));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <main className="min-h-screen bg-cream selection:bg-terracotta/20 selection:text-dark">
            <Navbar />

            {/* Hero Section */}
            <section className="pt-32 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto flex flex-col items-center text-center">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-clay/10 text-terracotta font-inter text-sm font-semibold mb-6">
                    <MapPin className="w-4 h-4" />
                    For Studios, Spaces & Cafes
                </div>
                <h1 className="font-playfair text-4xl sm:text-6xl md:text-7xl font-bold text-dark tracking-tight mb-8">
                    Turn your Space into a <br className="hidden md:block" />
                    <span className="text-terracotta relative inline-block">
                        Creative Hub
                        <svg
                            className="absolute w-full h-3 -bottom-1 left-0 text-terracotta/30"
                            viewBox="0 0 100 10"
                            preserveAspectRatio="none"
                        >
                            <path
                                d="M0 5 Q 50 10 100 5"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3"
                            />
                        </svg>
                    </span>
                </h1>
                <p className="max-w-2xl mx-auto text-lg sm:text-xl font-inter text-dark-muted mb-10 text-balance leading-relaxed">
                    Partner with Only Workshops to bring vibrant, hands-on experiences to your
                    venue. Monetize your down-time and introduce your brand to a passionate local
                    community.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    <a
                        href="#apply"
                        className="btn-primary !px-8 !py-4 text-lg inline-flex items-center justify-center gap-2 group"
                    >
                        List Your Space
                        <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </a>
                </div>
            </section>

            {/* Benefits Grid */}
            <section className="bg-white py-24 border-y border-clay/20">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center max-w-2xl mx-auto mb-16">
                        <h2 className="font-playfair text-3xl sm:text-4xl font-bold text-dark mb-4">
                            Why Partner With Us?
                        </h2>
                        <p className="font-inter text-dark-muted">
                            Join a trusted network of venues transforming their businesses with
                            unique experiential events.
                        </p>
                    </div>

                    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
                        {benefits.map((benefit, idx) => {
                            const Icon = benefit.icon;
                            return (
                                <div
                                    key={idx}
                                    className="bg-cream-50 rounded-3xl p-8 border border-clay/30 hover:shadow-soft transition-all duration-300"
                                >
                                    <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center mb-6 text-terracotta border border-clay/30">
                                        <Icon className="w-6 h-6" />
                                    </div>
                                    <h3 className="font-playfair font-bold text-xl text-dark mb-3">
                                        {benefit.title}
                                    </h3>
                                    <p className="font-inter text-dark-muted text-sm leading-relaxed">
                                        {benefit.description}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* Application Form */}
            <section id="apply" className="py-24 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="bg-white rounded-3xl border border-clay/20 shadow-soft p-8 sm:p-12">
                    <div className="text-center mb-10">
                        <h2 className="font-playfair text-3xl sm:text-4xl font-bold text-dark mb-4">
                            Apply to become a Partner
                        </h2>
                        <p className="font-inter text-dark-muted">
                            Submit your details to explore a workshop partnership.
                        </p>
                    </div>

                    {loading || roleLoading ? (
                        <div className="flex justify-center py-10">
                            <Loader2 className="w-8 h-8 animate-spin text-terracotta" />
                        </div>
                    ) : (
                        <>
                            {!user && (
                                <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-inter text-amber-900 text-center">
                                    Please{" "}
                                    <Link
                                        href={`/auth/login?redirect=${encodeURIComponent("/list-your-space")}`}
                                        className="font-bold underline"
                                    >
                                        sign in
                                    </Link>{" "}
                                    to submit your venue application.
                                </div>
                            )}

                            {role === "host" && (
                                <div className="mb-8 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-inter text-emerald-800 text-center">
                                    Your account is already approved as a host or venue partner!
                                </div>
                            )}

                            {submitted ? (
                                <div className="space-y-6 text-center py-8">
                                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 mb-2">
                                        <ShieldCheck className="w-8 h-8" />
                                    </div>
                                    <h3 className="font-playfair text-2xl font-bold text-dark">
                                        {message}
                                    </h3>
                                    <p className="text-dark-muted font-inter max-w-md mx-auto">
                                        Thank you for your interest! Our team will review your venue
                                        details and get back to you shortly to discuss next steps.
                                    </p>
                                    <div className="pt-4">
                                        <Link href="/" className="btn-primary !py-3 !px-8">
                                            Return Home
                                        </Link>
                                    </div>
                                </div>
                            ) : (
                                <form onSubmit={handleSubmit} className="space-y-6">
                                    {error && (
                                        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-inter text-red-700">
                                            {error}
                                        </div>
                                    )}

                                    <div className="grid sm:grid-cols-2 gap-6">
                                        <div>
                                            <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                                Venue Name{" "}
                                                <span className="text-terracotta">*</span>
                                            </label>
                                            <input
                                                value={name}
                                                onChange={(event) => setName(event.target.value)}
                                                required
                                                minLength={2}
                                                maxLength={120}
                                                placeholder="The Creative Studio"
                                                className="w-full bg-cream-50 border border-clay/30 rounded-xl px-4 py-3.5 text-sm font-inter text-dark outline-none focus:border-terracotta transition-colors"
                                            />
                                        </div>

                                        <div>
                                            <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                                Contact Email{" "}
                                                <span className="text-terracotta">*</span>
                                            </label>
                                            <input
                                                type="email"
                                                value={email}
                                                onChange={(event) => setEmail(event.target.value)}
                                                required
                                                placeholder="hello@yourvenue.com"
                                                className="w-full bg-cream-50 border border-clay/30 rounded-xl px-4 py-3.5 text-sm font-inter text-dark outline-none focus:border-terracotta transition-colors"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid sm:grid-cols-2 gap-6">
                                        <div>
                                            <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                                Owner Name{" "}
                                                <span className="text-terracotta">*</span>
                                            </label>
                                            <input
                                                value={ownerName}
                                                onChange={(event) =>
                                                    setOwnerName(event.target.value)
                                                }
                                                required
                                                minLength={2}
                                                maxLength={120}
                                                placeholder="Your full name"
                                                className="w-full bg-cream-50 border border-clay/30 rounded-xl px-4 py-3.5 text-sm font-inter text-dark outline-none focus:border-terracotta transition-colors"
                                            />
                                        </div>
                                        <div>
                                            <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                                Owner Mobile Number{" "}
                                                <span className="text-terracotta">*</span>
                                            </label>
                                            <input
                                                type="tel"
                                                value={ownerPhone}
                                                onChange={(event) =>
                                                    setOwnerPhone(event.target.value)
                                                }
                                                required
                                                placeholder="+91 9XXXX XXXXX"
                                                className="w-full bg-cream-50 border border-clay/30 rounded-xl px-4 py-3.5 text-sm font-inter text-dark outline-none focus:border-terracotta transition-colors"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid sm:grid-cols-2 gap-6">
                                        <div>
                                            <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                                Location / City{" "}
                                                <span className="text-terracotta">*</span>
                                            </label>
                                            <input
                                                value={location}
                                                onChange={(event) =>
                                                    setLocation(event.target.value)
                                                }
                                                required
                                                placeholder="e.g. Bandra West, Mumbai"
                                                className="w-full bg-cream-50 border border-clay/30 rounded-xl px-4 py-3.5 text-sm font-inter text-dark outline-none focus:border-terracotta transition-colors"
                                            />
                                        </div>

                                        <div>
                                            <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                                Max Seating Capacity{" "}
                                                <span className="text-terracotta">*</span>
                                            </label>
                                            <input
                                                type="number"
                                                value={capacity}
                                                onChange={(event) =>
                                                    setCapacity(event.target.value)
                                                }
                                                required
                                                min="1"
                                                placeholder="e.g. 25"
                                                className="w-full bg-cream-50 border border-clay/30 rounded-xl px-4 py-3.5 text-sm font-inter text-dark outline-none focus:border-terracotta transition-colors"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                            Space Type <span className="text-terracotta">*</span>
                                        </label>
                                        <select
                                            value={spaceType}
                                            onChange={(event) => setSpaceType(event.target.value)}
                                            required
                                            className="w-full bg-cream-50 border border-clay/30 rounded-xl px-4 py-3.5 text-sm font-inter text-dark outline-none focus:border-terracotta transition-colors"
                                        >
                                            <option value="">Select type</option>
                                            <option value="Cafe">Cafe</option>
                                            <option value="Restaurant">Restaurant</option>
                                            <option value="Studio">Studio</option>
                                            <option value="Flea Market">Flea Market</option>
                                            <option value="School Events">School Events</option>
                                            <option value="College Fest">College Fest</option>
                                            <option value="Birthday Events">Birthday Events</option>
                                            <option value="Corporate Experiences">
                                                Corporate Experiences
                                            </option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                            Space Description{" "}
                                            <span className="text-terracotta">*</span>
                                        </label>
                                        <textarea
                                            value={bio}
                                            onChange={(event) => setBio(event.target.value)}
                                            required
                                            minLength={20}
                                            maxLength={4000}
                                            rows={5}
                                            placeholder="Tell us about the vibe of your space, available amenities (Wi-Fi, AC, projectors), and parking availability."
                                            className="w-full bg-cream-50 border border-clay/30 rounded-xl px-4 py-3.5 text-sm font-inter text-dark outline-none focus:border-terracotta resize-y transition-colors"
                                        />
                                    </div>

                                    <div>
                                        <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                            Website or Instagram
                                        </label>
                                        <input
                                            type="url"
                                            value={portfolioUrl}
                                            onChange={(event) =>
                                                setPortfolioUrl(event.target.value)
                                            }
                                            placeholder="https://instagram.com/yourvenue"
                                            className="w-full bg-cream-50 border border-clay/30 rounded-xl px-4 py-3.5 text-sm font-inter text-dark outline-none focus:border-terracotta transition-colors"
                                        />
                                    </div>

                                    <div className="pt-2">
                                        <button
                                            type="submit"
                                            disabled={submitting || role === "host" || !user}
                                            className="btn-primary w-full !py-4 text-base disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                        >
                                            {submitting ? (
                                                <>
                                                    <Loader2 className="w-5 h-5 animate-spin" />
                                                    Submitting...
                                                </>
                                            ) : (
                                                <>
                                                    <Send className="w-5 h-5" />
                                                    Submit Venue Application
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </form>
                            )}
                        </>
                    )}
                </div>
            </section>

            <Footer />
            <MobileNav />
        </main>
    );
}
