import type { Workshop } from "@/lib/data";
import type { Tables } from "@/lib/database.types";
import { resolveSupportChatReply } from "@/lib/support-chat";

export type ChatbotStage = "idle" | "asking_name" | "asking_phone" | "completed";

export type ChatbotFaq = Pick<Tables<"faq">, "id" | "question" | "answer">;
export type ChatbotLanguageMode = "english" | "hinglish" | "hindi" | "marathi";

export type ChatbotLeadDraft = {
    name?: string;
    phone?: string;
    query?: string;
};

export type ChatbotLeadRecord = {
    name: string;
    phone: string;
    query: string;
};

export type ChatbotApiResponse = {
    reply: string;
    showBookingButton: boolean;
    askName: boolean;
    askPhone: boolean;
};

type GroqConfig = {
    apiKey: string;
    endpoint: string;
    model: string;
};

type GenerateChatbotReplyInput = {
    message: string;
    stage: ChatbotStage;
    lead?: ChatbotLeadDraft;
    faqs?: ChatbotFaq[];
    retrieveRelevantFaqs?: (message: string) => Promise<ChatbotFaq[]>;
    workshops?: Workshop[];
    contextWorkshopId?: string | null;
    groq?: GroqConfig | null;
    fetchImpl?: typeof fetch;
    onLeadCaptured?: (lead: ChatbotLeadRecord) => Promise<void>;
    onUnansweredQuestion?: (question: string) => Promise<void>;
};

type GroqChatResponse = {
    choices?: Array<{
        message?: {
            content?: string | null;
        };
    }>;
};

const STOPWORDS = new Set([
    "a",
    "about",
    "an",
    "and",
    "are",
    "can",
    "do",
    "for",
    "how",
    "i",
    "if",
    "in",
    "is",
    "it",
    "me",
    "my",
    "of",
    "on",
    "or",
    "please",
    "the",
    "to",
    "what",
    "when",
    "where",
    "which",
    "with",
    "you",
]);

const LOW_SIGNAL_TOKENS = new Set([
    "detail",
    "details",
    "info",
    "information",
    "latest",
    "new",
    "session",
    "sessions",
    "thing",
    "things",
    "workshop",
    "workshops",
]);

const TOKEN_ALIASES: Record<string, string> = {
    booked: "book",
    booking: "book",
    bookings: "book",
    cancelation: "cancel",
    cancellation: "cancel",
    cancellations: "cancel",
    canceled: "cancel",
    cancelled: "cancel",
    cancelling: "cancel",
    charges: "price",
    charging: "price",
    cost: "price",
    costs: "price",
    detail: "detail",
    details: "detail",
    fee: "price",
    fees: "price",
    included: "include",
    includes: "include",
    including: "include",
    info: "information",
    material: "material",
    materials: "material",
    price: "price",
    prices: "price",
    pricing: "price",
    provide: "include",
    provided: "include",
    provides: "include",
    register: "book",
    registered: "book",
    registration: "book",
    registrations: "book",
    reserve: "book",
    reserved: "book",
    reservation: "book",
    reservations: "book",
    refunds: "refund",
    refunding: "refund",
    rescheduled: "reschedule",
    reschedules: "reschedule",
    rescheduling: "reschedule",
    workshops: "workshop",
};

const BOOKING_KEYWORDS = ["book", "register", "join", "fee", "fees", "price"];
const GROQ_TIMEOUT_MS = 8000;

const HINGLISH_MARKERS = ["aap", "ap", "ka", "kya", "hai", "nahi", "kar", "karna"];

const HINDI_DEVANAGARI_MARKERS = ["है", "क्या", "आप", "मुझे", "कृपया", "नहीं"];
const MARATHI_DEVANAGARI_MARKERS = ["आहे", "काय", "तुम्ही", "मराठी", "होईल", "नाही"];

export const CHATBOT_SYSTEM_PROMPT = `You are a friendly workshop assistant chatbot for a SaaS support widget.

Rules:

* Answer ONLY using provided context.
* Keep answers short, clear, and warm.
* Match the user's language style:
  - English -> English
  - Hindi -> Hindi
  - Hinglish or mixed Hindi-English -> Hinglish
  - Marathi or Marathi-English -> simple Marathi with helpful English words only when natural
* If user shows interest in joining, encourage booking in a natural way.
* If answer is not present in the context, reply exactly:
  'Mujhe exact info nahi mila, please contact support.'
* Do not make up answers.`;

export const CHATBOT_FALLBACK_REPLY = "Mujhe exact info nahi mila, please contact support.";
export const CHATBOT_UNANSWERED_REPLY = CHATBOT_FALLBACK_REPLY;
export const CHATBOT_GREETING_REPLY =
    "Hi! Aap mujhse workshop fee, booking, materials, parking, ya cancellation ke baare mein pooch sakte ho.";
export const CHATBOT_GUIDANCE_REPLY =
    "Aap workshop ke baare mein specific question pooch sakte ho, jaise fee, booking, materials, parking, ya cancellation.";

export const DEFAULT_CHATBOT_FAQS: Array<{
    question: string;
    answer: string;
}> = [
    {
        question: "Do I need any prior experience?",
        answer: "Not at all. Our workshops are designed for complete beginners and hobbyists.",
    },
    {
        question: "What should I bring?",
        answer: "Just bring yourself. Core materials are provided at the venue, and comfortable clothes are recommended.",
    },
    {
        question: "Is parking available at the venue?",
        answer: "Parking availability depends on the venue. Please check the workshop location details or contact us for venue-specific parking information.",
    },
    {
        question: "What if I need to cancel or reschedule?",
        answer: "Cancellation and reschedule eligibility depends on the workshop policy and timing. Please contact us for the latest details on your booking.",
    },
    {
        question: "Can I bring a friend who has not booked?",
        answer: "Each attendee needs their own booking to participate. You can reserve multiple spots during booking if you want to attend together.",
    },
];

function containsDevanagari(value: string) {
    return /[\u0900-\u097f]/.test(value);
}

function containsLatin(value: string) {
    return /[a-z]/i.test(value);
}

export function detectChatbotLanguageMode(value: string): ChatbotLanguageMode {
    const trimmed = value.trim();
    const lower = trimmed.toLowerCase();
    const hasDevanagari = containsDevanagari(trimmed);
    const hasLatin = containsLatin(trimmed);

    if (hasDevanagari) {
        if (MARATHI_DEVANAGARI_MARKERS.some((marker) => trimmed.includes(marker))) {
            return "marathi";
        }

        if (HINDI_DEVANAGARI_MARKERS.some((marker) => trimmed.includes(marker))) {
            return hasLatin ? "hinglish" : "hindi";
        }

        return hasLatin ? "hinglish" : "hindi";
    }

    if (HINGLISH_MARKERS.some((marker) => lower.includes(marker))) {
        return "hinglish";
    }

    return hasLatin ? "english" : "hinglish";
}

export function getChatbotStyleInstruction(languageMode: ChatbotLanguageMode) {
    switch (languageMode) {
        case "hindi":
            return "Reply in simple Hindi. Keep it natural, short, and helpful.";
        case "marathi":
            return "Reply in simple Marathi with light English only when it feels natural.";
        case "hinglish":
            return "Reply in simple Hinglish, friendly and conversational.";
        default:
            return "Reply in clear English, friendly and conversational.";
    }
}

export function normalizeChatText(value: string) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

export function normalizeName(value: string) {
    return value.replace(/\s+/g, " ").trim();
}

export function normalizePhoneNumber(value: string) {
    return value.replace(/\D/g, "");
}

export function isValidPhoneNumber(value: string) {
    return /^\d{10}$/.test(normalizePhoneNumber(value));
}

export function isValidLeadName(value: string) {
    const normalized = normalizeName(value);
    return normalized.length >= 2;
}

export function detectBookingIntent(value: string) {
    const normalized = normalizeChatText(value);
    if (!normalized) {
        return false;
    }

    return BOOKING_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function canonicalizeChatToken(token: string) {
    return TOKEN_ALIASES[token] ?? token;
}

export function tokenizeChatText(
    value: string,
    options: {
        includeLowSignal?: boolean;
    } = {}
) {
    return normalizeChatText(value)
        .split(" ")
        .map(canonicalizeChatToken)
        .filter(
            (token) =>
                token.length > 1 &&
                !STOPWORDS.has(token) &&
                (options.includeLowSignal || !LOW_SIGNAL_TOKENS.has(token))
        );
}

function isGreetingMessage(value: string) {
    const normalized = normalizeChatText(value);
    if (!normalized) {
        return false;
    }

    return /^(hi+|hello+|hey+)$/.test(normalized.replace(/\s+/g, ""));
}

function isGenericWorkshopPrompt(value: string) {
    const broadTokens = tokenizeChatText(value, { includeLowSignal: true });
    if (broadTokens.length === 0) {
        return false;
    }

    return broadTokens.every((token) => LOW_SIGNAL_TOKENS.has(token));
}

function formatWorkshopDate(dateValue: string) {
    const parsed = new Date(`${dateValue}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
        return dateValue;
    }

    return new Intl.DateTimeFormat("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "short",
    }).format(parsed);
}

function formatWorkshopTime(timeValue: string) {
    const [hoursRaw, minutesRaw] = timeValue.split(":");
    const hours = Number(hoursRaw);
    const minutes = Number(minutesRaw);

    if (Number.isNaN(hours) || Number.isNaN(minutes)) {
        return timeValue;
    }

    const date = new Date();
    date.setHours(hours, minutes, 0, 0);

    return new Intl.DateTimeFormat("en-IN", {
        hour: "numeric",
        minute: "2-digit",
    }).format(date);
}

function formatWorkshopPrice(amount: number) {
    return `Rs. ${new Intl.NumberFormat("en-IN").format(amount)}`;
}

function getWorkshopDateTime(workshop: Workshop) {
    const [hours, minutes] = workshop.time.split(":").map((value) => Number(value));
    const parsed = new Date(`${workshop.date}T00:00:00`);
    if (!Number.isNaN(hours) && !Number.isNaN(minutes)) {
        parsed.setHours(hours, minutes, 0, 0);
    }
    return parsed;
}

function getUpcomingWorkshops(workshops: Workshop[], now = new Date()) {
    return [...workshops]
        .filter((workshop) => {
            const workshopDate = getWorkshopDateTime(workshop);
            return !Number.isNaN(workshopDate.getTime()) && workshopDate >= now;
        })
        .sort(
            (left, right) =>
                getWorkshopDateTime(left).getTime() - getWorkshopDateTime(right).getTime()
        );
}

function looksLikeLatestWorkshopRequest(message: string) {
    const normalized = normalizeChatText(message);
    if (!normalized) {
        return false;
    }

    const asksForLatest =
        normalized.includes("latest") ||
        normalized.includes("newest") ||
        normalized.includes("upcoming") ||
        normalized.includes("next");
    const asksForWorkshop =
        normalized.includes("workshop") ||
        normalized.includes("event") ||
        normalized.includes("session") ||
        normalized.includes("class");
    const asksForDetails =
        normalized.includes("detail") ||
        normalized.includes("details") ||
        normalized.includes("about") ||
        normalized.includes("info") ||
        normalized.includes("information");

    return asksForLatest && asksForWorkshop && asksForDetails;
}

function buildLatestWorkshopReply(workshop: Workshop) {
    const learningSnippet =
        workshop.whatYouLearn.length > 0
            ? `You will learn ${workshop.whatYouLearn.slice(0, 3).join(", ")}.`
            : "";
    const materialsSnippet =
        workshop.materialsProvided.length > 0
            ? `Materials included: ${workshop.materialsProvided.slice(0, 3).join(", ")}.`
            : "";
    const hostSnippet = workshop.hostBio
        ? `Hosted by ${workshop.hostName}. ${workshop.hostBio}`
        : `Hosted by ${workshop.hostName}.`;

    return [
        `The next upcoming workshop I can see is ${workshop.title}.`,
        `It is on ${formatWorkshopDate(workshop.date)} at ${formatWorkshopTime(workshop.time)} in ${workshop.location}.`,
        `It costs ${formatWorkshopPrice(workshop.price)} and currently has ${workshop.seatsRemaining} seats left.`,
        hostSnippet,
        learningSnippet,
        materialsSnippet,
        `Open it here: [View workshop](/workshop/${encodeURIComponent(workshop.id)}).`,
    ]
        .filter(Boolean)
        .join(" ");
}

function maybeResolveWorkshopReply(
    message: string,
    workshops: Workshop[] | undefined,
    contextWorkshopId?: string | null
) {
    if (!workshops || workshops.length === 0) {
        return null;
    }

    if (looksLikeLatestWorkshopRequest(message)) {
        const nextWorkshop = getUpcomingWorkshops(workshops)[0];
        if (nextWorkshop) {
            return buildLatestWorkshopReply(nextWorkshop);
        }
    }

    const resolution = resolveSupportChatReply(message, workshops, {
        contextWorkshopId,
    });

    if (resolution.intent === "workshop_detail" || resolution.intent === "workshop_list") {
        return resolution.reply;
    }

    return null;
}

export function buildFaqContext(faqs: ChatbotFaq[]) {
    return faqs.map((faq) => `Q: ${faq.question}\nA: ${faq.answer}`).join("\n\n");
}

export function buildGroqUserPrompt(message: string, faqs: ChatbotFaq[]) {
    const languageMode = detectChatbotLanguageMode(message);

    return `Reply Style:\n${getChatbotStyleInstruction(
        languageMode
    )}\n\nContext:\n${buildFaqContext(faqs)}\n\nUser Question:\n${message}`;
}

export function buildFaqFallbackReply(faqs: ChatbotFaq[]) {
    return faqs[0]?.answer?.trim() || CHATBOT_FALLBACK_REPLY;
}

async function requestGroqReply(
    message: string,
    faqs: ChatbotFaq[],
    groq: GroqConfig,
    fetchImpl: typeof fetch
) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS);

    try {
        const response = await fetchImpl(groq.endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${groq.apiKey}`,
            },
            body: JSON.stringify({
                model: groq.model,
                temperature: 0.2,
                max_tokens: 220,
                messages: [
                    {
                        role: "system",
                        content: CHATBOT_SYSTEM_PROMPT,
                    },
                    {
                        role: "user",
                        content: buildGroqUserPrompt(message, faqs),
                    },
                ],
            }),
            cache: "no-store",
            signal: controller.signal,
        });

        if (!response.ok) {
            throw new Error(`Groq request failed with status ${response.status}.`);
        }

        const payload = (await response.json()) as GroqChatResponse;
        const reply = payload.choices?.[0]?.message?.content?.trim();
        if (!reply) {
            return null;
        }

        return reply;
    } finally {
        clearTimeout(timeoutId);
    }
}

export async function generateChatbotReply(
    input: GenerateChatbotReplyInput
): Promise<ChatbotApiResponse> {
    const message = input.message.trim();
    const lead = input.lead || {};

    if (input.stage === "asking_name") {
        if (!isValidLeadName(message)) {
            return {
                reply: "Booking continue karne se pehle please apna valid name share karo.",
                showBookingButton: false,
                askName: true,
                askPhone: false,
            };
        }

        return {
            reply: "Perfect. Ab please apna 10-digit phone number share karo.",
            showBookingButton: false,
            askName: false,
            askPhone: true,
        };
    }

    if (input.stage === "asking_phone") {
        const name = normalizeName(lead.name || "");
        if (!isValidLeadName(name)) {
            return {
                reply: "Phone number share karne se pehle please apna name batao.",
                showBookingButton: false,
                askName: true,
                askPhone: false,
            };
        }

        if (!isValidPhoneNumber(message)) {
            return {
                reply: "Please valid 10-digit phone number share karo.",
                showBookingButton: false,
                askName: false,
                askPhone: true,
            };
        }

        await input.onLeadCaptured?.({
            name,
            phone: normalizePhoneNumber(message),
            query: (lead.query || "").trim() || "Workshop booking",
        });

        return {
            reply: "Thanks! Neeche button se aap booking complete kar sakte ho.",
            showBookingButton: true,
            askName: false,
            askPhone: false,
        };
    }

    if (isGreetingMessage(message)) {
        return {
            reply: CHATBOT_GREETING_REPLY,
            showBookingButton: false,
            askName: false,
            askPhone: false,
        };
    }

    if (detectBookingIntent(message)) {
        return {
            reply: "Booking start karne ke liye please apna name batao.",
            showBookingButton: false,
            askName: true,
            askPhone: false,
        };
    }

    const workshopReply = maybeResolveWorkshopReply(
        message,
        input.workshops,
        input.contextWorkshopId
    );
    if (workshopReply) {
        return {
            reply: workshopReply,
            showBookingButton: false,
            askName: false,
            askPhone: false,
        };
    }

    if (isGenericWorkshopPrompt(message)) {
        return {
            reply: CHATBOT_GUIDANCE_REPLY,
            showBookingButton: false,
            askName: false,
            askPhone: false,
        };
    }

    let relevantFaqs: ChatbotFaq[] = [];

    try {
        if (input.retrieveRelevantFaqs) {
            relevantFaqs = await input.retrieveRelevantFaqs(message);
        } else {
            relevantFaqs = input.faqs ?? [];
        }
    } catch {
        return {
            reply: CHATBOT_FALLBACK_REPLY,
            showBookingButton: false,
            askName: false,
            askPhone: false,
        };
    }

    if (relevantFaqs.length === 0) {
        await input.onUnansweredQuestion?.(message);

        return {
            reply: CHATBOT_UNANSWERED_REPLY,
            showBookingButton: false,
            askName: false,
            askPhone: false,
        };
    }

    const fetchImpl = input.fetchImpl || fetch;
    let reply = buildFaqFallbackReply(relevantFaqs);

    if (input.groq?.apiKey) {
        try {
            const groqReply = await requestGroqReply(message, relevantFaqs, input.groq, fetchImpl);
            if (groqReply) {
                reply = groqReply;
            }
        } catch {
            reply = buildFaqFallbackReply(relevantFaqs);
        }
    }

    return {
        reply,
        showBookingButton: false,
        askName: false,
        askPhone: false,
    };
}
