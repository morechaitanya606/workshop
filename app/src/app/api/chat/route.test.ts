import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Workshop } from "@/lib/data";
import { POST } from "./route";
import { CHATBOT_GREETING_REPLY, DEFAULT_CHATBOT_FAQS } from "@/lib/chatbot";
import { resolveChatbotClient } from "@/lib/chatbot-clients";
import { isChatbotMatchBelowThreshold, searchChatbotFaqs } from "@/lib/chatbot-vector-search";
import { getGroqConfig, getHuggingFaceEmbeddingConfig } from "@/lib/env";
import { assertRateLimit } from "@/lib/rate-limit";
import { loadSupportChatWorkshops } from "@/lib/support-chat";
import { createSupabaseServiceClient } from "@/lib/supabase-server";

vi.mock("@/lib/chatbot-clients", () => ({
    resolveChatbotClient: vi.fn(),
}));

vi.mock("@/lib/chatbot-vector-search", () => ({
    searchChatbotFaqs: vi.fn(),
    isChatbotMatchBelowThreshold: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
    getGroqConfig: vi.fn(),
    getHuggingFaceEmbeddingConfig: vi.fn(),
}));

vi.mock("@/lib/support-chat", async () => {
    const actual = await vi.importActual<typeof import("@/lib/support-chat")>("@/lib/support-chat");

    return {
        ...actual,
        loadSupportChatWorkshops: vi.fn(),
    };
});

vi.mock("@/lib/rate-limit", () => ({
    assertRateLimit: vi.fn(),
    getRateLimitKey: vi.fn(() => "chat-test"),
}));

vi.mock("@/lib/supabase-server", () => ({
    createSupabaseServiceClient: vi.fn(),
    isSupabaseServiceConfigured: true,
}));

function createInsertClient() {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({
        insert,
    }));

    return {
        from,
        insert,
    };
}

describe("POST /api/chat", () => {
    const faqRows = DEFAULT_CHATBOT_FAQS.map((faq, index) => ({
        id: String(index + 1),
        client_id: "client-1",
        question: faq.question,
        answer: faq.answer,
        similarity: 0.91,
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

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(assertRateLimit).mockResolvedValue({ ok: true } as const);
        vi.mocked(loadSupportChatWorkshops).mockResolvedValue(workshopRows);
        vi.mocked(getGroqConfig).mockReturnValue(null);
        vi.mocked(getHuggingFaceEmbeddingConfig).mockReturnValue({
            apiKey: "hf-test",
            endpoint: "https://example.com/hf",
            model: "intfloat/multilingual-e5-base",
        });
        vi.mocked(createSupabaseServiceClient).mockReturnValue({} as any);
        vi.mocked(resolveChatbotClient).mockResolvedValue({
            client: {
                id: "client-1",
                host_user_id: null,
                name: "OnlyWorkshop Platform",
                api_key: "platform-key",
                booking_url: null,
                is_platform_default: true,
                created_at: "2026-03-27T00:00:00.000Z",
                updated_at: "2026-03-27T00:00:00.000Z",
            },
            explicitLookupFailed: false,
            source: "platform_default",
        });
        vi.mocked(searchChatbotFaqs).mockResolvedValue(faqRows);
        vi.mocked(isChatbotMatchBelowThreshold).mockReturnValue(false);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("validates the request payload", async () => {
        const request = new NextRequest("http://localhost/api/chat", {
            method: "POST",
            body: JSON.stringify({}),
        });

        const response = await POST(request);

        expect(response.status).toBe(400);
    });

    it("returns 404 for an invalid explicit client key", async () => {
        vi.mocked(resolveChatbotClient).mockResolvedValue({
            client: null,
            explicitLookupFailed: true,
            source: "api_key",
        });

        const request = new NextRequest("http://localhost/api/chat", {
            method: "POST",
            body: JSON.stringify({
                message: "What is the fee?",
                stage: "idle",
                clientApiKey: "bad-client-key",
            }),
        });

        const response = await POST(request);

        expect(response.status).toBe(404);
    });

    it("starts the lead flow for booking intent", async () => {
        const request = new NextRequest("http://localhost/api/chat", {
            method: "POST",
            body: JSON.stringify({
                message: "I want to book this workshop",
                stage: "idle",
            }),
        });

        const response = await POST(request);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toEqual({
            reply: "Booking start karne ke liye please apna name batao.",
            showBookingButton: false,
            askName: true,
            askPhone: false,
        });
    });

    it("returns a welcome reply for greetings", async () => {
        const request = new NextRequest("http://localhost/api/chat", {
            method: "POST",
            body: JSON.stringify({
                message: "hiii",
                stage: "idle",
            }),
        });

        const response = await POST(request);
        const body = await response.json();

        expect(body.reply).toBe(CHATBOT_GREETING_REPLY);
    });

    it("answers latest workshop detail prompts from live workshop data", async () => {
        const request = new NextRequest("http://localhost/api/chat", {
            method: "POST",
            body: JSON.stringify({
                message: "details of latest workshop",
                stage: "idle",
            }),
        });

        const response = await POST(request);
        const body = await response.json();

        expect(body.reply).toContain("Pottery Basics Studio Session");
        expect(body.reply).toContain("Kala Studio");
        expect(body.reply).toContain("[View workshop](/workshop/pottery-101)");
    });

    it("stores the lead after a valid phone number with the tenant client_id", async () => {
        const client = createInsertClient();
        vi.mocked(createSupabaseServiceClient).mockReturnValue(client as any);

        const request = new NextRequest("http://localhost/api/chat", {
            method: "POST",
            body: JSON.stringify({
                message: "9876543210",
                stage: "asking_phone",
                lead: {
                    name: "Chait",
                    query: "I want to book this workshop",
                },
            }),
        });

        const response = await POST(request);
        const body = await response.json();

        expect(body.showBookingButton).toBe(true);
        expect(client.from).toHaveBeenCalledWith("leads");
        expect(client.insert).toHaveBeenCalledWith({
            client_id: "client-1",
            name: "Chait",
            phone: "9876543210",
            query: "I want to book this workshop",
        });
    });

    it("logs unanswered questions with the tenant client_id when similarity is too low", async () => {
        const client = createInsertClient();
        vi.mocked(createSupabaseServiceClient).mockReturnValue(client as any);
        vi.mocked(searchChatbotFaqs).mockResolvedValue([
            {
                id: "faq-low",
                client_id: "client-1",
                question: "Pricing question",
                answer: "Pricing varies.",
                similarity: 0.3,
            },
        ]);
        vi.mocked(isChatbotMatchBelowThreshold).mockReturnValue(true);

        const request = new NextRequest("http://localhost/api/chat", {
            method: "POST",
            body: JSON.stringify({
                message: "Do you run mountain retreats in Himachal?",
                stage: "idle",
            }),
        });

        const response = await POST(request);
        const body = await response.json();

        expect(body.reply).toContain("contact support");
        expect(client.from).toHaveBeenCalledWith("unanswered_questions");
        expect(client.insert).toHaveBeenCalledWith({
            client_id: "client-1",
            question: "Do you run mountain retreats in Himachal?",
        });
    });

    it("falls back to FAQ answers when Groq fails", async () => {
        vi.mocked(getGroqConfig).mockReturnValue({
            apiKey: "test-key",
            endpoint: "https://example.com/groq",
            model: "llama3-8b-8192",
        });
        vi.mocked(searchChatbotFaqs).mockResolvedValue([faqRows[1]]);

        vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(new Error("network error")));

        const request = new NextRequest("http://localhost/api/chat", {
            method: "POST",
            body: JSON.stringify({
                message: "What should I bring?",
                stage: "idle",
            }),
        });

        const response = await POST(request);
        const body = await response.json();

        expect(body.reply).toContain("Core materials are provided");
    });
});
