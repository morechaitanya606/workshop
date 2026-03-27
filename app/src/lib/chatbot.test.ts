import { describe, expect, it, vi } from "vitest";
import type { Workshop } from "@/lib/data";
import {
    buildFaqContext,
    buildGroqUserPrompt,
    CHATBOT_FALLBACK_REPLY,
    CHATBOT_GREETING_REPLY,
    CHATBOT_GUIDANCE_REPLY,
    DEFAULT_CHATBOT_FAQS,
    detectBookingIntent,
    detectChatbotLanguageMode,
    generateChatbotReply,
    getChatbotStyleInstruction,
    isValidPhoneNumber,
    normalizePhoneNumber,
    type ChatbotFaq,
} from "@/lib/chatbot";

const faqRows: ChatbotFaq[] = DEFAULT_CHATBOT_FAQS.map((faq, index) => ({
    id: String(index + 1),
    question: faq.question,
    answer: faq.answer,
}));

const workshopRows: Workshop[] = [
    {
        id: "pottery-101",
        title: "Pottery Basics Studio Session",
        description: "A hands-on pottery workshop for beginners.",
        category: "Pottery",
        price: 1800,
        location: "Kala Studio",
        city: "Pune",
        duration: "2 hours",
        date: "2026-04-05",
        time: "11:00",
        maxSeats: 16,
        seatsRemaining: 6,
        coverImage: "/images/workshops/IMG_20260306_125435.webp",
        galleryImages: ["/images/workshops/IMG_20260306_125435.webp"],
        rating: 4.9,
        reviewCount: 24,
        hostName: "Aarav",
        hostAvatar: "/images/workshops/IMG-20260306-WA0006.webp",
        hostBio: "Ceramics mentor with beginner-friendly classes.",
        whatYouLearn: ["wheel throwing", "centering clay", "finishing basics"],
        materialsProvided: ["clay", "tools", "apron"],
    },
];

describe("chatbot helpers", () => {
    it("detects booking intent keywords", () => {
        expect(detectBookingIntent("How do I book this workshop?")).toBe(true);
        expect(detectBookingIntent("Tell me about parking")).toBe(false);
    });

    it("detects language style and builds the matching Groq prompt", () => {
        expect(detectChatbotLanguageMode("What is the workshop fee?")).toBe("english");
        expect(detectChatbotLanguageMode("Aapka workshop fee kya hai?")).toBe("hinglish");
        expect(detectChatbotLanguageMode("क्या workshop fee hai?")).toBe("hinglish");
        expect(detectChatbotLanguageMode("तुम्ही फी सांगू शकता का?")).toBe("marathi");

        const prompt = buildGroqUserPrompt("Aapka workshop fee kya hai?", faqRows.slice(0, 2));
        expect(prompt).toContain("Reply Style:");
        expect(prompt).toContain(getChatbotStyleInstruction("hinglish"));
    });

    it("builds FAQ context in the expected prompt format", () => {
        const context = buildFaqContext(faqRows.slice(0, 2));

        expect(context).toContain("Q:");
        expect(context).toContain("A:");
    });

    it("normalizes and validates phone numbers", () => {
        expect(normalizePhoneNumber("+91 98765-43210")).toBe("919876543210");
        expect(isValidPhoneNumber("9876543210")).toBe(true);
        expect(isValidPhoneNumber("12345")).toBe(false);
    });
});

describe("generateChatbotReply", () => {
    it("asks for a name before booking", async () => {
        const result = await generateChatbotReply({
            message: "I want to join this workshop",
            stage: "idle",
            faqs: [],
        });

        expect(result.askName).toBe(true);
        expect(result.reply).toBe("To start the booking, please share your name.");
    });

    it("mirrors Hinglish for booking prompts when the user asks in Hinglish", async () => {
        const result = await generateChatbotReply({
            message: "Mujhe ye workshop join karni hai",
            stage: "idle",
            faqs: [],
        });

        expect(result.askName).toBe(true);
        expect(result.reply).toBe("Booking start karne ke liye please apna name batao.");
    });

    it("responds to greetings with a guided welcome", async () => {
        const result = await generateChatbotReply({
            message: "hiii",
            stage: "idle",
            faqs: [],
        });

        expect(result.reply).toBe(CHATBOT_GREETING_REPLY);
        expect(result.showBookingButton).toBe(false);
    });

    it("guides broad workshop prompts instead of forcing a wrong FAQ", async () => {
        const result = await generateChatbotReply({
            message: "workshop",
            stage: "idle",
            faqs: [],
        });

        expect(result.reply).toBe(CHATBOT_GUIDANCE_REPLY);
    });

    it("answers latest workshop detail questions from live workshop data", async () => {
        const result = await generateChatbotReply({
            message: "details of latest workshop",
            stage: "idle",
            faqs: [],
            workshops: workshopRows,
        });

        expect(result.reply).toContain("Pottery Basics Studio Session");
        expect(result.reply).toContain("[View workshop](/workshop/pottery-101)");
    });

    it("moves from name collection to phone collection", async () => {
        const result = await generateChatbotReply({
            message: "Chait",
            stage: "asking_name",
            faqs: [],
        });

        expect(result.askPhone).toBe(true);
        expect(result.reply).toBe("Perfect. Now please share your 10-digit phone number.");
    });

    it("captures a valid lead and enables booking", async () => {
        const onLeadCaptured = vi.fn().mockResolvedValue(undefined);

        const result = await generateChatbotReply({
            message: "9876543210",
            stage: "asking_phone",
            lead: {
                name: "Chait",
                query: "I want to book a pottery workshop",
            },
            faqs: [],
            onLeadCaptured,
        });

        expect(result.showBookingButton).toBe(true);
        expect(onLeadCaptured).toHaveBeenCalledWith({
            name: "Chait",
            phone: "9876543210",
            query: "I want to book a pottery workshop",
        });
    });

    it("logs unanswered questions when retrieval returns no matches", async () => {
        const onUnansweredQuestion = vi.fn().mockResolvedValue(undefined);

        const result = await generateChatbotReply({
            message: "Do you have corporate team retreats in Goa?",
            stage: "idle",
            faqs: [],
            retrieveRelevantFaqs: vi.fn().mockResolvedValue([]),
            onUnansweredQuestion,
        });

        expect(result.reply).toContain("contact support");
        expect(onUnansweredQuestion).toHaveBeenCalledWith(
            "Do you have corporate team retreats in Goa?"
        );
    });

    it("falls closed when retrieval fails", async () => {
        const result = await generateChatbotReply({
            message: "What is your refund policy?",
            stage: "idle",
            faqs: [],
            retrieveRelevantFaqs: vi.fn().mockRejectedValue(new Error("embedding failed")),
        });

        expect(result.reply).toBe(CHATBOT_FALLBACK_REPLY);
    });

    it("uses Groq answers when context exists", async () => {
        const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [
                    {
                        message: {
                            content:
                                "Parking venue ke hisaab se depend karta hai. Please workshop details check karo.",
                        },
                    },
                ],
            }),
        } as Response);

        const result = await generateChatbotReply({
            message: "Is parking available?",
            stage: "idle",
            faqs: [],
            retrieveRelevantFaqs: vi.fn().mockResolvedValue([faqRows[2]]),
            groq: {
                apiKey: "test-key",
                endpoint: "https://example.com/groq",
                model: "llama3-8b-8192",
            },
            fetchImpl,
        });

        expect(result.reply).toContain("Parking venue ke hisaab se");
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });
});
