"use client";

import { useEffect, useState } from "react";
import {
    Bot,
    Copy,
    HelpCircle,
    KeyRound,
    Loader2,
    Pencil,
    RefreshCcw,
    Save,
    Trash2,
    Users,
    X,
} from "lucide-react";
import HostShell from "@/components/host/HostShell";
import {
    createHostChatbotFaq,
    deleteHostChatbotFaq,
    getHostChatbotClient,
    getHostChatbotFaqs,
    getHostChatbotLeads,
    getHostChatbotUnansweredQuestions,
    toApiErrorMessage,
    updateHostChatbotClient,
    updateHostChatbotFaq,
    type HostChatbotClient,
    type HostChatbotFaq,
    type HostChatbotLead,
    type HostChatbotUnansweredQuestion,
} from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";

type FaqFormState = {
    question: string;
    answer: string;
};

type ClientFormState = {
    name: string;
    bookingUrl: string;
};

const EMPTY_FAQ_FORM: FaqFormState = {
    question: "",
    answer: "",
};

export default function HostChatbotPage() {
    const { session } = useAuth();
    const [loading, setLoading] = useState(true);
    const [client, setClient] = useState<HostChatbotClient | null>(null);
    const [clientForm, setClientForm] = useState<ClientFormState>({
        name: "",
        bookingUrl: "",
    });
    const [faqs, setFaqs] = useState<HostChatbotFaq[]>([]);
    const [leads, setLeads] = useState<HostChatbotLead[]>([]);
    const [unansweredQuestions, setUnansweredQuestions] = useState<HostChatbotUnansweredQuestion[]>(
        []
    );
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [faqForm, setFaqForm] = useState<FaqFormState>(EMPTY_FAQ_FORM);
    const [editingFaqId, setEditingFaqId] = useState<string | null>(null);
    const [savingClient, setSavingClient] = useState(false);
    const [savingFaq, setSavingFaq] = useState(false);
    const [deletingFaqId, setDeletingFaqId] = useState<string | null>(null);

    useEffect(() => {
        if (!session?.access_token) {
            return;
        }

        let cancelled = false;

        const loadData = async () => {
            setLoading(true);
            setError(null);

            try {
                const [clientRes, faqRes, leadsRes, unansweredRes] = await Promise.all([
                    getHostChatbotClient(session.access_token),
                    getHostChatbotFaqs(session.access_token),
                    getHostChatbotLeads(session.access_token),
                    getHostChatbotUnansweredQuestions(session.access_token),
                ]);

                if (cancelled) {
                    return;
                }

                setClient(clientRes.client);
                setClientForm({
                    name: clientRes.client.name,
                    bookingUrl: clientRes.client.bookingUrl || "",
                });
                setFaqs(Array.isArray(faqRes.faqs) ? faqRes.faqs : []);
                setLeads(Array.isArray(leadsRes.leads) ? leadsRes.leads : []);
                setUnansweredQuestions(
                    Array.isArray(unansweredRes.unansweredQuestions)
                        ? unansweredRes.unansweredQuestions
                        : []
                );
            } catch (loadError) {
                if (!cancelled) {
                    setError(toApiErrorMessage(loadError, "Unable to load chatbot dashboard."));
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        void loadData();

        return () => {
            cancelled = true;
        };
    }, [session?.access_token]);

    const resetFaqForm = () => {
        setFaqForm(EMPTY_FAQ_FORM);
        setEditingFaqId(null);
    };

    const copyText = async (value: string, successMessage: string) => {
        try {
            await navigator.clipboard.writeText(value);
            setNotice(successMessage);
        } catch {
            setNotice("Could not copy right now. Please try again.");
        }
    };

    const handleSaveClient = async () => {
        if (!session?.access_token || savingClient) {
            return;
        }

        setSavingClient(true);
        setNotice(null);

        try {
            const result = await updateHostChatbotClient(session.access_token, {
                name: clientForm.name.trim(),
                bookingUrl: clientForm.bookingUrl.trim(),
            });

            setClient(result.client);
            setClientForm({
                name: result.client.name,
                bookingUrl: result.client.bookingUrl || "",
            });
            setNotice("Chatbot settings updated.");
        } catch (saveError) {
            setNotice(toApiErrorMessage(saveError, "Unable to save chatbot settings."));
        } finally {
            setSavingClient(false);
        }
    };

    const handleRotateApiKey = async () => {
        if (!session?.access_token || savingClient) {
            return;
        }

        setSavingClient(true);
        setNotice(null);

        try {
            const result = await updateHostChatbotClient(session.access_token, {
                rotateApiKey: true,
            });
            setClient(result.client);
            setClientForm({
                name: result.client.name,
                bookingUrl: result.client.bookingUrl || "",
            });
            setNotice("API key rotated successfully.");
        } catch (rotateError) {
            setNotice(toApiErrorMessage(rotateError, "Unable to rotate API key."));
        } finally {
            setSavingClient(false);
        }
    };

    const handleSubmitFaq = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (!session?.access_token || savingFaq) {
            return;
        }

        const question = faqForm.question.trim();
        const answer = faqForm.answer.trim();
        if (!question || !answer) {
            setNotice("Please add both a question and an answer.");
            return;
        }

        setSavingFaq(true);
        setNotice(null);

        try {
            if (editingFaqId) {
                const result = await updateHostChatbotFaq(session.access_token, editingFaqId, {
                    question,
                    answer,
                });

                setFaqs((current) =>
                    current.map((faq) => (faq.id === editingFaqId ? result.faq : faq))
                );
                setNotice("FAQ updated.");
            } else {
                const result = await createHostChatbotFaq(session.access_token, {
                    question,
                    answer,
                });
                setFaqs((current) => [result.faq, ...current]);
                setNotice("FAQ created.");
            }

            resetFaqForm();
        } catch (submitError) {
            setNotice(toApiErrorMessage(submitError, "Unable to save FAQ right now."));
        } finally {
            setSavingFaq(false);
        }
    };

    const handleDeleteFaq = async (faqId: string) => {
        if (!session?.access_token) {
            return;
        }

        setDeletingFaqId(faqId);
        setNotice(null);

        try {
            await deleteHostChatbotFaq(session.access_token, faqId);
            setFaqs((current) => current.filter((faq) => faq.id !== faqId));
            if (editingFaqId === faqId) {
                resetFaqForm();
            }
            setNotice("FAQ deleted.");
        } catch (deleteError) {
            setNotice(toApiErrorMessage(deleteError, "Unable to delete FAQ right now."));
        } finally {
            setDeletingFaqId(null);
        }
    };

    const handleEditFaq = (faq: HostChatbotFaq) => {
        setEditingFaqId(faq.id);
        setFaqForm({
            question: faq.question,
            answer: faq.answer,
        });
        setNotice(null);
    };

    return (
        <HostShell>
            <div className="mb-8">
                <p className="mb-2 flex items-center gap-2 text-xs font-inter font-bold uppercase tracking-wider text-terracotta">
                    <Bot className="h-4 w-4" />
                    Host Dashboard
                </p>
                <h1 className="heading-md">AI Chatbot</h1>
                <p className="mt-2 max-w-3xl text-sm font-inter text-dark-muted">
                    Manage your tenant-specific chatbot, booking CTA, FAQ knowledge base, and the
                    leads captured from your support widget.
                </p>
            </div>

            {loading && (
                <div className="flex items-center gap-2 text-sm font-inter text-dark-muted">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading chatbot dashboard...
                </div>
            )}

            {!loading && error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-inter text-red-700">
                    {error}
                </div>
            )}

            {!loading && !error && (
                <div className="space-y-6">
                    {notice && (
                        <div
                            className={`rounded-xl px-4 py-3 text-sm font-inter ${
                                notice.toLowerCase().includes("unable") ||
                                notice.toLowerCase().includes("could not") ||
                                notice.toLowerCase().includes("please")
                                    ? "border border-red-200 bg-red-50 text-red-700"
                                    : "border border-emerald-200 bg-emerald-50 text-emerald-700"
                            }`}
                        >
                            {notice}
                        </div>
                    )}

                    <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-soft">
                        <div className="mb-5 flex items-center gap-3">
                            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                                <KeyRound className="h-5 w-5" />
                            </span>
                            <div>
                                <h2 className="font-playfair text-xl font-bold text-dark">Setup</h2>
                                <p className="text-sm font-inter text-dark-muted">
                                    Configure your chatbot identity, booking CTA, and embed code.
                                </p>
                            </div>
                        </div>

                        <div className="grid gap-6 lg:grid-cols-[1.1fr,0.9fr]">
                            <div className="space-y-4">
                                <div>
                                    <label className="mb-2 block text-xs font-inter font-semibold uppercase tracking-wider text-dark-muted">
                                        Chatbot Name
                                    </label>
                                    <input
                                        type="text"
                                        value={clientForm.name}
                                        onChange={(event) =>
                                            setClientForm((current) => ({
                                                ...current,
                                                name: event.target.value,
                                            }))
                                        }
                                        className="w-full rounded-xl border border-gray-200 bg-cream-100 px-4 py-3 text-sm font-inter text-dark outline-none transition-colors focus:border-terracotta/50 focus:bg-white"
                                    />
                                </div>

                                <div>
                                    <label className="mb-2 block text-xs font-inter font-semibold uppercase tracking-wider text-dark-muted">
                                        Booking URL
                                    </label>
                                    <input
                                        type="url"
                                        value={clientForm.bookingUrl}
                                        onChange={(event) =>
                                            setClientForm((current) => ({
                                                ...current,
                                                bookingUrl: event.target.value,
                                            }))
                                        }
                                        placeholder="https://your-booking-page.com"
                                        className="w-full rounded-xl border border-gray-200 bg-cream-100 px-4 py-3 text-sm font-inter text-dark outline-none transition-colors focus:border-terracotta/50 focus:bg-white"
                                    />
                                </div>

                                <div className="flex flex-wrap gap-3">
                                    <button
                                        type="button"
                                        onClick={handleSaveClient}
                                        disabled={savingClient}
                                        className="btn-primary"
                                    >
                                        {savingClient ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <Save className="h-4 w-4" />
                                        )}
                                        Save Settings
                                    </button>

                                    <button
                                        type="button"
                                        onClick={handleRotateApiKey}
                                        disabled={savingClient}
                                        className="btn-secondary"
                                    >
                                        {savingClient ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <RefreshCcw className="h-4 w-4" />
                                        )}
                                        Rotate API Key
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-4 rounded-2xl border border-gray-100 bg-cream-100/70 p-5">
                                <div>
                                    <p className="text-xs font-inter font-semibold uppercase tracking-wider text-dark-muted">
                                        Client API Key
                                    </p>
                                    <div className="mt-2 flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-3">
                                        <code className="min-w-0 flex-1 truncate text-xs text-dark">
                                            {client?.apiKey}
                                        </code>
                                        {client?.apiKey && (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    void copyText(client.apiKey, "API key copied.")
                                                }
                                                className="rounded-full p-2 text-dark-muted transition-colors hover:bg-cream-100 hover:text-dark"
                                                aria-label="Copy API key"
                                            >
                                                <Copy className="h-4 w-4" />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div>
                                    <p className="text-xs font-inter font-semibold uppercase tracking-wider text-dark-muted">
                                        Embed Snippet
                                    </p>
                                    <div className="mt-2 rounded-xl border border-gray-200 bg-white p-3">
                                        <code className="block whitespace-pre-wrap break-all text-xs text-dark">
                                            {client?.embedSnippet}
                                        </code>
                                    </div>
                                    {client?.embedSnippet && (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                void copyText(
                                                    client.embedSnippet,
                                                    "Embed snippet copied."
                                                )
                                            }
                                            className="mt-3 inline-flex items-center gap-2 rounded-full border border-gray-200 px-4 py-2 text-xs font-semibold text-dark-secondary transition-colors hover:border-terracotta hover:text-terracotta"
                                        >
                                            <Copy className="h-3.5 w-3.5" />
                                            Copy Embed Code
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </section>

                    <div className="grid gap-6 xl:grid-cols-[360px,1fr]">
                        <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-soft">
                            <div className="mb-5 flex items-center justify-between gap-3">
                                <div>
                                    <h2 className="font-playfair text-lg font-bold text-dark">
                                        {editingFaqId ? "Edit FAQ" : "Add FAQ"}
                                    </h2>
                                    <p className="mt-1 text-sm font-inter text-dark-muted">
                                        Every FAQ answer is embedded automatically for semantic
                                        search.
                                    </p>
                                </div>
                                {editingFaqId && (
                                    <button
                                        type="button"
                                        onClick={resetFaqForm}
                                        className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold text-dark-secondary transition-colors hover:border-terracotta hover:text-terracotta"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                        Cancel
                                    </button>
                                )}
                            </div>

                            <form onSubmit={handleSubmitFaq} className="space-y-4">
                                <div>
                                    <label className="mb-2 block text-xs font-inter font-semibold uppercase tracking-wider text-dark-muted">
                                        Question
                                    </label>
                                    <input
                                        type="text"
                                        value={faqForm.question}
                                        onChange={(event) =>
                                            setFaqForm((current) => ({
                                                ...current,
                                                question: event.target.value,
                                            }))
                                        }
                                        className="w-full rounded-xl border border-gray-200 bg-cream-100 px-4 py-3 text-sm font-inter text-dark outline-none transition-colors focus:border-terracotta/50 focus:bg-white"
                                    />
                                </div>

                                <div>
                                    <label className="mb-2 block text-xs font-inter font-semibold uppercase tracking-wider text-dark-muted">
                                        Answer
                                    </label>
                                    <textarea
                                        value={faqForm.answer}
                                        onChange={(event) =>
                                            setFaqForm((current) => ({
                                                ...current,
                                                answer: event.target.value,
                                            }))
                                        }
                                        rows={6}
                                        className="w-full rounded-xl border border-gray-200 bg-cream-100 px-4 py-3 text-sm font-inter text-dark outline-none transition-colors focus:border-terracotta/50 focus:bg-white"
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={savingFaq}
                                    className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {savingFaq ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Save className="h-4 w-4" />
                                    )}
                                    {editingFaqId ? "Save FAQ" : "Add FAQ"}
                                </button>
                            </form>
                        </section>

                        <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-soft">
                            <div className="mb-5 flex items-center gap-3">
                                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                                    <HelpCircle className="h-5 w-5" />
                                </span>
                                <div>
                                    <h2 className="font-playfair text-lg font-bold text-dark">
                                        FAQ Library
                                    </h2>
                                    <p className="text-sm font-inter text-dark-muted">
                                        These answers are used by the tenant-specific RAG chatbot.
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-3">
                                {faqs.length === 0 && (
                                    <div className="rounded-xl border border-dashed border-gray-200 bg-cream-100/60 px-4 py-5 text-sm font-inter text-dark-muted">
                                        No FAQs yet. Add your first FAQ to start powering the
                                        chatbot.
                                    </div>
                                )}

                                {faqs.map((faq) => (
                                    <div
                                        key={faq.id}
                                        className="rounded-2xl border border-gray-100 bg-cream-100/40 p-4"
                                    >
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="min-w-0">
                                                <p className="text-sm font-semibold text-dark">
                                                    {faq.question}
                                                </p>
                                                <p className="mt-2 text-sm leading-relaxed text-dark-muted">
                                                    {faq.answer}
                                                </p>
                                            </div>
                                            <div className="flex shrink-0 items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => handleEditFaq(faq)}
                                                    className="rounded-full p-2 text-dark-muted transition-colors hover:bg-white hover:text-dark"
                                                    aria-label="Edit FAQ"
                                                >
                                                    <Pencil className="h-4 w-4" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => void handleDeleteFaq(faq.id)}
                                                    disabled={deletingFaqId === faq.id}
                                                    className="rounded-full p-2 text-red-500 transition-colors hover:bg-white hover:text-red-600 disabled:opacity-60"
                                                    aria-label="Delete FAQ"
                                                >
                                                    {deletingFaqId === faq.id ? (
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                    ) : (
                                                        <Trash2 className="h-4 w-4" />
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </div>

                    <div className="grid gap-6 xl:grid-cols-2">
                        <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-soft">
                            <div className="mb-5 flex items-center gap-3">
                                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                                    <Users className="h-5 w-5" />
                                </span>
                                <div>
                                    <h2 className="font-playfair text-lg font-bold text-dark">
                                        Leads
                                    </h2>
                                    <p className="text-sm font-inter text-dark-muted">
                                        Captured when users show booking intent and complete the
                                        lead flow.
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-3">
                                {leads.length === 0 && (
                                    <div className="rounded-xl border border-dashed border-gray-200 bg-cream-100/60 px-4 py-5 text-sm font-inter text-dark-muted">
                                        No leads captured yet.
                                    </div>
                                )}

                                {leads.map((lead) => (
                                    <div
                                        key={lead.id}
                                        className="rounded-2xl border border-gray-100 bg-cream-100/40 p-4"
                                    >
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <div>
                                                <p className="text-sm font-semibold text-dark">
                                                    {lead.name}
                                                </p>
                                                <p className="text-sm text-dark-muted">
                                                    {lead.phone}
                                                </p>
                                            </div>
                                            <p className="text-xs font-medium uppercase tracking-wide text-dark-muted">
                                                {new Date(lead.created_at).toLocaleString("en-IN")}
                                            </p>
                                        </div>
                                        <p className="mt-3 text-sm leading-relaxed text-dark-muted">
                                            {lead.query}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </section>

                        <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-soft">
                            <div className="mb-5 flex items-center gap-3">
                                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 text-rose-700">
                                    <HelpCircle className="h-5 w-5" />
                                </span>
                                <div>
                                    <h2 className="font-playfair text-lg font-bold text-dark">
                                        Unanswered Questions
                                    </h2>
                                    <p className="text-sm font-inter text-dark-muted">
                                        Questions that fell below the similarity threshold and need
                                        better FAQ coverage.
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-3">
                                {unansweredQuestions.length === 0 && (
                                    <div className="rounded-xl border border-dashed border-gray-200 bg-cream-100/60 px-4 py-5 text-sm font-inter text-dark-muted">
                                        No unanswered questions right now.
                                    </div>
                                )}

                                {unansweredQuestions.map((item) => (
                                    <div
                                        key={item.id}
                                        className="rounded-2xl border border-gray-100 bg-cream-100/40 p-4"
                                    >
                                        <p className="text-sm leading-relaxed text-dark">
                                            {item.question}
                                        </p>
                                        <p className="mt-2 text-xs font-medium uppercase tracking-wide text-dark-muted">
                                            {new Date(item.created_at).toLocaleString("en-IN")}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </div>
                </div>
            )}
        </HostShell>
    );
}
