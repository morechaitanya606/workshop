"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Bot, MessageCircle, PhoneCall, Send, X } from "lucide-react";
import { useParams, usePathname } from "next/navigation";
import { askChatbot, getChatbotConfig } from "@/lib/api-client";
import { normalizePhoneNumber, type ChatbotStage } from "@/lib/chatbot";
import { CONTACT_PHONE_NUMBERS } from "@/lib/contact";

type SupportChatbotProps = {
    mode?: "floating" | "embedded";
    clientApiKey?: string | null;
};

type ChatMessage = {
    id: string;
    role: "user" | "bot";
    content: string;
    showBookingButton?: boolean;
};

type LeadDraft = {
    name: string;
    phone: string;
    query: string;
};

type ChatbotConfigState = {
    bookingUrl: string;
    clientId: string | null;
    clientName: string;
};

function createMessageId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildWelcomeMessage(clientName?: string) {
    return {
        id: "welcome-message",
        role: "bot" as const,
        content: clientName
            ? `Hi! Main ${clientName} ka AI assistant hoon. Aap mujhse fee, booking, materials, parking, ya cancellation ke baare mein pooch sakte ho.`
            : "Hi! Aap mujhse workshop FAQs, booking, fee, materials, parking, ya cancellation ke baare mein pooch sakte ho.",
    };
}

function buildWhatsAppHref(pathname: string, contextWorkshopId: string | null) {
    const primarySupportNumber = CONTACT_PHONE_NUMBERS[0]?.value ?? "+917028478109";
    const supportMessage = [
        "Hi! I need help with a workshop booking.",
        contextWorkshopId ? `Workshop page: /workshop/${contextWorkshopId}` : `Page: ${pathname}`,
    ]
        .filter(Boolean)
        .join("\n");

    return `https://wa.me/${normalizePhoneNumber(primarySupportNumber)}?text=${encodeURIComponent(
        supportMessage
    )}`;
}

function renderMessageContent(content: string) {
    return content.split(/(\[.*?\]\(.*?\))/g).map((part, index) => {
        const linkMatch = part.match(/\[(.*?)\]\((.*?)\)/);
        if (linkMatch) {
            return (
                <a
                    key={`${linkMatch[2]}-${index}`}
                    href={linkMatch[2]}
                    className="font-medium text-[#0b6b5f] underline decoration-[#0b6b5f]/35 underline-offset-2 transition-colors hover:text-[#075E54]"
                >
                    {linkMatch[1]}
                </a>
            );
        }

        return <span key={`text-${index}`}>{part}</span>;
    });
}

export default function SupportChatbot({
    mode = "floating",
    clientApiKey = null,
}: SupportChatbotProps) {
    const prefersReducedMotion = Boolean(useReducedMotion());
    const pathname = usePathname();
    const params = useParams<{ id?: string }>();
    const shouldHideFloatingWidget = mode === "floating" && pathname.startsWith("/chatbot/embed");

    const isWorkshopPage = pathname.startsWith("/workshop/");
    const contextWorkshopId = isWorkshopPage && typeof params?.id === "string" ? params.id : null;
    const whatsappHref = buildWhatsAppHref(pathname, contextWorkshopId);

    const [isOpen, setIsOpen] = useState(mode === "embedded");
    const [isLauncherOpen, setIsLauncherOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [stage, setStage] = useState<ChatbotStage>("idle");
    const [leadDraft, setLeadDraft] = useState<LeadDraft>({
        name: "",
        phone: "",
        query: "",
    });
    const [isTyping, setIsTyping] = useState(false);
    const [chatbotConfig, setChatbotConfig] = useState<ChatbotConfigState | null>(null);
    const messagesEndRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        messagesEndRef.current?.scrollIntoView({
            behavior: prefersReducedMotion ? "auto" : "smooth",
        });
    }, [isOpen, isTyping, messages, prefersReducedMotion]);

    useEffect(() => {
        if (mode === "embedded" && messages.length === 0) {
            setMessages([buildWelcomeMessage()]);
        }
    }, [messages.length, mode]);

    useEffect(() => {
        if (shouldHideFloatingWidget) {
            return;
        }

        let cancelled = false;

        const loadChatbotConfig = async () => {
            try {
                const result = await getChatbotConfig({
                    clientApiKey,
                    contextWorkshopId,
                });

                if (!cancelled) {
                    setChatbotConfig({
                        bookingUrl: result.bookingUrl,
                        clientId: result.clientId,
                        clientName: result.clientName,
                    });

                    setMessages((current) => {
                        if (current.length === 0) {
                            return [buildWelcomeMessage(result.clientName)];
                        }

                        if (current[0]?.id !== "welcome-message") {
                            return current;
                        }

                        return [buildWelcomeMessage(result.clientName), ...current.slice(1)];
                    });
                }
            } catch {
                if (!cancelled) {
                    setChatbotConfig({
                        bookingUrl: contextWorkshopId
                            ? `/workshop/${contextWorkshopId}`
                            : "/explore",
                        clientId: null,
                        clientName: "Workshop Assistant",
                    });
                }
            }
        };

        void loadChatbotConfig();

        return () => {
            cancelled = true;
        };
    }, [clientApiKey, contextWorkshopId, shouldHideFloatingWidget]);

    const bookingHref =
        chatbotConfig?.bookingUrl ||
        (contextWorkshopId ? `/workshop/${contextWorkshopId}` : "/explore");

    const openChat = () => {
        setIsLauncherOpen(false);
        setIsOpen(true);
        setMessages((current) =>
            current.length > 0
                ? current
                : [buildWelcomeMessage(chatbotConfig?.clientName || "Workshop Assistant")]
        );
    };

    const closeChat = () => {
        if (mode === "embedded") {
            return;
        }

        setIsOpen(false);
    };

    const appendMessage = (message: ChatMessage) => {
        setMessages((current) => [...current, message]);
    };

    const handleSubmit = async () => {
        const trimmed = input.trim();
        if (!trimmed || isTyping) {
            return;
        }

        const previousStage = stage;
        appendMessage({
            id: createMessageId(),
            role: "user",
            content: trimmed,
        });
        setInput("");
        setIsTyping(true);

        try {
            const response = await askChatbot({
                message: trimmed,
                stage: previousStage,
                lead: leadDraft,
                clientId: chatbotConfig?.clientId ?? undefined,
                clientApiKey: clientApiKey ?? undefined,
                contextWorkshopId,
            });

            if (previousStage === "idle" && response.askName) {
                setLeadDraft((current) => ({
                    ...current,
                    query: trimmed,
                }));
            }

            if (previousStage === "asking_name" && response.askPhone) {
                setLeadDraft((current) => ({
                    ...current,
                    name: trimmed,
                }));
            }

            if (previousStage === "asking_phone" && response.showBookingButton) {
                setLeadDraft((current) => ({
                    ...current,
                    phone: normalizePhoneNumber(trimmed),
                }));
            }

            if (response.askName) {
                setStage("asking_name");
            } else if (response.askPhone) {
                setStage("asking_phone");
            } else if (response.showBookingButton) {
                setStage("completed");
            } else {
                setStage("idle");
            }

            appendMessage({
                id: createMessageId(),
                role: "bot",
                content: response.reply,
                showBookingButton: response.showBookingButton,
            });
        } catch {
            appendMessage({
                id: createMessageId(),
                role: "bot",
                content:
                    "Sorry, main abhi reply nahi kar pa raha hoon. Please thodi der baad try karo.",
            });
        } finally {
            setIsTyping(false);
        }
    };

    const inputPlaceholder =
        stage === "asking_name"
            ? "Apna name enter karo"
            : stage === "asking_phone"
              ? "Apna phone number enter karo"
              : "Apna message type karo";

    const panelContent = (
        <div
            className={`flex flex-col overflow-hidden rounded-[28px] border border-black/5 bg-[#EFEAE2] shadow-[0_24px_60px_rgba(7,94,84,0.28)] ${
                mode === "embedded"
                    ? "h-[min(100vh,720px)] w-full"
                    : "fixed bottom-20 right-3 z-[70] w-[calc(100vw-1.5rem)] max-w-sm sm:right-4 sm:max-w-md lg:bottom-6 lg:right-6"
            }`}
        >
            <div className="flex items-center justify-between bg-[#075E54] px-4 py-3 text-white">
                <div className="min-w-0">
                    <p className="truncate text-sm font-inter font-semibold">
                        {chatbotConfig?.clientName || "Workshop Assistant"}
                    </p>
                    <p className="text-[11px] font-inter text-white/75">
                        FAQ, booking, and lead support
                    </p>
                </div>
                {mode === "floating" && (
                    <button
                        type="button"
                        onClick={closeChat}
                        className="rounded-full p-2 transition-colors hover:bg-white/10"
                        aria-label="Close chat"
                    >
                        <X className="h-4 w-4" />
                    </button>
                )}
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto bg-[linear-gradient(180deg,rgba(255,255,255,0.34),rgba(255,255,255,0.1))] px-3 py-4">
                {messages.map((message) => (
                    <div
                        key={message.id}
                        className={`flex ${
                            message.role === "user" ? "justify-end" : "justify-start"
                        }`}
                    >
                        <div
                            className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm font-inter leading-relaxed shadow-sm ${
                                message.role === "user"
                                    ? "rounded-br-md bg-[#DCF8C6] text-slate-900"
                                    : "rounded-bl-md bg-[#F1F0F0] text-slate-800"
                            }`}
                        >
                            <div className="whitespace-pre-wrap">
                                {renderMessageContent(message.content)}
                            </div>
                            {message.showBookingButton && (
                                <a
                                    href={bookingHref}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mt-3 inline-flex items-center justify-center rounded-full bg-[#25D366] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#1fa855]"
                                >
                                    Complete Booking
                                </a>
                            )}
                        </div>
                    </div>
                ))}

                {isTyping && (
                    <div className="flex justify-start">
                        <div className="rounded-2xl rounded-bl-md bg-[#F1F0F0] px-4 py-2.5 text-sm font-inter text-slate-700 shadow-sm">
                            Assistant is typing...
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            <div className="border-t border-black/5 bg-white px-3 py-3">
                <div className="flex items-center gap-2">
                    <input
                        type="text"
                        value={input}
                        onChange={(event) => setInput(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") {
                                event.preventDefault();
                                void handleSubmit();
                            }
                        }}
                        placeholder={inputPlaceholder}
                        className="h-11 flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 text-sm font-inter text-slate-900 outline-none transition-colors focus:border-[#25D366]"
                    />
                    <button
                        type="button"
                        onClick={() => void handleSubmit()}
                        disabled={!input.trim() || isTyping}
                        className="flex h-11 w-11 items-center justify-center rounded-full bg-[#25D366] text-white transition-colors hover:bg-[#1fa855] disabled:cursor-not-allowed disabled:bg-slate-300"
                        aria-label="Send message"
                    >
                        <Send className="h-4 w-4" />
                    </button>
                </div>
            </div>
        </div>
    );

    if (mode === "embedded") {
        return panelContent;
    }

    if (shouldHideFloatingWidget) {
        return null;
    }

    return (
        <>
            <AnimatePresence>
                {!isOpen && isLauncherOpen && (
                    <motion.div
                        initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
                        animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                        exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
                        transition={{ duration: 0.2 }}
                        className="fixed bottom-36 right-4 z-[70] w-[min(calc(100vw-2rem),22rem)] rounded-[28px] border border-black/5 bg-white p-3 shadow-[0_24px_60px_rgba(15,23,42,0.18)] lg:bottom-24 lg:right-6"
                    >
                        <p className="px-1 pb-2 text-xs font-inter font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Choose Support
                        </p>

                        <div className="space-y-2">
                            <button
                                type="button"
                                onClick={openChat}
                                className="flex w-full items-center gap-3 rounded-[22px] border border-[#25D366]/20 bg-[#ecfff4] px-3 py-3 text-left transition-colors hover:bg-[#dff9ea]"
                            >
                                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#25D366] text-white shadow-sm">
                                    <Bot className="h-5 w-5" />
                                </span>
                                <span className="min-w-0">
                                    <span className="block text-sm font-semibold text-slate-900">
                                        AI Chatbot
                                    </span>
                                    <span className="block text-xs leading-relaxed text-slate-600">
                                        FAQ answers, booking help, and lead capture
                                    </span>
                                </span>
                            </button>

                            <a
                                href={whatsappHref}
                                target="_blank"
                                rel="noreferrer"
                                onClick={() => setIsLauncherOpen(false)}
                                className="flex w-full items-center gap-3 rounded-[22px] border border-[#075E54]/10 bg-[#f5fbfa] px-3 py-3 text-left transition-colors hover:bg-[#ebf6f4]"
                            >
                                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#075E54] text-white shadow-sm">
                                    <PhoneCall className="h-5 w-5" />
                                </span>
                                <span className="min-w-0">
                                    <span className="block text-sm font-semibold text-slate-900">
                                        WhatsApp Help
                                    </span>
                                    <span className="block text-xs leading-relaxed text-slate-600">
                                        Chat with a person for direct support
                                    </span>
                                </span>
                            </a>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {!isOpen && (
                    <motion.button
                        type="button"
                        onClick={() => setIsLauncherOpen((current) => !current)}
                        initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
                        animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
                        exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
                        transition={{ duration: 0.2 }}
                        className="fixed bottom-20 right-4 z-[70] flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-[0_16px_40px_rgba(37,211,102,0.35)] transition-transform hover:scale-[1.02] lg:bottom-6 lg:right-6"
                        aria-expanded={isLauncherOpen}
                        aria-label="Open support options"
                    >
                        {isLauncherOpen ? (
                            <X className="h-6 w-6" />
                        ) : (
                            <MessageCircle className="h-6 w-6" />
                        )}
                    </motion.button>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 20 }}
                        animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                        exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 20 }}
                        transition={{ duration: 0.2 }}
                    >
                        {panelContent}
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
