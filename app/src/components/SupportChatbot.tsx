"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
    MessageCircle,
    X,
    Send,
    HelpCircle,
    CreditCard,
    CalendarX,
    AlertTriangle,
    ChevronRight,
    CheckCircle,
    Loader2,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";

/* ───── Auto-reply FAQ database ───── */
const FAQ_QUICK_REPLIES = [
    {
        id: "booking",
        label: "How do I book?",
        icon: HelpCircle,
        answer: "It's easy! Browse workshops on the Explore page, pick one you like, select the number of guests, and click \"Reserve Spot\". You'll have 10 minutes to complete your payment via Razorpay (UPI, cards, net banking). Once paid, you get instant confirmation + calendar invite!",
    },
    {
        id: "cancel",
        label: "How do I cancel?",
        icon: CalendarX,
        answer: "You can cancel up to 24 hours before the workshop for a full refund. Go to Profile → My Tickets → select the booking → Cancel. Refunds are processed within 5-7 business days.",
    },
    {
        id: "payment",
        label: "Payment issue",
        icon: CreditCard,
        answer: "If your payment failed or you were charged but didn't get a confirmation, don't worry — Razorpay verifies payments before confirming bookings. If you see a deduction but no booking, the amount will be auto-refunded within 5-7 business days. For persistent issues, submit a 'Report Issue' below.",
    },
    {
        id: "other",
        label: "Report an issue",
        icon: AlertTriangle,
        answer: null, // Opens the form
    },
];

interface ChatMessage {
    id: string;
    type: "user" | "bot" | "system";
    content: string;
    time: string;
}

function getTimeString(): string {
    return new Date().toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
    });
}

export default function SupportChatbot() {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [subject, setSubject] = useState("");
    const [description, setDescription] = useState("");
    const [email, setEmail] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [customQuery, setCustomQuery] = useState("");
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const prefersReducedMotion = Boolean(useReducedMotion());
    const { user } = useAuth();

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({
            behavior: prefersReducedMotion ? "auto" : "smooth",
        });
    }, [messages, prefersReducedMotion]);

    useEffect(() => {
        if (user?.email) setEmail(user.email);
    }, [user]);

    const handleOpen = () => {
        setIsOpen(true);
        if (messages.length === 0) {
            setMessages([
                {
                    id: "welcome",
                    type: "bot",
                    content:
                        "Hi there! 👋 How can I help you today? Choose a topic below or type your question.",
                    time: getTimeString(),
                },
            ]);
        }
    };

    const handleQuickReply = (faq: (typeof FAQ_QUICK_REPLIES)[0]) => {
        // Add user message
        setMessages((prev) => [
            ...prev,
            {
                id: `user-${Date.now()}`,
                type: "user",
                content: faq.label,
                time: getTimeString(),
            },
        ]);

        if (faq.answer) {
            // Auto-reply
            setTimeout(() => {
                setMessages((prev) => [
                    ...prev,
                    {
                        id: `bot-${Date.now()}`,
                        type: "bot",
                        content: faq.answer!,
                        time: getTimeString(),
                    },
                ]);
            }, 400);
        } else {
            // Open the form for "Report an issue"
            setShowForm(true);
            setTimeout(() => {
                setMessages((prev) => [
                    ...prev,
                    {
                        id: `bot-${Date.now()}`,
                        type: "bot",
                        content:
                            "Please fill out the form below and we'll get back to you as soon as possible. Serious issues are escalated to our admin team.",
                        time: getTimeString(),
                    },
                ]);
            }, 400);
        }
    };

    const handleCustomQuery = () => {
        if (!customQuery.trim()) return;
        const query = customQuery.trim().toLowerCase();
        setMessages((prev) => [
            ...prev,
            {
                id: `user-${Date.now()}`,
                type: "user",
                content: customQuery.trim(),
                time: getTimeString(),
            },
        ]);
        setCustomQuery("");

        // Simple keyword matching for auto-reply
        let autoReply: string | null = null;
        if (query.includes("book") || query.includes("reserve") || query.includes("seat")) {
            autoReply = FAQ_QUICK_REPLIES[0].answer;
        } else if (
            query.includes("cancel") ||
            query.includes("refund") ||
            query.includes("reschedule")
        ) {
            autoReply = FAQ_QUICK_REPLIES[1].answer;
        } else if (
            query.includes("pay") ||
            query.includes("charged") ||
            query.includes("money") ||
            query.includes("razorpay")
        ) {
            autoReply = FAQ_QUICK_REPLIES[2].answer;
        }

        setTimeout(() => {
            if (autoReply) {
                setMessages((prev) => [
                    ...prev,
                    {
                        id: `bot-${Date.now()}`,
                        type: "bot",
                        content: autoReply!,
                        time: getTimeString(),
                    },
                ]);
            } else {
                setMessages((prev) => [
                    ...prev,
                    {
                        id: `bot-${Date.now()}`,
                        type: "bot",
                        content:
                            "I'm not sure I can help with that directly. Would you like to submit a detailed issue report? Our team will review it.",
                        time: getTimeString(),
                    },
                ]);
                setShowForm(true);
            }
        }, 500);
    };

    const handleSubmitIssue = async () => {
        if (!subject.trim() || !description.trim() || !email.trim()) return;
        setIsSubmitting(true);

        try {
            const res = await fetch("/api/support", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    subject: subject.trim(),
                    description: description.trim(),
                    email: email.trim(),
                    userId: user?.id ?? null,
                }),
            });

            if (res.ok) {
                setSubmitted(true);
                setShowForm(false);
                setMessages((prev) => [
                    ...prev,
                    {
                        id: `system-${Date.now()}`,
                        type: "system",
                        content:
                            "✅ Issue submitted successfully! Our team will review it and get back to you.",
                        time: getTimeString(),
                    },
                ]);
            } else {
                setMessages((prev) => [
                    ...prev,
                    {
                        id: `system-${Date.now()}`,
                        type: "system",
                        content:
                            "Sorry, something went wrong. Please try again or email us directly.",
                        time: getTimeString(),
                    },
                ]);
            }
        } catch {
            setMessages((prev) => [
                ...prev,
                {
                    id: `system-${Date.now()}`,
                    type: "system",
                    content: "Network error. Please check your connection and try again.",
                    time: getTimeString(),
                },
            ]);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <>
            {/* Floating chat icon */}
            <AnimatePresence>
                {!isOpen && (
                    <motion.button
                        initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.8 }}
                        animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
                        exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.8 }}
                        transition={{ duration: 0.2 }}
                        onClick={handleOpen}
                        className="fixed bottom-20 right-4 z-50 lg:bottom-6 lg:right-6 w-14 h-14 rounded-full bg-terracotta text-white shadow-lg shadow-terracotta/30 flex items-center justify-center hover:bg-terracotta-600 transition-colors"
                        aria-label="Open support chat"
                    >
                        <MessageCircle className="w-6 h-6" />
                    </motion.button>
                )}
            </AnimatePresence>

            {/* Chat panel */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 20 }}
                        animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                        exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 20 }}
                        transition={{ duration: 0.25 }}
                        className="fixed bottom-20 right-4 z-50 lg:bottom-6 lg:right-6 w-[340px] sm:w-[380px] max-h-[500px] rounded-2xl shadow-2xl border border-clay/40 bg-white flex flex-col overflow-hidden"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-3 bg-terracotta text-white rounded-t-2xl">
                            <div className="flex items-center gap-2">
                                <MessageCircle className="w-5 h-5" />
                                <div>
                                    <p className="text-sm font-inter font-semibold">Support</p>
                                    <p className="text-[10px] font-inter text-white/70">
                                        We typically reply instantly
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                                aria-label="Close chat"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[300px]">
                            {messages.map((msg) => (
                                <div
                                    key={msg.id}
                                    className={`flex ${msg.type === "user" ? "justify-end" : "justify-start"}`}
                                >
                                    <div
                                        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm font-inter leading-relaxed ${
                                            msg.type === "user"
                                                ? "bg-terracotta text-white rounded-br-md"
                                                : msg.type === "system"
                                                  ? "bg-emerald-50 text-emerald-800 border border-emerald-100"
                                                  : "bg-cream-100 text-dark-secondary rounded-bl-md"
                                        }`}
                                    >
                                        {msg.content}
                                        <p
                                            className={`text-[10px] mt-1 ${msg.type === "user" ? "text-white/60" : "text-dark-muted"}`}
                                        >
                                            {msg.time}
                                        </p>
                                    </div>
                                </div>
                            ))}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Quick replies */}
                        {messages.length <= 2 && !showForm && (
                            <div className="px-4 pb-2 space-y-1.5">
                                {FAQ_QUICK_REPLIES.map((faq) => (
                                    <button
                                        key={faq.id}
                                        onClick={() => handleQuickReply(faq)}
                                        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left rounded-xl border border-clay/30 hover:border-terracotta/40 hover:bg-terracotta/5 transition-colors"
                                    >
                                        <faq.icon className="w-4 h-4 text-terracotta flex-shrink-0" />
                                        <span className="text-sm font-inter font-medium text-dark flex-1">
                                            {faq.label}
                                        </span>
                                        <ChevronRight className="w-3.5 h-3.5 text-dark-muted" />
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Issue form */}
                        {showForm && !submitted && (
                            <div className="px-4 pb-3 space-y-2.5 border-t border-clay/20 pt-3">
                                <input
                                    type="text"
                                    placeholder="Subject"
                                    value={subject}
                                    onChange={(e) => setSubject(e.target.value)}
                                    className="w-full bg-cream-100 border border-gray-200 rounded-xl px-3 py-2 text-sm font-inter focus:outline-none focus:border-terracotta/50 focus:ring-1 focus:ring-terracotta/30"
                                />
                                <textarea
                                    placeholder="Describe your issue..."
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    rows={3}
                                    className="w-full bg-cream-100 border border-gray-200 rounded-xl px-3 py-2 text-sm font-inter focus:outline-none focus:border-terracotta/50 focus:ring-1 focus:ring-terracotta/30 resize-none"
                                />
                                <input
                                    type="email"
                                    placeholder="Your email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full bg-cream-100 border border-gray-200 rounded-xl px-3 py-2 text-sm font-inter focus:outline-none focus:border-terracotta/50 focus:ring-1 focus:ring-terracotta/30"
                                />
                                <button
                                    onClick={handleSubmitIssue}
                                    disabled={
                                        isSubmitting ||
                                        !subject.trim() ||
                                        !description.trim() ||
                                        !email.trim()
                                    }
                                    className="w-full btn-primary !py-2.5 text-sm disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Submitting...
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle className="w-4 h-4" />
                                            Submit Issue
                                        </>
                                    )}
                                </button>
                            </div>
                        )}

                        {/* Text input */}
                        {!showForm && (
                            <div className="px-4 pb-3 pt-2 border-t border-clay/20">
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        placeholder="Type a question..."
                                        value={customQuery}
                                        onChange={(e) => setCustomQuery(e.target.value)}
                                        onKeyDown={(e) => e.key === "Enter" && handleCustomQuery()}
                                        className="flex-1 bg-cream-100 border border-gray-200 rounded-xl px-3 py-2 text-sm font-inter focus:outline-none focus:border-terracotta/50 focus:ring-1 focus:ring-terracotta/30"
                                    />
                                    <button
                                        onClick={handleCustomQuery}
                                        disabled={!customQuery.trim()}
                                        className="p-2 rounded-xl bg-terracotta text-white hover:bg-terracotta-600 transition-colors disabled:opacity-40"
                                        aria-label="Send"
                                    >
                                        <Send className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
