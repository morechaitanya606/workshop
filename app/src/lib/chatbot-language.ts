/**
 * Language and script detection for the chatbot. Pure and client-safe: no server imports.
 *
 * The assistant answers in the language AND script the visitor wrote in:
 *   en       English
 *   hi       Hindi in Devanagari
 *   mr       Marathi in Devanagari
 *   hi-Latn  Hinglish (Hindi typed in Roman letters)
 *   mr-Latn  Marathi typed in Roman letters
 *
 * Detection is a cheap heuristic (no model call): Devanagari ratio first, then marker words.
 * It also reports whether it is `confident`, so callers can fall back to earlier messages in
 * the conversation or the browser language when the latest message says nothing ("ok", "9876").
 */

export type ChatLanguage = "en" | "hi" | "mr";
export type ChatScript = "latin" | "devanagari";
export type ChatLocale = "en" | "hi" | "mr" | "hi-Latn" | "mr-Latn";

export type ChatLanguageDetection = {
    language: ChatLanguage;
    script: ChatScript;
    locale: ChatLocale;
    confident: boolean;
};

export const CHAT_LOCALES: readonly ChatLocale[] = ["en", "hi", "mr", "hi-Latn", "mr-Latn"];

/**
 * The chatbot replies in English only unless NEXT_PUBLIC_CHATBOT_MULTILINGUAL=true. Visitors
 * may still write in Hindi or Marathi; the model reads it and answers in English. NEXT_PUBLIC_
 * so the widget's own strings follow the same switch (inlined into the client at build time).
 */
export const CHATBOT_MULTILINGUAL = process.env.NEXT_PUBLIC_CHATBOT_MULTILINGUAL === "true";

const DEVANAGARI_CHAR = /[ऀ-ॿ]/g;
const LATIN_LETTER = /[a-zA-Z]/g;

const HINDI_NATIVE_MARKERS = new Set([
    "है",
    "हैं",
    "क्या",
    "मुझे",
    "आप",
    "आपका",
    "आपकी",
    "कैसे",
    "कितना",
    "कितनी",
    "कितने",
    "कहाँ",
    "कहां",
    "चाहिए",
    "चाहिये",
    "सकता",
    "सकती",
    "सकते",
    "हूँ",
    "हूं",
    "नहीं",
    "और",
    "में",
    "का",
    "की",
    "के",
    "को",
    "से",
    "कब",
    "मैं",
    "हम",
    "करना",
    "करें",
    "कीजिए",
    "बताइए",
    "बताओ",
    "बताएं",
    "कृपया",
]);

const MARATHI_NATIVE_MARKERS = new Set([
    "आहे",
    "आहेत",
    "आहात",
    "काय",
    "मला",
    "तुम्ही",
    "तुमचे",
    "तुमची",
    "तुमचा",
    "तुमच्या",
    "कसे",
    "कसा",
    "कशी",
    "किती",
    "कुठे",
    "पाहिजे",
    "हवे",
    "हवी",
    "हवा",
    "करायचे",
    "करायची",
    "करायचा",
    "करू",
    "मी",
    "आम्ही",
    "आणि",
    "होईल",
    "नाही",
    "कधी",
    "सांगा",
    "द्या",
    "मध्ये",
]);

const MARATHI_NATIVE_SUFFIXES = ["साठी", "मध्ये"];

const HINDI_ROMAN_MARKERS = new Set([
    "kya",
    "kyaa",
    "hai",
    "hain",
    "hoon",
    "mujhe",
    "mera",
    "meri",
    "mere",
    "aap",
    "aapka",
    "aapki",
    "aapke",
    "aapko",
    "kitna",
    "kitni",
    "kitne",
    "kab",
    "kaise",
    "kaisa",
    "kahan",
    "kahaan",
    "kyun",
    "kyu",
    "chahiye",
    "chahie",
    "karna",
    "karo",
    "karen",
    "karein",
    "kare",
    "kar",
    "batao",
    "bataiye",
    "batayein",
    "bataye",
    "batana",
    "hoga",
    "hogi",
    "sakta",
    "sakti",
    "sakte",
    "wala",
    "wali",
    "wale",
    "mein",
    "ka",
    "ki",
    "ke",
    "ko",
    "se",
    "bhi",
    "abhi",
    "kripya",
    "dhanyavad",
    "shukriya",
    "namaste",
    "accha",
    "acha",
    "theek",
    "thik",
    "bhai",
    "yaar",
    "milega",
    "milegi",
    "lagega",
    "paise",
    "aur",
    "toh",
    "tum",
    "tumhara",
    "apna",
    "apni",
    "apne",
    "hum",
    "humein",
    "iska",
    "iski",
    "uska",
    "kaun",
    "kaunsi",
    "kaunsa",
    "konsa",
    "yahan",
    "kal",
    "dikhao",
    "kuch",
    "kuchh",
    "bahut",
    "bohot",
    "zyada",
    "sasta",
    "mehnga",
]);

const MARATHI_ROMAN_MARKERS = new Set([
    "kay",
    "ahe",
    "aahe",
    "aahet",
    "ahet",
    "aahes",
    "mala",
    "tumhi",
    "tumhala",
    "tumchi",
    "tumcha",
    "tumche",
    "tumchya",
    "kiti",
    "kasa",
    "kase",
    "kashi",
    "kuthe",
    "pahije",
    "havay",
    "hava",
    "havi",
    "kadhi",
    "ani",
    "aani",
    "mhanje",
    "sang",
    "saang",
    "sanga",
    "kara",
    "karaycha",
    "karaychi",
    "karayche",
    "karu",
    "majha",
    "maza",
    "mazha",
    "amhi",
    "aamhi",
    "kimmat",
    "udya",
    "sadhya",
]);

/** Roman words both Hindi and Marathi speakers type, so they score for either. */
const SHARED_ROMAN_MARKERS = new Set(["nahi", "nahin", "dhanyavaad"]);

const ENGLISH_MARKERS = new Set([
    "the",
    "is",
    "are",
    "was",
    "what",
    "how",
    "can",
    "do",
    "does",
    "did",
    "i",
    "you",
    "me",
    "my",
    "we",
    "for",
    "to",
    "of",
    "in",
    "on",
    "at",
    "this",
    "that",
    "it",
    "and",
    "or",
    "a",
    "an",
    "with",
    "about",
    "there",
    "when",
    "where",
    "which",
    "who",
    "any",
    "have",
    "has",
    "want",
    "need",
    "tell",
    "show",
    "please",
    "thanks",
    "thank",
    "book",
    "price",
    "workshop",
    "workshops",
    "class",
    "classes",
    "weekend",
    "kids",
    "refund",
    "cancel",
    "much",
    "cost",
]);

function tokenizeRoman(value: string) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter(Boolean);
}

function tokenizeNative(value: string) {
    return value
        .replace(/[^ऀ-ॿa-zA-Z0-9\s]/g, " ")
        .replace(/[।॥]/g, " ")
        .split(/\s+/)
        .filter(Boolean);
}

function toLocale(language: ChatLanguage, script: ChatScript): ChatLocale {
    if (language === "en") {
        return "en";
    }

    if (script === "devanagari") {
        return language;
    }

    return language === "hi" ? "hi-Latn" : "mr-Latn";
}

function buildDetection(
    language: ChatLanguage,
    script: ChatScript,
    confident: boolean
): ChatLanguageDetection {
    return { language, script, locale: toLocale(language, script), confident };
}

export function localeToLanguage(locale: ChatLocale): {
    language: ChatLanguage;
    script: ChatScript;
} {
    switch (locale) {
        case "hi":
            return { language: "hi", script: "devanagari" };
        case "mr":
            return { language: "mr", script: "devanagari" };
        case "hi-Latn":
            return { language: "hi", script: "latin" };
        case "mr-Latn":
            return { language: "mr", script: "latin" };
        default:
            return { language: "en", script: "latin" };
    }
}

export function isChatLocale(value: unknown): value is ChatLocale {
    return typeof value === "string" && (CHAT_LOCALES as readonly string[]).includes(value);
}

/** Detects the language and script of one message. */
export function detectChatLanguage(text: string): ChatLanguageDetection {
    const value = (text || "").trim();
    if (!value) {
        return buildDetection("en", "latin", false);
    }

    const devanagariCount = (value.match(DEVANAGARI_CHAR) || []).length;
    const latinCount = (value.match(LATIN_LETTER) || []).length;

    if (devanagariCount >= 2 && devanagariCount >= latinCount) {
        const tokens = tokenizeNative(value);
        let hindiScore = 0;
        let marathiScore = 0;

        for (const token of tokens) {
            if (HINDI_NATIVE_MARKERS.has(token)) {
                hindiScore += 1;
            }
            if (MARATHI_NATIVE_MARKERS.has(token)) {
                marathiScore += 1;
            } else if (
                token.length > 4 &&
                MARATHI_NATIVE_SUFFIXES.some((suffix) => token.endsWith(suffix))
            ) {
                marathiScore += 1;
            }
        }

        // The script is certain, but without a marker word Hindi vs Marathi is a guess (a bare
        // "नमस्कार" is both), so let history or the client hint decide in that case.
        return buildDetection(
            marathiScore > hindiScore ? "mr" : "hi",
            "devanagari",
            hindiScore + marathiScore > 0
        );
    }

    const tokens = tokenizeRoman(value);
    if (tokens.length === 0) {
        return buildDetection("en", "latin", false);
    }

    let hindiScore = 0;
    let marathiScore = 0;
    let englishCount = 0;

    for (const token of tokens) {
        if (HINDI_ROMAN_MARKERS.has(token)) {
            hindiScore += 1;
        }
        if (MARATHI_ROMAN_MARKERS.has(token)) {
            marathiScore += 1;
        }
        if (SHARED_ROMAN_MARKERS.has(token)) {
            hindiScore += 1;
            marathiScore += 1;
        }
        if (ENGLISH_MARKERS.has(token)) {
            englishCount += 1;
        }
    }

    const best = Math.max(hindiScore, marathiScore);
    const romanisedIndic = best >= 2 || (best >= 1 && best / tokens.length >= 0.25);
    if (romanisedIndic && best > englishCount * 0.5) {
        return buildDetection(marathiScore > hindiScore ? "mr" : "hi", "latin", true);
    }

    const confidentEnglish =
        (englishCount >= 1 && tokens.length >= 2) || (best === 0 && tokens.length >= 4);
    return buildDetection("en", "latin", confidentEnglish);
}

/** Maps a BCP-47 style browser language (`hi-IN`, `mr`) to a locale. */
export function localeFromBrowserLanguage(value: string | null | undefined): ChatLocale {
    const primary = (value || "").toLowerCase().split(/[-_]/)[0];
    if (primary === "hi") {
        return "hi";
    }
    if (primary === "mr") {
        return "mr";
    }
    return "en";
}

export type ResolveChatLocaleInput = {
    message: string;
    /** Earlier turns, oldest first. Only `user` turns are used. */
    history?: Array<{ role: string; content: string }>;
    /** Browser or client supplied hint, either a locale or a BCP-47 tag. */
    hint?: string | null;
};

/**
 * Picks the reply locale: the latest message when it carries a clear signal, else the most
 * recent earlier user message that does, else the client hint, else English.
 */
export function resolveChatLocale({ message, history = [], hint }: ResolveChatLocaleInput) {
    const current = detectChatLanguage(message);
    if (current.confident) {
        return current;
    }

    for (let index = history.length - 1; index >= 0; index -= 1) {
        const turn = history[index];
        if (turn?.role !== "user") {
            continue;
        }

        const earlier = detectChatLanguage(turn.content);
        // A Devanagari message is never answered in an earlier Latin-script language.
        if (
            earlier.confident &&
            !(current.script === "devanagari" && earlier.script !== "devanagari")
        ) {
            return earlier;
        }
    }

    if (hint) {
        const locale = isChatLocale(hint) ? hint : localeFromBrowserLanguage(hint);
        const { language, script } = localeToLanguage(locale);

        if (current.script === "devanagari") {
            // Keep the script the visitor typed; take only the Hindi/Marathi choice from the hint.
            return language === "en" ? current : buildDetection(language, "devanagari", false);
        }

        return buildDetection(language, script, false);
    }

    return current;
}
