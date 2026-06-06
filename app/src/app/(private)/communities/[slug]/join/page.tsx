"use client";

import { use, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Send } from "lucide-react";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import { submitCommunityJoinRequest, toApiErrorMessage } from "@/lib/api-client";
import { communityJoinSchema } from "@/lib/validators";

type JoinPageProps = {
    params: Promise<{ slug: string }>;
};

type JoinForm = {
    fullName: string;
    email: string;
    phone: string;
    note: string;
};

type FieldErrors = Partial<Record<keyof JoinForm, string>>;

export default function JoinCommunityPage({ params }: JoinPageProps) {
    const { slug } = use(params);
    const [form, setForm] = useState<JoinForm>({
        fullName: "",
        email: "",
        phone: "",
        note: "",
    });
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

    const update = (field: keyof JoinForm, value: string) => {
        setForm((prev) => ({ ...prev, [field]: value }));
        setFieldErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
    };

    const renderFieldError = (field: keyof JoinForm) =>
        fieldErrors[field] ? (
            <p className="mt-1 text-xs font-inter text-red-600">{fieldErrors[field]}</p>
        ) : null;

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null);

        const validation = communityJoinSchema.safeParse(form);
        if (!validation.success) {
            const nextErrors: FieldErrors = {};
            for (const issue of validation.error.issues) {
                const [field] = issue.path;
                if (
                    typeof field === "string" &&
                    field in form &&
                    !nextErrors[field as keyof JoinForm]
                ) {
                    nextErrors[field as keyof JoinForm] = issue.message;
                }
            }
            setFieldErrors(nextErrors);
            setError("Please fix the highlighted fields and try again.");
            return;
        }

        setSubmitting(true);
        try {
            const result = await submitCommunityJoinRequest(slug, validation.data);
            setSubmitted(true);
            setMessage(result.message);
        } catch (submitError) {
            setError(toApiErrorMessage(submitError, "Unable to submit your join request."));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <main className="min-h-screen bg-cream text-dark">
            <Navbar />

            <section className="section-padding pt-28 pb-16">
                <div className="mx-auto max-w-2xl">
                    <Link
                        href={`/communities/${slug}`}
                        className="interactive-link mb-6 inline-flex items-center gap-2 text-sm font-inter text-dark-muted hover:text-terracotta"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Back to Community Page
                    </Link>

                    <div className="rounded-[2rem] border border-clay/20 bg-white p-6 shadow-soft sm:p-8">
                        <p className="mb-2 text-xs font-inter font-bold uppercase tracking-[0.28em] text-terracotta">
                            Join Request
                        </p>
                        <h1 className="font-playfair text-4xl font-bold text-dark">
                            Join This Community
                        </h1>
                        <p className="mt-3 text-base font-inter text-dark-muted">
                            Fill out your details and the community host can follow up with you.
                        </p>

                        {submitted ? (
                            <div className="mt-8 space-y-4">
                                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm font-inter text-emerald-800">
                                    {message}
                                </div>
                                <p className="text-sm font-inter text-dark-muted">
                                    You can close this tab or return to the community page.
                                </p>
                                <Link href={`/communities/${slug}`} className="btn-primary">
                                    Back to Community
                                </Link>
                            </div>
                        ) : (
                            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                                {error && (
                                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-inter text-red-700">
                                        {error}
                                    </div>
                                )}

                                <div>
                                    <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                        Full Name
                                    </label>
                                    <input
                                        value={form.fullName}
                                        onChange={(event) => update("fullName", event.target.value)}
                                        className="interactive-field w-full rounded-xl border border-gray-200 bg-cream-100 px-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta"
                                        required
                                    />
                                    {renderFieldError("fullName")}
                                </div>

                                <div>
                                    <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                        Email
                                    </label>
                                    <input
                                        type="email"
                                        value={form.email}
                                        onChange={(event) => update("email", event.target.value)}
                                        className="interactive-field w-full rounded-xl border border-gray-200 bg-cream-100 px-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta"
                                        required
                                    />
                                    {renderFieldError("email")}
                                </div>

                                <div>
                                    <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                        Phone
                                    </label>
                                    <input
                                        value={form.phone}
                                        onChange={(event) => update("phone", event.target.value)}
                                        className="interactive-field w-full rounded-xl border border-gray-200 bg-cream-100 px-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta"
                                        required
                                    />
                                    {renderFieldError("phone")}
                                </div>

                                <div>
                                    <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                        Note
                                    </label>
                                    <textarea
                                        value={form.note}
                                        onChange={(event) => update("note", event.target.value)}
                                        rows={5}
                                        placeholder="Tell the host a little about your interest."
                                        className="interactive-field w-full resize-y rounded-xl border border-gray-200 bg-cream-100 px-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta"
                                    />
                                    {renderFieldError("note")}
                                </div>

                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="btn-primary w-full !py-3.5 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {submitting ? (
                                        <>
                                            <Loader2 className="h-5 w-5 animate-spin" />
                                            Sending Request...
                                        </>
                                    ) : (
                                        <>
                                            <Send className="h-4 w-4" />
                                            Submit Join Request
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
