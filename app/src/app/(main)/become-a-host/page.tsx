"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Send } from "lucide-react";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import { submitHostApplication, toApiErrorMessage } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";

export default function BecomeAHostPage() {
    const router = useRouter();
    const { user, session, loading, role, roleLoading } = useAuth();

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [bio, setBio] = useState("");
    const [portfolioUrl, setPortfolioUrl] = useState("");
    const [location, setLocation] = useState("");
    const [expertise, setExpertise] = useState("");
    const [instagram, setInstagram] = useState("");
    const [youtube, setYoutube] = useState("");
    const [website, setWebsite] = useState("");

    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [message, setMessage] = useState<string>("");
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!user) return;

        const fullName = String(user.user_metadata?.full_name || "").trim();
        setName((prev) => prev || fullName);
        setEmail((prev) => prev || user.email || "");
    }, [user]);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null);

        if (!user || !session?.access_token) {
            router.push(`/auth/login?redirect=${encodeURIComponent("/become-a-host")}`);
            return;
        }

        setSubmitting(true);
        try {
            const result = await submitHostApplication(session.access_token, {
                name: name.trim(),
                email: email.trim(),
                bio: bio.trim(),
                portfolioUrl: portfolioUrl.trim(),
                applicationType: "creator",
                details: {
                    expertise: expertise.trim(),
                    location: location.trim(),
                    phone: phone.trim(),
                    socialLinks: {
                        instagram: instagram.trim(),
                        youtube: youtube.trim(),
                        website: website.trim(),
                    },
                },
            });
            setMessage(result.message || "Application submitted.");
            setSubmitted(true);
        } catch (submitError) {
            setError(toApiErrorMessage(submitError, "Unable to submit application right now."));
        } finally {
            setSubmitting(false);
        }
    };

    if (loading || roleLoading) {
        return (
            <main className="min-h-screen flex items-center justify-center bg-cream">
                <Loader2 className="w-8 h-8 animate-spin text-terracotta" />
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-cream text-dark">
            <Navbar />

            <section className="pt-28 pb-16 section-padding">
                <div className="max-w-2xl mx-auto">
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 text-sm font-inter text-dark-muted hover:text-terracotta transition-colors mb-6"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back to Home
                    </Link>

                    <div className="bg-white rounded-2xl border border-gray-200 shadow-soft p-6 sm:p-8">
                        <h1 className="heading-sm mb-2">Become a Host</h1>
                        <p className="text-body text-dark-muted mb-8">
                            Apply to host workshops and start earning from your sessions. Share
                            detailed info, social links, and availability so we can review faster.
                        </p>

                        {!user && (
                            <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-inter text-amber-900">
                                Sign in to submit your host application.
                            </div>
                        )}

                        {role === "host" && (
                            <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-inter text-emerald-800">
                                Your account is already approved as a host. You can track payouts
                                from your earnings dashboard.
                            </div>
                        )}

                        {submitted ? (
                            <div className="space-y-4">
                                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm font-inter text-emerald-800">
                                    {message}
                                </div>
                                <p className="text-sm font-inter text-dark-muted">
                                    Our team will review your details and approve or reject your
                                    application from the admin dashboard.
                                </p>
                                <div className="flex flex-wrap gap-3">
                                    <Link href="/" className="btn-primary !py-3 !px-5 text-sm">
                                        Return Home
                                    </Link>
                                    <Link
                                        href="/profile"
                                        className="btn-secondary !py-3 !px-5 text-sm"
                                    >
                                        Go to Profile
                                    </Link>
                                </div>
                            </div>
                        ) : (
                            <form onSubmit={handleSubmit} className="space-y-5">
                                {error && (
                                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-inter text-red-700">
                                        {error}
                                    </div>
                                )}

                                <div>
                                    <label className="mb-1.5 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                        Full Name
                                    </label>
                                    <input
                                        value={name}
                                        onChange={(event) => setName(event.target.value)}
                                        required
                                        minLength={2}
                                        maxLength={120}
                                        placeholder="Your full name"
                                        className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta"
                                    />
                                </div>

                                <div>
                                    <label className="mb-1.5 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                        Email Address
                                    </label>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(event) => setEmail(event.target.value)}
                                        required
                                        placeholder="you@example.com"
                                        className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta"
                                    />
                                </div>

                                <div>
                                    <label className="mb-1.5 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                        Mobile Number
                                    </label>
                                    <input
                                        type="tel"
                                        value={phone}
                                        onChange={(event) => setPhone(event.target.value)}
                                        required
                                        placeholder="+91 98765 43210"
                                        className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta"
                                    />
                                </div>

                                <div>
                                    <label className="mb-1.5 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                        Field of Expertise
                                    </label>
                                    <input
                                        value={expertise}
                                        onChange={(event) => setExpertise(event.target.value)}
                                        required
                                        placeholder="e.g., Pottery, Digital Marketing, Yoga"
                                        className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta"
                                    />
                                </div>

                                <div>
                                    <label className="mb-1.5 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                        Where are you based at ?
                                    </label>
                                    <input
                                        value={location}
                                        onChange={(event) => setLocation(event.target.value)}
                                        required
                                        placeholder="e.g., Andheri West, Mumbai"
                                        className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta"
                                    />
                                </div>

                                <div>
                                    <label className="mb-1.5 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                        Experience & Bio
                                    </label>
                                    <textarea
                                        value={bio}
                                        onChange={(event) => setBio(event.target.value)}
                                        required
                                        minLength={20}
                                        maxLength={4000}
                                        rows={6}
                                        placeholder="Describe your background, workshop topics, and teaching style."
                                        className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta resize-y"
                                    />
                                </div>

                                <div>
                                    <label className="mb-1.5 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                        Portfolio URL (Optional)
                                    </label>
                                    <input
                                        type="url"
                                        value={portfolioUrl}
                                        onChange={(event) => setPortfolioUrl(event.target.value)}
                                        placeholder="https://your-portfolio.com"
                                        className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta"
                                    />
                                </div>

                                <div className="grid sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="mb-1.5 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                            Instagram (Optional)
                                        </label>
                                        <input
                                            type="url"
                                            value={instagram}
                                            onChange={(event) => setInstagram(event.target.value)}
                                            placeholder="https://instagram.com/yourhandle"
                                            className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta"
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-1.5 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                            YouTube (Optional)
                                        </label>
                                        <input
                                            type="url"
                                            value={youtube}
                                            onChange={(event) => setYoutube(event.target.value)}
                                            placeholder="https://youtube.com/@yourchannel"
                                            className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="mb-1.5 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                        Website (Optional)
                                    </label>
                                    <input
                                        type="url"
                                        value={website}
                                        onChange={(event) => setWebsite(event.target.value)}
                                        placeholder="https://yourstudio.com"
                                        className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta"
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={submitting || role === "host"}
                                    className="btn-primary w-full !py-3.5 disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                    {submitting ? (
                                        <>
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                            Submitting...
                                        </>
                                    ) : (
                                        <>
                                            <Send className="w-4 h-4" />
                                            Submit Application
                                        </>
                                    )}
                                </button>
                            </form>
                        )}
                    </div>
                </div>
            </section>

            <Footer />
        </main>
    );
}
