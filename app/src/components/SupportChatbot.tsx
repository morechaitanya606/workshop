"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Bot, MessageCircle, PhoneCall, Send, X } from "lucide-react";
import { useParams, usePathname } from "next/navigation";
import { getChatbotConfig } from "@/lib/api-client";
import {
    ChatbotRequestError,
    sendChatbotMessage,
    type ChatbotHistoryPayload,
} from "@/lib/chatbot-client";
import { getChatbotStrings } from "@/lib/chatbot-i18n";
import {
    CHATBOT_MULTILINGUAL,
    localeFromBrowserLanguage,
    resolveChatLocale,
    type ChatLocale,
} from "@/lib/chatbot-language";
import {
    getSafeChatHref,
    normalizePhoneNumber,
    parseChatMessageContent,
    type ChatbotStage,
} from "@/lib/chatbot-text";
import { CONTACT_PHONE_NUMBERS } from "@/lib/contact";

type SupportChatbotProps = {
    mode?: "floating" | "embedded";
    clientApiKey?: string | null;
};

type ChatMessage = {
    id: string;
    role: "user" | "bot";
    content: string;
    /** The welcome text is rendered from the current UI language, so it has no stored content. */
    kind?: "welcome" | "error";
    showBookingButton?: boolean;
    /** Left out of the conversation history sent to the model (lead details, errors). */
    excludeFromHistory?: boolean;
    /** Set on error messages: the text to resend and the user message it belongs to. */
    retryText?: string;
    retryOfId?: string;
};

const HISTORY_TURNS = 8;
const HISTORY_TURN_CHARS = 500;
const MAX_INPUT_CHARS = 1000;
const WELCOME_MESSAGE: ChatMessage = {
    id: "welcome-message",
    role: "bot",
    content: "",
    kind: "welcome",
};

function buildHistory(messages: ChatMessage[]): ChatbotHistoryPayload[] {
    return messages
        .filter((message) => message.kind === undefined && !message.excludeFromHistory)
        .filter((message) => message.content.trim().length > 0)
        .slice(-HISTORY_TURNS)
        .map((message) => ({
            role: message.role === "bot" ? ("assistant" as const) : ("user" as const),
            content: message.content.slice(0, HISTORY_TURN_CHARS),
        }));
}

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

/**
 * Renders reply text with [label](href) links and **bold**. Link targets come from model
 * output and stored FAQ text, so they are validated first: only same-site paths and
 * http(s), mailto and tel survive; anything else (javascript:, data:, //host) shows as text.
 */
function renderMessageContent(content: string) {
    return parseChatMessageContent(content).map((segment, index) => {
        if (segment.type === "link") {
            const opensNewTab = segment.kind === "external";

            return (
                <a
                    key={`link-${index}`}
                    href={segment.href}
                    target={opensNewTab ? "_blank" : undefined}
                    rel={segment.kind === "internal" ? undefined : "noopener noreferrer"}
                    className="font-medium text-[#0b6b5f] underline decoration-[#0b6b5f]/35 underline-offset-2 transition-colors hover:text-[#075E54]"
                >
                    {segment.label}
                </a>
            );
        }

        if (segment.type === "bold") {
            return <strong key={`bold-${index}`}>{segment.text}</strong>;
        }

        return <span key={`text-${index}`}>{segment.text}</span>;
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
    const [uiLocale, setUiLocale] = useState<ChatLocale>("en");
    const hasChosenLocaleRef = useRef(false);
    const messagesEndRef = useRef<HTMLDivElement | null>(null);
    const strings = getChatbotStrings(uiLocale);

    // English-only by default. In multilingual mode, start in the browser language; once the
    // visitor types, their own language wins.
    useEffect(() => {
        if (
            CHATBOT_MULTILINGUAL &&
            !hasChosenLocaleRef.current &&
            typeof navigator !== "undefined"
        ) {
            setUiLocale(localeFromBrowserLanguage(navigator.language));
        }
    }, []);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        messagesEndRef.current?.scrollIntoView({
            behavior: prefersReducedMotion ? "auto" : "smooth",
        });
    }, [isOpen, isTyping, messages, prefersReducedMotion]);

    useEffect(() => {
        if (isOpen && messages.length === 0) {
            setMessages([WELCOME_MESSAGE]);
        }
    }, [isOpen, messages.length]);

    // Only fetch once the widget is actually opened. This used to run on mount for every
    // visitor on every route (the widget is mounted from the root layout), which cost one
    // uncacheable API call and 1-3 service-role queries per page view for the ~99% of
    // visitors who never open it.
    useEffect(() => {
        if (shouldHideFloatingWidget || !isOpen || chatbotConfig) {
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
    }, [chatbotConfig, clientApiKey, contextWorkshopId, isOpen, shouldHideFloatingWidget]);

    // The booking URL comes from the config API (host-editable), so validate it like any link.
    const bookingHref =
        getSafeChatHref(
            chatbotConfig?.bookingUrl ||
                (contextWorkshopId ? `/workshop/${contextWorkshopId}` : "/explore")
        )?.href ?? "/explore";

    const openChat = () => {
        setIsLauncherOpen(false);
        setIsOpen(true);
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

    const sendMessage = async (rawText: string, baseMessages: ChatMessage[]) => {
        const trimmed = rawText.trim().slice(0, MAX_INPUT_CHARS);
        if (!trimmed || isTyping) {
            return;
        }

        const previousStage = stage;
        const priorHistory = buildHistory(baseMessages);
        // Multilingual mode: the visitor's own language wins over the browser language from
        // here on. Otherwise every reply, and the widget itself, stays in English.
        const replyLocale: ChatLocale = CHATBOT_MULTILINGUAL
            ? resolveChatLocale({ message: trimmed, history: priorHistory, hint: uiLocale }).locale
            : "en";
        hasChosenLocaleRef.current = true;
        setUiLocale(replyLocale);

        const userMessageId = createMessageId();
        const isLeadStep = previousStage === "asking_name" || previousStage === "asking_phone";
        setMessages([
            ...baseMessages,
            {
                id: userMessageId,
                role: "user",
                content: trimmed,
                // Names and phone numbers typed during lead capture never go to the model.
                excludeFromHistory: isLeadStep,
            },
        ]);
        setInput("");
        setIsTyping(true);

        try {
            const response = await sendChatbotMessage({
                message: trimmed,
                stage: previousStage,
                lead: leadDraft,
                // No clientId: the server resolves the client from the API key or the page's
                // workshop; an id alone is not trusted and used to fail the request.
                clientApiKey: clientApiKey ?? undefined,
                contextWorkshopId,
                history: isLeadStep ? [] : priorHistory,
                language: replyLocale,
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
                excludeFromHistory:
                    isLeadStep ||
                    response.askName ||
                    response.askPhone ||
                    response.showBookingButton,
            });
        } catch (error) {
            const failureStrings = getChatbotStrings(replyLocale);
            const isRateLimited = error instanceof ChatbotRequestError && error.status === 429;

            appendMessage({
                id: createMessageId(),
                role: "bot",
                kind: "error",
                content: isRateLimited ? failureStrings.rateLimited : failureStrings.error,
                excludeFromHistory: true,
                retryText: trimmed,
                retryOfId: userMessageId,
            });
        } finally {
            setIsTyping(false);
        }
    };

    const handleSubmit = () => sendMessage(input, messages);

    const handleRetry = (failed: ChatMessage) => {
        if (!failed.retryText) {
            return;
        }

        // Drop the failed attempt (the question and the error) and ask again.
        void sendMessage(
            failed.retryText,
            messages.filter(
                (message) => message.id !== failed.id && message.id !== failed.retryOfId
            )
        );
    };

    const inputPlaceholder =
        stage === "asking_name"
            ? strings.placeholderName
            : stage === "asking_phone"
              ? strings.placeholderPhone
              : strings.placeholderIdle;
    const showQuickReplies =
        messages.length === 1 && messages[0]?.kind === "welcome" && stage === "idle" && !isTyping;
    const launcherBottomClass = isWorkshopPage
        ? "bottom-[calc(var(--floating-support-bottom)+6rem)] lg:bottom-6"
        : "bottom-[var(--floating-support-bottom)] lg:bottom-[var(--floating-support-bottom)]";
    const supportMenuBottomClass = isWorkshopPage
        ? "bottom-[calc(var(--floating-support-bottom)+10rem)] lg:bottom-24"
        : "bottom-[calc(var(--floating-support-bottom)+4.5rem)] lg:bottom-24";
    const floatingPanelClass =
        mode === "embedded"
            ? "h-[min(100vh,720px)] w-full"
            : isWorkshopPage
              ? `fixed left-3 right-3 z-[70] max-h-[50dvh] sm:max-h-[600px] sm:left-auto sm:w-[min(calc(100vw-2rem),24rem)] lg:max-h-[calc(100dvh-6rem)] ${launcherBottomClass} sm:right-[var(--floating-edge-offset)]`
              : `fixed z-[70] w-[calc(100vw-1.5rem)] max-h-[calc(100dvh-8rem)] sm:max-h-[600px] max-w-sm sm:max-w-md ${launcherBottomClass} right-3 sm:right-[var(--floating-edge-offset)]`;
    const supportMenuClass = `fixed z-[70] w-[min(calc(100vw-2rem),22rem)] rounded-[28px] border border-black/5 bg-white p-3 shadow-[0_24px_60px_rgba(15,23,42,0.18)] ${supportMenuBottomClass} right-[var(--floating-edge-offset)]`;
    const launcherButtonClass = isWorkshopPage
        ? `fixed z-[70] flex h-12 w-12 items-center justify-center rounded-full bg-[#25D366] text-white shadow-[0_16px_40px_rgba(37,211,102,0.35)] transition-transform hover:scale-[1.02] ${launcherBottomClass} right-[var(--floating-edge-offset)] lg:h-14 lg:w-14`
        : `fixed z-[70] flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-[0_16px_40px_rgba(37,211,102,0.35)] transition-transform hover:scale-[1.02] ${launcherBottomClass} right-[var(--floating-edge-offset)]`;

    const panelContent = (
        <div
            className={`flex flex-col overflow-hidden rounded-[28px] border border-black/5 bg-[#EFEAE2] shadow-[0_24px_60px_rgba(7,94,84,0.28)] ${floatingPanelClass}`}
        >
            <div className="flex items-center justify-between bg-[#075E54] px-4 py-3 text-white">
                <div className="min-w-0">
                    <p className="truncate text-sm font-inter font-semibold">
                        {chatbotConfig?.clientName || "Workshop Assistant"}
                    </p>
                    <p className="text-[11px] font-inter text-white/75">{strings.subtitle}</p>
                </div>
                {mode === "floating" && (
                    <button
                        type="button"
                        onClick={closeChat}
                        className="shrink-0 rounded-full p-2 transition-colors hover:bg-white/10"
                        aria-label={strings.close}
                    >
                        <X className="h-5 w-5" />
                    </button>
                )}
            </div>

            <div
                role="log"
                aria-live="polite"
                aria-relevant="additions text"
                aria-busy={isTyping}
                className="flex-1 space-y-3 overflow-y-auto bg-[linear-gradient(180deg,rgba(255,255,255,0.34),rgba(255,255,255,0.1))] px-3 py-4"
            >
                {messages.map((message, index) => (
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
                            <div className="whitespace-pre-wrap break-words">
                                {renderMessageContent(
                                    message.kind === "welcome"
                                        ? strings.welcome(chatbotConfig?.clientName)
                                        : message.content
                                )}
                            </div>
                            {message.showBookingButton && (
                                <a
                                    href={bookingHref}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="mt-3 inline-flex items-center justify-center rounded-full bg-[#25D366] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#1fa855]"
                                >
                                    {strings.completeBooking}
                                </a>
                            )}
                            {message.kind === "error" &&
                                message.retryText &&
                                index === messages.length - 1 &&
                                !isTyping && (
                                    <button
                                        type="button"
                                        onClick={() => handleRetry(message)}
                                        className="mt-3 inline-flex items-center justify-center rounded-full border border-[#075E54]/30 bg-white px-4 py-1.5 text-xs font-semibold text-[#075E54] transition-colors hover:bg-[#ecfff4]"
                                    >
                                        {strings.retry}
                                    </button>
                                )}
                        </div>
                    </div>
                ))}

                {showQuickReplies && (
                    <div
                        role="group"
                        aria-label={strings.quickRepliesLabel}
                        className="flex flex-wrap gap-2 pt-1"
                    >
                        {strings.quickReplies.map((reply) => (
                            <button
                                key={reply}
                                type="button"
                                onClick={() => void sendMessage(reply, messages)}
                                className="rounded-full border border-[#075E54]/25 bg-white px-3 py-1.5 text-xs font-inter font-medium text-[#075E54] transition-colors hover:bg-[#ecfff4]"
                            >
                                {reply}
                            </button>
                        ))}
                    </div>
                )}

                {isTyping && (
                    <div className="flex justify-start">
                        <div
                            role="status"
                            className="rounded-2xl rounded-bl-md bg-[#F1F0F0] px-4 py-2.5 text-sm font-inter text-slate-700 shadow-sm"
                        >
                            {strings.typing}
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
                            // Ignore the Enter that confirms an IME composition (Devanagari
                            // keyboards), which would otherwise send half-typed text.
                            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                                event.preventDefault();
                                void handleSubmit();
                            }
                        }}
                        placeholder={inputPlaceholder}
                        aria-label={strings.inputLabel}
                        maxLength={MAX_INPUT_CHARS}
                        enterKeyHint="send"
                        autoComplete="off"
                        className="h-11 flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 text-sm font-inter text-slate-900 outline-none transition-colors focus:border-[#25D366]"
                    />
                    <button
                        type="button"
                        onClick={() => void handleSubmit()}
                        disabled={!input.trim() || isTyping}
                        className="flex h-11 w-11 items-center justify-center rounded-full bg-[#25D366] text-white transition-colors hover:bg-[#1fa855] disabled:cursor-not-allowed disabled:bg-slate-300"
                        aria-label={strings.send}
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
                        className={supportMenuClass}
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
                                rel="noopener noreferrer"
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
                        className={launcherButtonClass}
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
