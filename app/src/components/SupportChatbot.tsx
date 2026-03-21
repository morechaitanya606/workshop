"use client";

import { useEffect, useRef, useState } from "react";
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
import { useParams } from "next/navigation";
import { askSupportChatbot } from "@/lib/api-client";
import { trackEvent } from "@/lib/analytics";
import { useAuth } from "@/lib/auth-context";
import { SUPPORT_CHAT_ANALYTICS_EVENTS, SUPPORT_CHAT_MESSAGES } from "@/lib/support-chat-config";

const CHAT_QUICK_ACTIONS = [
    {
        id: "browse",
        label: "Find workshops",
        icon: HelpCircle,
        prompt: "What workshops are available this week?",
    },
    {
        id: "booking",
        label: "How do I book?",
        icon: HelpCircle,
        prompt: "How do I book a workshop?",
    },
    {
        id: "cancel",
        label: "Cancellation policy",
        icon: CalendarX,
        prompt: "What is the cancellation policy?",
    },
    {
        id: "payment",
        label: "Payment help",
        icon: CreditCard,
        prompt: "I need help with a payment.",
    },
    {
        id: "other",
        label: "Report an issue",
        icon: AlertTriangle,
        prompt: "",
        opensForm: true,
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

function getUserDisplayName(user: ReturnType<typeof useAuth>["user"]): string {
    const metadataName = user?.user_metadata?.full_name;
    if (typeof metadataName === "string" && metadataName.trim()) {
        return metadataName.trim();
    }

    const email = user?.email?.trim();
    if (!email) {
        return "";
    }

    return email.split("@")[0] || "";
}

export default function SupportChatbot() {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [subject, setSubject] = useState("");
    const [description, setDescription] = useState("");
    const [email, setEmail] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [customQuery, setCustomQuery] = useState("");
    const [isThinking, setIsThinking] = useState(false);
    const [isAwaitingClarification, setIsAwaitingClarification] = useState(false);
    const params = useParams<{ id?: string }>();
    const currentPathWorkshopId = params?.id && typeof params.id === "string" ? params.id : null;
    const [contextWorkshopId, setContextWorkshopId] = useState<string | null>(
        currentPathWorkshopId
    );
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const prefersReducedMotion = Boolean(useReducedMotion());
    const { user } = useAuth();
    const userDisplayName = getUserDisplayName(user);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({
            behavior: prefersReducedMotion ? "auto" : "smooth",
        });
    }, [messages, isThinking, prefersReducedMotion]);

    useEffect(() => {
        if (user?.email) setEmail(user.email);
    }, [user]);

    useEffect(() => {
        if (currentPathWorkshopId && messages.length <= 1) {
            setContextWorkshopId(currentPathWorkshopId);
        }
    }, [currentPathWorkshopId, messages.length]);

    const appendMessage = (type: ChatMessage["type"], content: string) => {
        setMessages((prev) => [
            ...prev,
            {
                id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                type,
                content,
                time: getTimeString(),
            },
        ]);
    };

    const handleOpen = () => {
        setIsOpen(true);

        if (messages.length === 0) {
            const welcomeMessage = userDisplayName
                ? `Hi ${userDisplayName.split(/\s+/)[0]}! ${SUPPORT_CHAT_MESSAGES.greeting.replace(/^Hi!\s*/, "")}`
                : SUPPORT_CHAT_MESSAGES.greeting;

            setMessages([
                {
                    id: "welcome",
                    type: "bot",
                    content: welcomeMessage,
                    time: getTimeString(),
                },
            ]);
        }
    };

    const handleQuickAction = async (action: (typeof CHAT_QUICK_ACTIONS)[0]) => {
        if (action.opensForm) {
            setShowForm(true);
            setIsAwaitingClarification(false);
            appendMessage("user", action.label);
            appendMessage("bot", SUPPORT_CHAT_MESSAGES.issueFormIntro);
            trackEvent(SUPPORT_CHAT_ANALYTICS_EVENTS.issueFormOpened, {
                source: "quick_action",
            });
            return;
        }

        await sendChatMessage(action.prompt);
    };

    const sendChatMessage = async (rawMessage?: string) => {
        const message = (rawMessage ?? customQuery).trim();
        if (!message || isThinking) {
            return;
        }

        appendMessage("user", message);
        setCustomQuery("");
        setIsThinking(true);
        const wasAwaitingClarification = isAwaitingClarification;

        try {
            const result = await askSupportChatbot({
                message,
                contextWorkshopId,
                userDisplayName,
            });

            if (wasAwaitingClarification && result.outcome === "clarification_needed") {
                appendMessage("system", SUPPORT_CHAT_MESSAGES.clarificationEscalation);
                setShowForm(true);
                setContextWorkshopId(null);
                setIsAwaitingClarification(false);
                trackEvent(SUPPORT_CHAT_ANALYTICS_EVENTS.noMatch, {
                    source: "repeat_low_confidence",
                    intent: result.intent ?? "unknown",
                });
                trackEvent(SUPPORT_CHAT_ANALYTICS_EVENTS.issueFormOpened, {
                    source: "repeat_low_confidence",
                });
                return;
            }

            appendMessage("bot", result.reply);
            setContextWorkshopId(result.contextWorkshopId);
            setIsAwaitingClarification(result.outcome === "clarification_needed");

            if (result.outcome === "clarification_needed") {
                trackEvent(SUPPORT_CHAT_ANALYTICS_EVENTS.clarificationNeeded, {
                    intent: result.intent ?? "unknown",
                });
            } else if (result.outcome === "issue_form") {
                trackEvent(SUPPORT_CHAT_ANALYTICS_EVENTS.issueFormOpened, {
                    source: result.outcome,
                    intent: result.intent ?? "unknown",
                });
            } else {
                trackEvent(SUPPORT_CHAT_ANALYTICS_EVENTS.answered, {
                    intent: result.intent ?? "unknown",
                    confidence: result.confidence,
                });
            }

            if (result.showIssueForm) {
                setShowForm(true);
                setIsAwaitingClarification(false);
            }
        } catch {
            appendMessage(
                "system",
                "Sorry, I could not answer that right now. Please try again, or use the issue form if you need support."
            );
        } finally {
            setIsThinking(false);
        }
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
                setShowForm(false);
                setSubject("");
                setDescription("");
                appendMessage("system", SUPPORT_CHAT_MESSAGES.issueSubmitted);
            } else {
                appendMessage("system", SUPPORT_CHAT_MESSAGES.issueSubmissionFailed);
            }
        } catch {
            appendMessage("system", SUPPORT_CHAT_MESSAGES.issueSubmissionNetworkError);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <>
            <AnimatePresence>
                {!isOpen && (
                    <motion.button
                        initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.8 }}
                        animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
                        exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.8 }}
                        transition={{ duration: 0.2 }}
                        onClick={handleOpen}
                        className="fixed bottom-20 right-4 z-[60] flex h-14 w-14 items-center justify-center rounded-full bg-terracotta text-white shadow-lg shadow-terracotta/30 transition-colors hover:bg-terracotta-600 lg:bottom-6 lg:right-6"
                        aria-label="Open support chat"
                    >
                        <MessageCircle className="h-6 w-6" />
                    </motion.button>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 20 }}
                        animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                        exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 20 }}
                        transition={{ duration: 0.25 }}
                        className="fixed bottom-20 right-4 z-[60] flex max-h-[500px] w-[340px] flex-col overflow-hidden rounded-2xl border border-clay/40 bg-white shadow-2xl sm:w-[380px] lg:bottom-6 lg:right-6"
                    >
                        <div className="flex items-center justify-between rounded-t-2xl bg-terracotta px-4 py-3 text-white">
                            <div className="flex items-center gap-2">
                                <MessageCircle className="h-5 w-5" />
                                <div>
                                    <p className="text-sm font-inter font-semibold">
                                        Workshop Assistant
                                    </p>
                                    <p className="text-[10px] font-inter text-white/70">
                                        Ask about workshops, booking, or support
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="rounded-lg p-1 transition-colors hover:bg-white/20"
                                aria-label="Close chat"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        <div className="max-h-[300px] flex-1 space-y-3 overflow-y-auto p-4">
                            {messages.map((msg) => (
                                <div
                                    key={msg.id}
                                    className={`flex ${msg.type === "user" ? "justify-end" : "justify-start"}`}
                                >
                                    <div
                                        className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm font-inter leading-relaxed ${
                                            msg.type === "user"
                                                ? "rounded-br-md bg-terracotta text-white"
                                                : msg.type === "system"
                                                  ? msg.content.toLowerCase().includes("sorry") ||
                                                    msg.content.toLowerCase().includes("error") ||
                                                    msg.content.toLowerCase().includes("failed") ||
                                                    msg.content.toLowerCase().includes("could not")
                                                      ? "border border-amber-200 bg-amber-50 text-amber-900"
                                                      : "border border-emerald-100 bg-emerald-50 text-emerald-800"
                                                  : "rounded-bl-md bg-cream-100 text-dark-secondary"
                                        }`}
                                    >
                                        {msg.content.split(/(\[.*?\]\(.*?\))/g).map((part, i) => {
                                            const linkMatch = part.match(/\[(.*?)\]\((.*?)\)/);
                                            if (linkMatch) {
                                                return (
                                                    <a
                                                        key={i}
                                                        href={linkMatch[2]}
                                                        className="underline font-medium underline-offset-2 transition-colors hover:opacity-80 decoration-terracotta/40 text-terracotta"
                                                    >
                                                        {linkMatch[1]}
                                                    </a>
                                                );
                                            }
                                            return <span key={i}>{part}</span>;
                                        })}
                                        <p
                                            className={`mt-1 text-[10px] ${
                                                msg.type === "user"
                                                    ? "text-white/60"
                                                    : "text-dark-muted"
                                            }`}
                                        >
                                            {msg.time}
                                        </p>
                                    </div>
                                </div>
                            ))}

                            {isThinking && (
                                <div className="flex justify-start">
                                    <div className="rounded-2xl rounded-bl-md bg-cream-100 px-3.5 py-2.5 text-sm font-inter text-dark-secondary">
                                        <div className="flex items-center gap-2">
                                            <Loader2 className="h-4 w-4 animate-spin text-terracotta" />
                                            <span>{SUPPORT_CHAT_MESSAGES.thinking}</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div ref={messagesEndRef} />
                        </div>

                        {showForm && (
                            <div className="space-y-2.5 border-t border-clay/20 px-4 pb-3 pt-3">
                                <div className="flex items-center justify-between">
                                    <p className="text-xs font-inter font-medium text-dark-muted">
                                        Share the issue details
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => setShowForm(false)}
                                        className="text-xs font-inter font-medium text-terracotta transition-colors hover:text-terracotta-600"
                                    >
                                        Back to chat
                                    </button>
                                </div>
                                <input
                                    type="text"
                                    placeholder="Subject"
                                    value={subject}
                                    onChange={(e) => setSubject(e.target.value)}
                                    className="w-full rounded-xl border border-gray-200 bg-cream-100 px-3 py-2 text-sm font-inter focus:border-terracotta/50 focus:outline-none focus:ring-1 focus:ring-terracotta/30"
                                />
                                <textarea
                                    placeholder="Describe your issue..."
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    rows={3}
                                    className="w-full resize-none rounded-xl border border-gray-200 bg-cream-100 px-3 py-2 text-sm font-inter focus:border-terracotta/50 focus:outline-none focus:ring-1 focus:ring-terracotta/30"
                                />
                                <input
                                    type="email"
                                    placeholder="Your email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full rounded-xl border border-gray-200 bg-cream-100 px-3 py-2 text-sm font-inter focus:border-terracotta/50 focus:outline-none focus:ring-1 focus:ring-terracotta/30"
                                />
                                <button
                                    onClick={handleSubmitIssue}
                                    disabled={
                                        isSubmitting ||
                                        !subject.trim() ||
                                        !description.trim() ||
                                        !email.trim()
                                    }
                                    className="flex w-full items-center justify-center gap-2 text-sm !py-2.5 btn-primary disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            Submitting...
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle className="h-4 w-4" />
                                            Submit Issue
                                        </>
                                    )}
                                </button>
                            </div>
                        )}

                        {!showForm && (
                            <div className="border-t border-clay/20 bg-white">
                                <div className="flex gap-2 overflow-x-auto px-4 py-2 scrollbar-hide">
                                    {CHAT_QUICK_ACTIONS.map((action) => (
                                        <button
                                            key={action.id}
                                            onClick={() => void handleQuickAction(action)}
                                            className="flex flex-shrink-0 items-center gap-1.5 rounded-full border border-terracotta/20 bg-terracotta/5 px-3 py-1.5 transition-colors hover:bg-terracotta/10"
                                        >
                                            <action.icon className="h-3.5 w-3.5 text-terracotta" />
                                            <span className="text-xs font-inter font-medium text-terracotta-800">
                                                {action.label}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                                <div className="px-4 pb-3 pt-1">
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            placeholder="Ask about any workshop..."
                                            value={customQuery}
                                            onChange={(e) => setCustomQuery(e.target.value)}
                                            onKeyDown={(e) =>
                                                e.key === "Enter" && void sendChatMessage()
                                            }
                                            className="flex-1 rounded-xl border border-gray-200 bg-cream-100 px-3 py-2 text-sm font-inter focus:border-terracotta/50 focus:outline-none focus:ring-1 focus:ring-terracotta/30"
                                        />
                                        <button
                                            onClick={() => void sendChatMessage()}
                                            disabled={!customQuery.trim() || isThinking}
                                            className="rounded-xl bg-terracotta p-2 text-white transition-colors hover:bg-terracotta-600 disabled:opacity-40"
                                            aria-label="Send"
                                        >
                                            <Send className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
