"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { submitHostApplication, toApiErrorMessage } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";

const labelClassName =
    "mb-1.5 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted";
const fieldClassName =
    "interactive-field w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta";

/**
 * The host application form. Only this part of /become-a-host depends on the signed-in account,
 * so only this part waits for auth: the heading and copy around it are server-rendered by
 * page.tsx and reach crawlers (and slow phones) straight away.
 */
export default function BecomeAHostForm() {
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
            <div className="flex min-h-[16rem] items-center justify-center" role="status">
                <Loader2 className="w-8 h-8 animate-spin text-terracotta" aria-hidden />
                <span className="sr-only">Loading the application form</span>
            </div>
        );
    }

    return (
        <>
            {!user && (
                <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-inter text-amber-900">
                    Sign in to submit your host application.
                </div>
            )}

            {role === "host" && (
                <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-inter text-emerald-800">
                    Your account is already approved as a host. You can track payouts from your
                    earnings dashboard.
                </div>
            )}

            {submitted ? (
                <div className="space-y-4">
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm font-inter text-emerald-800">
                        {message}
                    </div>
                    <p className="text-sm font-inter text-dark-muted">
                        Our team will review your details and approve or reject your application
                        from the admin dashboard.
                    </p>
                    <div className="flex flex-wrap gap-3">
                        <Link href="/" className="btn-primary !py-3 !px-5 text-sm">
                            Return Home
                        </Link>
                        <Link href="/profile" className="btn-secondary !py-3 !px-5 text-sm">
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
                        <label htmlFor="host-name" className={labelClassName}>
                            Full Name
                        </label>
                        <input
                            id="host-name"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            required
                            minLength={2}
                            maxLength={120}
                            autoComplete="name"
                            placeholder="Your full name"
                            className={fieldClassName}
                        />
                    </div>

                    <div>
                        <label htmlFor="host-email" className={labelClassName}>
                            Email Address
                        </label>
                        <input
                            id="host-email"
                            type="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            required
                            autoComplete="email"
                            placeholder="you@example.com"
                            className={fieldClassName}
                        />
                    </div>

                    <div>
                        <label htmlFor="host-phone" className={labelClassName}>
                            Mobile Number
                        </label>
                        <input
                            id="host-phone"
                            type="tel"
                            value={phone}
                            onChange={(event) => setPhone(event.target.value)}
                            required
                            autoComplete="tel"
                            placeholder="+91 98765 43210"
                            className={fieldClassName}
                        />
                    </div>

                    <div>
                        <label htmlFor="host-expertise" className={labelClassName}>
                            Field of Expertise
                        </label>
                        <input
                            id="host-expertise"
                            value={expertise}
                            onChange={(event) => setExpertise(event.target.value)}
                            required
                            placeholder="e.g., Pottery, Digital Marketing, Yoga"
                            className={fieldClassName}
                        />
                    </div>

                    <div>
                        <label htmlFor="host-location" className={labelClassName}>
                            Where are you based?
                        </label>
                        <input
                            id="host-location"
                            value={location}
                            onChange={(event) => setLocation(event.target.value)}
                            required
                            placeholder="e.g., Baner, Pune"
                            className={fieldClassName}
                        />
                    </div>

                    <div>
                        <label htmlFor="host-bio" className={labelClassName}>
                            Experience & Bio
                        </label>
                        <textarea
                            id="host-bio"
                            value={bio}
                            onChange={(event) => setBio(event.target.value)}
                            required
                            minLength={20}
                            maxLength={4000}
                            rows={6}
                            placeholder="Describe your background, workshop topics, and teaching style."
                            className={`${fieldClassName} resize-y`}
                        />
                    </div>

                    <div>
                        <label htmlFor="host-portfolio" className={labelClassName}>
                            Portfolio URL (Optional)
                        </label>
                        <input
                            id="host-portfolio"
                            type="url"
                            value={portfolioUrl}
                            onChange={(event) => setPortfolioUrl(event.target.value)}
                            placeholder="https://your-portfolio.com"
                            className={fieldClassName}
                        />
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="host-instagram" className={labelClassName}>
                                Instagram (Optional)
                            </label>
                            <input
                                id="host-instagram"
                                type="url"
                                value={instagram}
                                onChange={(event) => setInstagram(event.target.value)}
                                placeholder="https://instagram.com/yourhandle"
                                className={fieldClassName}
                            />
                        </div>
                        <div>
                            <label htmlFor="host-youtube" className={labelClassName}>
                                YouTube (Optional)
                            </label>
                            <input
                                id="host-youtube"
                                type="url"
                                value={youtube}
                                onChange={(event) => setYoutube(event.target.value)}
                                placeholder="https://youtube.com/@yourchannel"
                                className={fieldClassName}
                            />
                        </div>
                    </div>

                    <div>
                        <label htmlFor="host-website" className={labelClassName}>
                            Website (Optional)
                        </label>
                        <input
                            id="host-website"
                            type="url"
                            value={website}
                            onChange={(event) => setWebsite(event.target.value)}
                            placeholder="https://yourstudio.com"
                            className={fieldClassName}
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
        </>
    );
}
