"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Send } from "lucide-react";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import { createCommunity, toApiErrorMessage } from "@/lib/api-client";
import { communityCreateSchema } from "@/lib/validators";

type FormState = {
    title: string;
    summary: string;
    description: string;
    category: string;
    city: string;
    hostName: string;
    hostEmail: string;
    hostPhone: string;
    meetingFormat: string;
    meetupFrequency: string;
    coverImage: string;
    instagramUrl: string;
    websiteUrl: string;
    whatsappUrl: string;
};

type FieldErrors = Partial<Record<keyof FormState, string>>;

const initialForm: FormState = {
    title: "",
    summary: "",
    description: "",
    category: "",
    city: "",
    hostName: "",
    hostEmail: "",
    hostPhone: "",
    meetingFormat: "Offline",
    meetupFrequency: "",
    coverImage: "",
    instagramUrl: "",
    websiteUrl: "",
    whatsappUrl: "",
};

export default function CreateCommunityPage() {
    const router = useRouter();
    const [form, setForm] = useState<FormState>(initialForm);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

    const update = (field: keyof FormState, value: string) => {
        setForm((prev) => ({ ...prev, [field]: value }));
        setFieldErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
    };

    const renderFieldError = (field: keyof FormState) =>
        fieldErrors[field] ? (
            <p className="mt-1 text-xs font-inter text-red-600">{fieldErrors[field]}</p>
        ) : null;

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null);

        const validation = communityCreateSchema.safeParse(form);
        if (!validation.success) {
            const nextErrors: FieldErrors = {};
            for (const issue of validation.error.issues) {
                const [field] = issue.path;
                if (
                    typeof field === "string" &&
                    field in form &&
                    !nextErrors[field as keyof FormState]
                ) {
                    nextErrors[field as keyof FormState] = issue.message;
                }
            }
            setFieldErrors(nextErrors);
            setError("Please fix the highlighted fields and try again.");
            return;
        }

        setSubmitting(true);
        try {
            const result = await createCommunity(validation.data);
            router.replace(`/communities/${result.community.slug}`);
        } catch (submitError) {
            setError(toApiErrorMessage(submitError, "Unable to create community page right now."));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <main className="min-h-screen bg-cream text-dark">
            <Navbar />

            <section className="section-padding pt-28 pb-16">
                <div className="mx-auto max-w-3xl">
                    <Link
                        href="/"
                        className="interactive-link mb-6 inline-flex items-center gap-2 text-sm font-inter text-dark-muted hover:text-terracotta"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Back to Home
                    </Link>

                    <div className="rounded-[2rem] border border-clay/20 bg-white p-6 shadow-soft sm:p-8">
                        <div className="mb-8">
                            <p className="mb-2 text-xs font-inter font-bold uppercase tracking-[0.28em] text-terracotta">
                                Community Pages
                            </p>
                            <h1 className="font-playfair text-4xl font-bold text-dark sm:text-5xl">
                                List Your Community
                            </h1>
                            <p className="mt-3 max-w-2xl text-base font-inter text-dark-muted">
                                Fill out this form to instantly create a community page that others
                                can discover and join.
                            </p>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-6">
                            {error && (
                                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-inter text-red-700">
                                    {error}
                                </div>
                            )}

                            <div className="grid gap-6 sm:grid-cols-2">
                                <div className="sm:col-span-2">
                                    <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                        Community Name
                                    </label>
                                    <input
                                        value={form.title}
                                        onChange={(event) => update("title", event.target.value)}
                                        placeholder="Mumbai Storytellers Circle"
                                        className="interactive-field w-full rounded-xl border border-gray-200 bg-cream-100 px-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta"
                                        required
                                    />
                                    {renderFieldError("title")}
                                </div>

                                <div className="sm:col-span-2">
                                    <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                        Short Summary
                                    </label>
                                    <input
                                        value={form.summary}
                                        onChange={(event) => update("summary", event.target.value)}
                                        placeholder="A weekly meetup for writers, speakers, and story lovers."
                                        className="interactive-field w-full rounded-xl border border-gray-200 bg-cream-100 px-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta"
                                        required
                                    />
                                    {renderFieldError("summary")}
                                </div>

                                <div>
                                    <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                        Category
                                    </label>
                                    <input
                                        value={form.category}
                                        onChange={(event) => update("category", event.target.value)}
                                        placeholder="Storytelling"
                                        className="interactive-field w-full rounded-xl border border-gray-200 bg-cream-100 px-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta"
                                        required
                                    />
                                    {renderFieldError("category")}
                                </div>

                                <div>
                                    <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                        City
                                    </label>
                                    <input
                                        value={form.city}
                                        onChange={(event) => update("city", event.target.value)}
                                        placeholder="Mumbai"
                                        className="interactive-field w-full rounded-xl border border-gray-200 bg-cream-100 px-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta"
                                        required
                                    />
                                    {renderFieldError("city")}
                                </div>

                                <div>
                                    <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                        Meeting Format
                                    </label>
                                    <select
                                        value={form.meetingFormat}
                                        onChange={(event) =>
                                            update("meetingFormat", event.target.value)
                                        }
                                        className="interactive-field w-full rounded-xl border border-gray-200 bg-cream-100 px-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta"
                                    >
                                        <option value="Offline">Offline</option>
                                        <option value="Online">Online</option>
                                        <option value="Hybrid">Hybrid</option>
                                    </select>
                                    {renderFieldError("meetingFormat")}
                                </div>

                                <div>
                                    <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                        Meetup Frequency
                                    </label>
                                    <input
                                        value={form.meetupFrequency}
                                        onChange={(event) =>
                                            update("meetupFrequency", event.target.value)
                                        }
                                        placeholder="Every Saturday evening"
                                        className="interactive-field w-full rounded-xl border border-gray-200 bg-cream-100 px-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta"
                                        required
                                    />
                                    {renderFieldError("meetupFrequency")}
                                </div>

                                <div className="sm:col-span-2">
                                    <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                        Community Description
                                    </label>
                                    <textarea
                                        value={form.description}
                                        onChange={(event) =>
                                            update("description", event.target.value)
                                        }
                                        rows={6}
                                        placeholder="Share what the community is about, who should join, and what members can expect."
                                        className="interactive-field w-full resize-y rounded-xl border border-gray-200 bg-cream-100 px-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta"
                                        required
                                    />
                                    {renderFieldError("description")}
                                </div>

                                <div>
                                    <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                        Host Name
                                    </label>
                                    <input
                                        value={form.hostName}
                                        onChange={(event) => update("hostName", event.target.value)}
                                        placeholder="Asha Mehta"
                                        className="interactive-field w-full rounded-xl border border-gray-200 bg-cream-100 px-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta"
                                        required
                                    />
                                    {renderFieldError("hostName")}
                                </div>

                                <div>
                                    <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                        Host Email
                                    </label>
                                    <input
                                        type="email"
                                        value={form.hostEmail}
                                        onChange={(event) =>
                                            update("hostEmail", event.target.value)
                                        }
                                        placeholder="asha@example.com"
                                        className="interactive-field w-full rounded-xl border border-gray-200 bg-cream-100 px-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta"
                                        required
                                    />
                                    {renderFieldError("hostEmail")}
                                </div>

                                <div>
                                    <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                        Host Phone
                                    </label>
                                    <input
                                        value={form.hostPhone}
                                        onChange={(event) =>
                                            update("hostPhone", event.target.value)
                                        }
                                        placeholder="9876543210"
                                        className="interactive-field w-full rounded-xl border border-gray-200 bg-cream-100 px-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta"
                                        required
                                    />
                                    {renderFieldError("hostPhone")}
                                </div>

                                <div>
                                    <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                        Cover Image URL
                                    </label>
                                    <input
                                        value={form.coverImage}
                                        onChange={(event) =>
                                            update("coverImage", event.target.value)
                                        }
                                        placeholder="https://..."
                                        className="interactive-field w-full rounded-xl border border-gray-200 bg-cream-100 px-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta"
                                    />
                                    {renderFieldError("coverImage")}
                                </div>

                                <div className="sm:col-span-2 rounded-2xl border border-clay/20 bg-cream-50 px-4 py-3 text-sm font-inter text-dark-secondary">
                                    Add at least one community link below. Instagram, Website, or
                                    WhatsApp is compulsory so people can discover or contact your
                                    group.
                                </div>

                                <div>
                                    <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                        Instagram URL
                                    </label>
                                    <input
                                        value={form.instagramUrl}
                                        onChange={(event) =>
                                            update("instagramUrl", event.target.value)
                                        }
                                        placeholder="https://instagram.com/..."
                                        className="interactive-field w-full rounded-xl border border-gray-200 bg-cream-100 px-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta"
                                    />
                                    {renderFieldError("instagramUrl")}
                                </div>

                                <div>
                                    <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                        Website URL
                                    </label>
                                    <input
                                        value={form.websiteUrl}
                                        onChange={(event) =>
                                            update("websiteUrl", event.target.value)
                                        }
                                        placeholder="https://..."
                                        className="interactive-field w-full rounded-xl border border-gray-200 bg-cream-100 px-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta"
                                    />
                                    {renderFieldError("websiteUrl")}
                                </div>

                                <div>
                                    <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                        WhatsApp URL
                                    </label>
                                    <input
                                        value={form.whatsappUrl}
                                        onChange={(event) =>
                                            update("whatsappUrl", event.target.value)
                                        }
                                        placeholder="https://wa.me/..."
                                        className="interactive-field w-full rounded-xl border border-gray-200 bg-cream-100 px-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta"
                                    />
                                    {renderFieldError("whatsappUrl")}
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={submitting}
                                className="btn-primary w-full !py-3.5 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {submitting ? (
                                    <>
                                        <Loader2 className="h-5 w-5 animate-spin" />
                                        Creating Community Page...
                                    </>
                                ) : (
                                    <>
                                        <Send className="h-4 w-4" />
                                        Create Community Page
                                    </>
                                )}
                            </button>
                        </form>
                    </div>
                </div>
            </section>

            <Footer />
        </main>
    );
}
