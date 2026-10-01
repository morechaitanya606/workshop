import { describe, expect, it } from "vitest";
import {
    detectChatLanguage,
    localeFromBrowserLanguage,
    resolveChatLocale,
} from "@/lib/chatbot-language";
import { CHATBOT_STRINGS } from "@/lib/chatbot-i18n";

describe("detectChatLanguage", () => {
    it.each([
        ["What is the price of the pottery workshop?", "en"],
        ["Do you have anything for kids this weekend", "en"],
        ["I want to book a seat", "en"],
        ["Hi, I'm Kay and I want to know the fee for baking", "en"],
        ["क्या इस वीकेंड कोई वर्कशॉप है?", "hi"],
        ["मुझे बुकिंग कैसे करनी है", "hi"],
        ["पॉटरी वर्कशॉप की फीस कितनी है", "hi"],
        ["या वीकेंडला कोणती वर्कशॉप आहे?", "mr"],
        ["मला बुकिंग कशी करायची आहे", "mr"],
        ["वर्कशॉपसाठी किती फी आहे", "mr"],
        ["pottery workshop ki fees kitni hai", "hi-Latn"],
        ["mujhe booking kaise karni hai", "hi-Latn"],
        ["kya weekend pe koi workshop hai", "hi-Latn"],
        ["pottery workshop chi kimmat kiti ahe", "mr-Latn"],
        ["mala booking kashi karaychi aahe", "mr-Latn"],
        ["tumchya kade kay workshops aahet", "mr-Latn"],
    ])("detects %s as %s", (text, locale) => {
        const detection = detectChatLanguage(text);
        expect(detection.locale).toBe(locale);
        expect(detection.confident).toBe(true);
    });

    it("splits language and script in the result", () => {
        expect(detectChatLanguage("मला मदत हवी आहे")).toMatchObject({
            language: "mr",
            script: "devanagari",
        });
        expect(detectChatLanguage("mujhe madad chahiye")).toMatchObject({
            language: "hi",
            script: "latin",
        });
    });

    it("is not confident about content-free messages", () => {
        expect(detectChatLanguage("9876543210").confident).toBe(false);
        expect(detectChatLanguage("ok").confident).toBe(false);
        expect(detectChatLanguage("").confident).toBe(false);
        expect(detectChatLanguage("Chait").confident).toBe(false);
    });

    it("does not mistake an English name for Hinglish", () => {
        expect(detectChatLanguage("My name is Kay and I like pottery").locale).toBe("en");
    });
});

describe("resolveChatLocale", () => {
    it("uses the latest message when it is clear", () => {
        expect(
            resolveChatLocale({
                message: "What is the price?",
                history: [{ role: "user", content: "मुझे वर्कशॉप चाहिए" }],
                hint: "hi",
            }).locale
        ).toBe("en");
    });

    it("falls back to the last clear user turn for ambiguous messages", () => {
        expect(
            resolveChatLocale({
                message: "ok",
                history: [
                    { role: "user", content: "pottery workshop ki fees kitni hai" },
                    { role: "assistant", content: "It is Rs 1800" },
                ],
            }).locale
        ).toBe("hi-Latn");
    });

    it("falls back to the client hint, then English", () => {
        expect(resolveChatLocale({ message: "9876543210", hint: "mr-IN" }).locale).toBe("mr");
        expect(resolveChatLocale({ message: "9876543210", hint: "hi-Latn" }).locale).toBe(
            "hi-Latn"
        );
        expect(resolveChatLocale({ message: "9876543210" }).locale).toBe("en");
    });
});

describe("localeFromBrowserLanguage", () => {
    it("maps browser language tags", () => {
        expect(localeFromBrowserLanguage("hi-IN")).toBe("hi");
        expect(localeFromBrowserLanguage("mr")).toBe("mr");
        expect(localeFromBrowserLanguage("en-GB")).toBe("en");
        expect(localeFromBrowserLanguage(undefined)).toBe("en");
    });
});

describe("chatbot strings", () => {
    it("define every key for every locale, with a non-empty translation", () => {
        const keys = Object.keys(CHATBOT_STRINGS.en) as Array<keyof typeof CHATBOT_STRINGS.en>;

        for (const [locale, strings] of Object.entries(CHATBOT_STRINGS)) {
            for (const key of keys) {
                const value = strings[key];
                expect(value, `${locale}.${String(key)}`).toBeDefined();
                if (key === "englishOnlyNote" && locale === "en") {
                    continue;
                }
                if (key === "welcome") {
                    expect((value as (name?: string) => string)("Acme").length).toBeGreaterThan(10);
                } else if (key === "quickReplies") {
                    expect((value as readonly string[]).length).toBe(4);
                } else {
                    expect(String(value).length, `${locale}.${String(key)}`).toBeGreaterThan(0);
                }
            }
        }
    });

    it("uses the right script per locale", () => {
        const devanagari = /[ऀ-ॿ]/;
        expect(CHATBOT_STRINGS.hi.greeting).toMatch(devanagari);
        expect(CHATBOT_STRINGS.mr.greeting).toMatch(devanagari);
        expect(CHATBOT_STRINGS["hi-Latn"].greeting).not.toMatch(devanagari);
        expect(CHATBOT_STRINGS["mr-Latn"].greeting).not.toMatch(devanagari);
        expect(CHATBOT_STRINGS.en.greeting).not.toMatch(devanagari);
    });
});
