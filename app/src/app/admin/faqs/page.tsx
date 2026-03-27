"use client";

import { useEffect, useMemo, useState } from "react";
import { HelpCircle, Loader2, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import AdminShell from "@/components/admin/AdminShell";
import {
    createAdminFaq,
    deleteAdminFaq,
    getAdminFaqs,
    toApiErrorMessage,
    updateAdminFaq,
    type FaqItem,
} from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";

type FormState = {
    question: string;
    answer: string;
};

const EMPTY_FORM: FormState = {
    question: "",
    answer: "",
};

export default function AdminFaqsPage() {
    const { session } = useAuth();
    const [faqs, setFaqs] = useState<FaqItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [editingFaqId, setEditingFaqId] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [deletingFaqId, setDeletingFaqId] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    useEffect(() => {
        if (!session?.access_token) {
            return;
        }

        let cancelled = false;

        const loadFaqData = async () => {
            setLoading(true);
            setError(null);

            try {
                const result = await getAdminFaqs(session.access_token);
                if (!cancelled) {
                    setFaqs(Array.isArray(result.faqs) ? result.faqs : []);
                }
            } catch (loadError) {
                if (!cancelled) {
                    setError(toApiErrorMessage(loadError, "Unable to load FAQs right now."));
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        void loadFaqData();

        return () => {
            cancelled = true;
        };
    }, [session?.access_token]);

    const isEditing = Boolean(editingFaqId);
    const formTitle = useMemo(() => (isEditing ? "Edit FAQ" : "Add FAQ"), [isEditing]);

    const resetForm = () => {
        setForm(EMPTY_FORM);
        setEditingFaqId(null);
    };

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!session?.access_token || submitting) {
            return;
        }

        const question = form.question.trim();
        const answer = form.answer.trim();
        if (!question || !answer) {
            setNotice("Please add both a question and an answer.");
            return;
        }

        setSubmitting(true);
        setNotice(null);

        try {
            if (editingFaqId) {
                const result = await updateAdminFaq(session.access_token, editingFaqId, {
                    question,
                    answer,
                });

                setFaqs((current) =>
                    current.map((faq) => (faq.id === editingFaqId ? result.faq : faq))
                );
                setNotice("FAQ updated.");
            } else {
                const result = await createAdminFaq(session.access_token, {
                    question,
                    answer,
                });

                setFaqs((current) => [result.faq, ...current]);
                setNotice("FAQ created.");
            }

            resetForm();
        } catch (submitError) {
            setNotice(toApiErrorMessage(submitError, "Unable to save FAQ right now."));
        } finally {
            setSubmitting(false);
        }
    };

    const handleEdit = (faq: FaqItem) => {
        setEditingFaqId(faq.id);
        setForm({
            question: faq.question,
            answer: faq.answer,
        });
        setNotice(null);
    };

    const handleDelete = async (faqId: string) => {
        if (!session?.access_token) {
            return;
        }

        setDeletingFaqId(faqId);
        setNotice(null);

        try {
            await deleteAdminFaq(session.access_token, faqId);
            setFaqs((current) => current.filter((faq) => faq.id !== faqId));

            if (editingFaqId === faqId) {
                resetForm();
            }

            setNotice("FAQ deleted.");
        } catch (deleteError) {
            setNotice(toApiErrorMessage(deleteError, "Unable to delete FAQ right now."));
        } finally {
            setDeletingFaqId(null);
        }
    };

    return (
        <AdminShell>
            <div className="mb-8">
                <p className="mb-2 flex items-center gap-2 text-xs font-inter font-bold uppercase tracking-wider text-terracotta">
                    <HelpCircle className="h-4 w-4" />
                    Admin
                </p>
                <h1 className="heading-md">FAQ Management</h1>
                <p className="mt-2 max-w-2xl text-sm font-inter text-dark-muted">
                    Manage the questions and answers used by the public FAQ section and the AI
                    workshop assistant.
                </p>
            </div>

            {error && (
                <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-inter text-red-700">
                    {error}
                </div>
            )}

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[360px,1fr]">
                <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-soft">
                    <div className="mb-5 flex items-center justify-between gap-3">
                        <div>
                            <h2 className="text-lg font-playfair font-bold text-dark">
                                {formTitle}
                            </h2>
                            <p className="mt-1 text-sm font-inter text-dark-muted">
                                Keep answers concise so the chatbot stays clear and reliable.
                            </p>
                        </div>
                        {isEditing && (
                            <button
                                type="button"
                                onClick={resetForm}
                                className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold text-dark-secondary transition-colors hover:border-terracotta hover:text-terracotta"
                            >
                                <X className="h-3.5 w-3.5" />
                                Cancel
                            </button>
                        )}
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="mb-2 block text-xs font-inter font-semibold uppercase tracking-wider text-dark-muted">
                                Question
                            </label>
                            <input
                                type="text"
                                value={form.question}
                                onChange={(event) =>
                                    setForm((current) => ({
                                        ...current,
                                        question: event.target.value,
                                    }))
                                }
                                placeholder="What should I bring?"
                                className="w-full rounded-xl border border-gray-200 bg-cream-100 px-4 py-3 text-sm font-inter text-dark outline-none transition-colors focus:border-terracotta/50 focus:bg-white"
                            />
                        </div>

                        <div>
                            <label className="mb-2 block text-xs font-inter font-semibold uppercase tracking-wider text-dark-muted">
                                Answer
                            </label>
                            <textarea
                                value={form.answer}
                                onChange={(event) =>
                                    setForm((current) => ({
                                        ...current,
                                        answer: event.target.value,
                                    }))
                                }
                                rows={6}
                                placeholder="Share the answer shown on the site and used by the chatbot."
                                className="w-full rounded-xl border border-gray-200 bg-cream-100 px-4 py-3 text-sm font-inter text-dark outline-none transition-colors focus:border-terracotta/50 focus:bg-white"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={submitting}
                            className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {submitting ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : isEditing ? (
                                <Save className="h-4 w-4" />
                            ) : (
                                <Plus className="h-4 w-4" />
                            )}
                            {submitting ? "Saving..." : isEditing ? "Save Changes" : "Add FAQ"}
                        </button>

                        {notice && (
                            <p
                                className={`text-sm font-medium ${
                                    notice.toLowerCase().includes("unable") ||
                                    notice.toLowerCase().includes("please")
                                        ? "text-red-600"
                                        : "text-emerald-700"
                                }`}
                            >
                                {notice}
                            </p>
                        )}
                    </form>
                </section>

                <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-soft">
                    <div className="mb-5">
                        <h2 className="text-lg font-playfair font-bold text-dark">All FAQs</h2>
                        <p className="mt-1 text-sm font-inter text-dark-muted">
                            These entries drive both the public FAQ accordion and the chatbot
                            context.
                        </p>
                    </div>

                    {loading ? (
                        <div className="flex items-center gap-2 text-sm font-inter text-dark-muted">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading FAQs...
                        </div>
                    ) : faqs.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-gray-200 bg-cream-50 px-6 py-12 text-center">
                            <p className="text-sm font-inter text-dark-muted">
                                No FAQs yet. Add your first FAQ to start training the chatbot with
                                live answers.
                            </p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[640px] text-left text-sm font-inter">
                                <thead className="border-b border-gray-100 text-xs uppercase tracking-wider text-dark-muted">
                                    <tr>
                                        <th className="pb-3 font-semibold">Question</th>
                                        <th className="pb-3 font-semibold">Answer</th>
                                        <th className="pb-3 font-semibold text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {faqs.map((faq) => (
                                        <tr key={faq.id} className="align-top">
                                            <td className="py-4 pr-4 font-semibold text-dark">
                                                {faq.question}
                                            </td>
                                            <td className="py-4 pr-4 text-dark-muted">
                                                <p className="line-clamp-4 max-w-2xl">
                                                    {faq.answer}
                                                </p>
                                            </td>
                                            <td className="py-4">
                                                <div className="flex justify-end gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleEdit(faq)}
                                                        className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold text-dark-secondary transition-colors hover:border-terracotta hover:text-terracotta"
                                                    >
                                                        <Pencil className="h-3.5 w-3.5" />
                                                        Edit
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => void handleDelete(faq.id)}
                                                        disabled={deletingFaqId === faq.id}
                                                        className="inline-flex items-center gap-1 rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                                                    >
                                                        {deletingFaqId === faq.id ? (
                                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                        ) : (
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        )}
                                                        Delete
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            </div>
        </AdminShell>
    );
}
