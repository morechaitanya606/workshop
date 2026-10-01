import type { Workshop } from "@/lib/data";
import type { Tables } from "@/lib/database.types";
import { resolveSupportChatReply } from "@/lib/support-chat";
import {
    isValidLeadName,
    isValidPhoneNumber,
    normalizeChatText,
    normalizeName,
    normalizePhoneNumber,
    type ChatbotStage,
} from "@/lib/chatbot-text";
import { getChatbotStrings, type ChatbotStrings } from "@/lib/chatbot-i18n";
import { CHATBOT_MULTILINGUAL, resolveChatLocale, type ChatLocale } from "@/lib/chatbot-language";
import {
    requestChatbotCompletion,
    type ChatbotGroqConfig,
    type ChatbotLlmProvider,
} from "@/lib/chatbot-llm";
import {
    buildChatbotMessages,
    buildRetrievalQuery,
    normalizeChatHistory,
    type ChatbotHistoryTurn,
} from "@/lib/chatbot-prompt";

// Re-exported from the client-safe module so existing server imports of this file keep
// working. Client components must import from "@/lib/chatbot-text" directly.
export {
    normalizeChatText,
    normalizeName,
    normalizePhoneNumber,
    isValidPhoneNumber,
    isValidLeadName,
} from "@/lib/chatbot-text";
export type { ChatbotStage } from "@/lib/chatbot-text";

export type ChatbotFaq = Pick<Tables<"faq">, "id" | "question" | "answer">;

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

type GenerateChatbotReplyInput = {
    message: string;
    stage: ChatbotStage;
    lead?: ChatbotLeadDraft;
    faqs?: ChatbotFaq[];
    retrieveRelevantFaqs?: (message: string) => Promise<ChatbotFaq[]>;
    workshops?: Workshop[];
    contextWorkshopId?: string | null;
    /** Model providers in failover order (see getChatbotLlmProviders). */
    llmProviders?: ChatbotLlmProvider[];
    /** Single-provider shorthand; ignored when `llmProviders` is non-empty. */
    groq?: ChatbotGroqConfig | null;
    fetchImpl?: typeof fetch;
    /** Earlier turns of this conversation, oldest first (the current message excluded). */
    history?: ChatbotHistoryTurn[];
    /** Client language hint (a locale or a BCP-47 tag); used only when the message is ambiguous. */
    languageHint?: string | null;
    /** Answer in the visitor's language. Defaults to CHATBOT_MULTILINGUAL (off: English only). */
    multilingual?: boolean;
    clientName?: string | null;
    now?: Date;
    retryDelayMs?: number;
    onLeadCaptured?: (lead: ChatbotLeadRecord) => Promise<void>;
    onUnansweredQuestion?: (question: string) => Promise<void>;
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

const MAX_REPLY_CHARS = 1500;

export const CHATBOT_FALLBACK_REPLY = getChatbotStrings("en").fallback;
export const CHATBOT_GREETING_REPLY = getChatbotStrings("en").greeting;
export const CHATBOT_GUIDANCE_REPLY = getChatbotStrings("en").guidance;

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

/**
 * Lowercases and strips punctuation but keeps Devanagari, so Hindi and Marathi intent can be
 * recognised. (`normalizeChatText` is ASCII-only and would erase them.)
 */
function normalizeIntentText(value: string) {
    return value
        .toLowerCase()
        .replace(/[’']/g, " ")
        .replace(/[^a-z0-9ऀ-ॿ\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

const BOOKING_DESIRE =
    /\b(want|wanna|would like|i d like|like to|need|ready|interested|plan to|planning to|going to|let s|lets|sign me up|signup|sign up)\b/;
const BOOKING_VERB = /\b(book|booking|reserve|register|enrol+|enroll|join|attend)\b/;
const BOOKING_DIRECT =
    /\b(book|reserve|register|enrol+|enroll) (me|us|a|my|the|this|it|that|now|seat|seats|spot|spots|ticket|tickets)\b|\bsign me up\b|\bjoin (this|the|it|now)\b/;
const BOOKING_ROMAN_INDIC =
    /\b(book|booking|register|registration|join|reserve|seat|seats|spot)\b.*\b(karna|karo|kar do|kardo|karni|karein|karen|karaycha|karaychi|karaychay|karayche|kara|chahiye|chahie|pahije|hava|havi|havay)\b/;
const BOOKING_NATIVE_INDIC =
    /(बुक|बुकिंग|रजिस्टर|जॉइन|जॉईन|नोंदणी|सीट|जागा).*(करना|करनी|करो|कर दो|करें|करायचे|करायची|करायचं|करा|चाहिए|चाहिये|हवी|हवे|हवा|पाहिजे)/;
const INFO_QUESTION =
    /\b(how|what|why|price|prices|fee|fees|cost|costs|refund|refunds|cancel|cancellation|policy|process|steps|procedure|payment|details|info|information|kitna|kitni|kitne|kiti|kaise|kase|kasa|kya|kay)\b|कितना|कितनी|कितने|किती|कैसे|कसे|कसा|क्या|काय|रिफंड|कैंसिल|कॅन्सल|कीमत|फीस|किंमत|पॉलिसी/;

/**
 * True only when the visitor clearly wants to start booking ("I want to book this", "book
 * karna hai", "बुक करना है"). Questions about price, refunds or how booking works are NOT
 * booking intent: they used to trigger the name/phone flow and never got an answer.
 */
export function detectBookingIntent(value: string) {
    const normalized = normalizeIntentText(value);
    if (!normalized || INFO_QUESTION.test(normalized)) {
        return false;
    }

    if (BOOKING_NATIVE_INDIC.test(normalized) || BOOKING_ROMAN_INDIC.test(normalized)) {
        return true;
    }

    return (
        BOOKING_DIRECT.test(normalized) ||
        (BOOKING_DESIRE.test(normalized) && BOOKING_VERB.test(normalized))
    );
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

const GREETING_WORD =
    /^(hi+|hii+|hello+|hey+|heya|hola|namaste|namaskar|namaskaar|pranam|ram|jai|jay|good|morning|afternoon|evening|there|everyone|team|bot|assistant|ji|sir|madam|bhai|dost|नमस्ते|नमस्कार|हाय|हेलो|हॅलो|हैलो|राम|जय|शुभ|प्रभात|सुप्रभात)$/;
const THANKS_WORD =
    /^(thanks|thank|thankyou|thx|ty|dhanyavad|dhanyavaad|shukriya|aabhar|abhar|धन्यवाद|शुक्रिया|आभार|आभारी|आभारी आहे)$/;
const THANKS_FILLER =
    /^(you|u|so|much|a|lot|very|ji|bhai|ok|okay|again|for|help|the|your|it|great|nice|good|बहुत|खूप|आहे|है|भाई|जी|मदद|के|लिए|साठी)$/;

function intentTokens(value: string) {
    return normalizeIntentText(value).split(" ").filter(Boolean);
}

function isGreetingMessage(value: string) {
    const tokens = intentTokens(value);
    return (
        tokens.length > 0 &&
        tokens.length <= 4 &&
        tokens.every((token) => GREETING_WORD.test(token)) &&
        // "good" / "ram" alone are not greetings.
        tokens.some((token) => !/^(good|ram|jai|jay|there|everyone|team|ji)$/.test(token))
    );
}

function isThanksMessage(value: string) {
    const tokens = intentTokens(value);
    return (
        tokens.length > 0 &&
        tokens.length <= 6 &&
        tokens.some((token) => THANKS_WORD.test(token)) &&
        tokens.every((token) => THANKS_WORD.test(token) || THANKS_FILLER.test(token))
    );
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
    return `₹${new Intl.NumberFormat("en-IN").format(amount)}`;
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

export function buildFaqFallbackReply(faqs: ChatbotFaq[], fallback = CHATBOT_FALLBACK_REPLY) {
    return faqs[0]?.answer?.trim() || fallback;
}

function reply(
    text: string,
    flags: Partial<Omit<ChatbotApiResponse, "reply">> = {}
): ChatbotApiResponse {
    return {
        reply: text,
        showBookingButton: false,
        askName: false,
        askPhone: false,
        ...flags,
    };
}

const UNSURE_PATTERN = /#{1,2}\s*UNSURE\s*#{1,2}/gi;
const PROMPT_LEAK_PATTERN = /<\/?context>|HOW TO ANSWER|\bSECURITY\b\s*\n\s*-/;

/**
 * Cleans the model output: strips the internal UNSURE marker (and reports it so the question
 * can be logged for hosts), caps the length, and refuses to echo the system prompt.
 */
export function finalizeModelReply(raw: string, strings: Pick<ChatbotStrings, "fallback">) {
    const unsure = new RegExp(UNSURE_PATTERN.source, "i").test(raw);
    const text = raw
        .replace(UNSURE_PATTERN, "")
        // The widget renders plain text plus [text](/path) links, so **bold** / __bold__
        // (which gpt-oss likes to add despite the prompt) would show as literal asterisks.
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/__(.+?)__/g, "$1")
        .trim();

    if (!text || PROMPT_LEAK_PATTERN.test(text)) {
        return { reply: strings.fallback, unsure: true };
    }

    const bounded =
        text.length > MAX_REPLY_CHARS ? `${text.slice(0, MAX_REPLY_CHARS - 1).trimEnd()}…` : text;
    return { reply: bounded, unsure };
}

function withEnglishNote(locale: ChatLocale, strings: ChatbotStrings, text: string) {
    return locale === "en" || !strings.englishOnlyNote
        ? text
        : `${strings.englishOnlyNote}\n${text}`;
}

export async function generateChatbotReply(
    input: GenerateChatbotReplyInput
): Promise<ChatbotApiResponse> {
    const message = input.message.trim();
    const lead = input.lead || {};
    const history = normalizeChatHistory(input.history);
    const multilingual = input.multilingual ?? CHATBOT_MULTILINGUAL;
    const locale: ChatLocale = multilingual
        ? resolveChatLocale({ message, history, hint: input.languageHint }).locale
        : "en";
    const strings = getChatbotStrings(locale);

    if (input.stage === "asking_name") {
        if (!isValidLeadName(message)) {
            return reply(strings.invalidName, { askName: true });
        }

        return reply(strings.askPhone, { askPhone: true });
    }

    if (input.stage === "asking_phone") {
        const name = normalizeName(lead.name || "");
        if (!isValidLeadName(name)) {
            return reply(strings.missingName, { askName: true });
        }

        if (!isValidPhoneNumber(message)) {
            return reply(strings.invalidPhone, { askPhone: true });
        }

        await input.onLeadCaptured?.({
            name,
            phone: normalizePhoneNumber(message),
            query: (lead.query || "").trim() || "Workshop booking",
        });

        return reply(strings.bookingComplete, { showBookingButton: true });
    }

    if (isGreetingMessage(message)) {
        return reply(strings.greeting);
    }

    if (isThanksMessage(message)) {
        return reply(strings.thanks);
    }

    if (detectBookingIntent(message)) {
        return reply(strings.askName, { askName: true });
    }

    const fetchImpl = input.fetchImpl || fetch;
    let relevantFaqs: ChatbotFaq[] | null = null;

    const loadFaqs = async () => {
        if (relevantFaqs) {
            return relevantFaqs;
        }

        try {
            relevantFaqs = input.retrieveRelevantFaqs
                ? await input.retrieveRelevantFaqs(buildRetrievalQuery(message, history))
                : (input.faqs ?? []);
        } catch {
            relevantFaqs = [];
        }

        return relevantFaqs;
    };

    // Primary path: one grounded model call with workshops, platform policy, FAQs and the
    // recent conversation as context, failing over across providers. English unless the
    // multilingual switch is on, in which case it answers in the visitor's language.
    if (input.llmProviders?.length || input.groq?.apiKey) {
        const faqs = await loadFaqs();
        const completion = await requestChatbotCompletion({
            providers: input.llmProviders,
            groq: input.groq,
            fetchImpl,
            retryDelayMs: input.retryDelayMs,
            messages: buildChatbotMessages({
                locale,
                englishOnly: !multilingual,
                message,
                history,
                workshops: input.workshops,
                faqs: faqs.length > 0 ? faqs : DEFAULT_CHATBOT_FAQS,
                contextWorkshopId: input.contextWorkshopId,
                clientName: input.clientName,
                now: input.now,
            }),
        });

        if (completion) {
            const finalized = finalizeModelReply(completion, strings);
            if (finalized.unsure) {
                await input.onUnansweredQuestion?.(message).catch(() => undefined);
            }

            return reply(finalized.reply);
        }
    }

    // Degraded path (no model key, or the model failed): answer from live workshop data and
    // FAQs without inventing anything. Facts stay in English, so say so for other languages.
    const workshopReply = maybeResolveWorkshopReply(
        message,
        input.workshops,
        input.contextWorkshopId
    );
    if (workshopReply) {
        return reply(withEnglishNote(locale, strings, workshopReply));
    }

    if (isGenericWorkshopPrompt(message)) {
        return reply(strings.guidance);
    }

    const faqs = await loadFaqs();
    if (faqs.length === 0) {
        await input.onUnansweredQuestion?.(message);
        return reply(strings.fallback);
    }

    const faqAnswer = buildFaqFallbackReply(faqs, strings.fallback);
    return reply(
        String(faqs[0]?.id ?? "").startsWith("default-")
            ? withEnglishNote(locale, strings, faqAnswer)
            : faqAnswer
    );
}
