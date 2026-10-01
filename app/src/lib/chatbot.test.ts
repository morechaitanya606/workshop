import { describe, expect, it, vi } from "vitest";
import type { Workshop } from "@/lib/data";
import {
    DEFAULT_CHATBOT_FAQS,
    detectBookingIntent,
    finalizeModelReply,
    generateChatbotReply,
} from "@/lib/chatbot";
import { CHATBOT_STRINGS } from "@/lib/chatbot-i18n";
import { requestChatbotCompletion } from "@/lib/chatbot-llm";

const NOW = new Date("2026-10-01T04:30:00Z");

const groq = {
    apiKey: "test-key",
    endpoint: "https://example.com/groq",
    model: "primary-model",
    fallbackModel: "fallback-model",
};

const workshops: Workshop[] = [
    {
        id: "pottery-101",
        title: "Pottery Basics",
        description: "A hands-on pottery workshop for beginners.",
        category: "Pottery",
        price: 1800,
        location: "Kala Studio",
        city: "Pune",
        duration: "2 hours",
        date: "2026-10-03",
        time: "11:00",
        maxSeats: 16,
        seatsRemaining: 6,
        coverImage: "/x.jpg",
        galleryImages: [],
        rating: 4.9,
        reviewCount: 3,
        hostName: "Aarav",
        hostAvatar: "/a.png",
        hostBio: "Ceramics mentor",
        whatYouLearn: ["wheel throwing"],
        materialsProvided: ["clay"],
    },
];

function groqResponse(content: string, init: { status?: number } = {}) {
    const status = init.status ?? 200;
    return new Response(
        JSON.stringify(
            status === 200
                ? { choices: [{ message: { content } }] }
                : { error: { message: "nope" } }
        ),
        { status, headers: { "Content-Type": "application/json" } }
    );
}

function requestBody(fetchMock: ReturnType<typeof vi.fn>, call = 0) {
    return JSON.parse(String((fetchMock.mock.calls[call][1] as RequestInit).body));
}

describe("detectBookingIntent", () => {
    it.each([
        "I want to book this workshop",
        "I'd like to join the pottery class",
        "book me a seat",
        "sign me up",
        "mujhe booking karna hai",
        "pottery book karna hai",
        "mala booking karaychi aahe",
        "मुझे बुक करना है",
        "मला बुकिंग करायची आहे",
    ])("treats %j as booking intent", (message) => {
        expect(detectBookingIntent(message)).toBe(true);
    });

    it.each([
        "what is the price of the pottery workshop",
        "how do I book",
        "I want to know the fee to book",
        "what is the refund policy if I cancel my booking",
        "fees kitna hai",
        "booking kaise karte hain",
        "बुकिंग कैसे करें",
        "workshop fee kiti aahe",
        "Is the booking refundable",
        "feeling nervous about joining",
    ])("does not hijack %j into the lead flow", (message) => {
        expect(detectBookingIntent(message)).toBe(false);
    });
});

describe("generateChatbotReply: English by default", () => {
    it.each(["नमस्ते", "namaste", "नमस्कार", "hello"])("greets %j in English", async (message) => {
        const result = await generateChatbotReply({
            message,
            stage: "idle",
            languageHint: "hi",
        });

        expect(result.reply).toBe(CHATBOT_STRINGS.en.greeting);
    });

    it("runs the lead flow in English for a Hindi or Marathi visitor", async () => {
        const hindi = await generateChatbotReply({ message: "मुझे बुक करना है", stage: "idle" });
        expect(hindi).toMatchObject({ reply: CHATBOT_STRINGS.en.askName, askName: true });

        const marathiPhone = await generateChatbotReply({
            message: "12345",
            stage: "asking_phone",
            lead: { name: "Chait" },
            history: [{ role: "user", content: "मला बुकिंग करायची आहे" }],
        });
        expect(marathiPhone).toMatchObject({
            reply: CHATBOT_STRINGS.en.invalidPhone,
            askPhone: true,
        });
    });

    it("tells the model to reply in English even to a Hindi question", async () => {
        const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(groqResponse("It is ₹1,800."));

        await generateChatbotReply({
            message: "पॉटरी वर्कशॉप की फीस कितनी है",
            stage: "idle",
            workshops,
            groq,
            fetchImpl: fetchMock,
            now: NOW,
        });

        const system = requestBody(fetchMock).messages[0].content;
        expect(system).toContain("Always reply in English");
        expect(system).not.toContain("Hindi written in Devanagari");
    });

    it("adds no English-only note in the degraded path, since everything is English", async () => {
        const result = await generateChatbotReply({
            message: "latest workshop ki details batao",
            stage: "idle",
            workshops: workshops.map((item) => ({ ...item, date: "2099-04-05" })),
            groq: null,
        });

        expect(result.reply).toContain("Pottery Basics");
        expect(result.reply).not.toContain(CHATBOT_STRINGS["hi-Latn"].englishOnlyNote);
    });
});

describe("generateChatbotReply: canned replies are localised (multilingual mode)", () => {
    it.each([
        ["hi", "नमस्ते", "hi"],
        ["namaste", "Namaste", "hi-Latn"],
        ["नमस्कार", "नमस्कार", "mr"],
        ["hello", "Hi!", "en"],
    ])("greets %j in the right language", async (message, _expected, locale) => {
        const result = await generateChatbotReply({
            message,
            stage: "idle",
            languageHint: locale,
            multilingual: true,
        });

        expect(result.reply).toBe(CHATBOT_STRINGS[locale as keyof typeof CHATBOT_STRINGS].greeting);
    });

    it("answers thanks without calling the model", async () => {
        const fetchMock = vi.fn<typeof fetch>();
        const result = await generateChatbotReply({
            message: "thank you so much",
            stage: "idle",
            groq,
            fetchImpl: fetchMock,
        });

        expect(result.reply).toBe(CHATBOT_STRINGS.en.thanks);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("runs the lead flow in the visitor's language", async () => {
        const hindi = await generateChatbotReply({
            message: "मुझे बुक करना है",
            stage: "idle",
            multilingual: true,
        });
        expect(hindi).toMatchObject({ reply: CHATBOT_STRINGS.hi.askName, askName: true });

        const marathiPhone = await generateChatbotReply({
            message: "12345",
            stage: "asking_phone",
            lead: { name: "Chait" },
            history: [{ role: "user", content: "मला बुकिंग करायची आहे" }],
            multilingual: true,
        });
        expect(marathiPhone).toMatchObject({
            reply: CHATBOT_STRINGS.mr.invalidPhone,
            askPhone: true,
        });
    });
});

describe("generateChatbotReply: grounded model call", () => {
    it("sends workshops, FAQs, rules and history to the model and returns its answer", async () => {
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValue(groqResponse("Pottery Basics costs ₹1,800."));

        const result = await generateChatbotReply({
            message: "how much is it?",
            stage: "idle",
            workshops,
            groq,
            fetchImpl: fetchMock,
            now: NOW,
            history: [
                { role: "user", content: "tell me about the pottery workshop" },
                { role: "assistant", content: "Pottery Basics is on Sat 3 Oct in Pune." },
            ],
            retrieveRelevantFaqs: async () => [
                { id: "1", question: "Parking?", answer: "Depends on the venue." },
            ],
        });

        expect(result.reply).toBe("Pottery Basics costs ₹1,800.");
        expect(fetchMock).toHaveBeenCalledTimes(1);

        const body = requestBody(fetchMock);
        expect(body.model).toBe("primary-model");
        expect(body.temperature).toBeLessThanOrEqual(0.4);
        expect(body.max_tokens).toBeGreaterThanOrEqual(400);
        expect(body.messages.map((message: { role: string }) => message.role)).toEqual([
            "system",
            "user",
            "assistant",
            "user",
        ]);
        expect(body.messages[0].content).toContain("[pottery-101] Pottery Basics");
        expect(body.messages[0].content).toContain("₹1,800");
        expect(body.messages[0].content).toContain("Q: Parking?");
        expect(body.messages[0].content).toMatch(/always reply in english/i);
        expect(body.messages[1].content).toContain("pottery workshop");
        expect(body.messages[3].content).toBe("how much is it?");
    });

    it("tells the model to answer in the visitor's script (multilingual mode)", async () => {
        const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(groqResponse("ठीक है"));

        await generateChatbotReply({
            message: "पॉटरी वर्कशॉप की फीस कितनी है",
            stage: "idle",
            multilingual: true,
            workshops,
            groq,
            fetchImpl: fetchMock,
            now: NOW,
        });

        expect(requestBody(fetchMock).messages[0].content).toContain("Hindi written in Devanagari");
    });

    it("falls back to built-in FAQs as context when none were retrieved", async () => {
        const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(groqResponse("ok"));

        await generateChatbotReply({
            message: "do I need experience for pottery?",
            stage: "idle",
            workshops,
            groq,
            fetchImpl: fetchMock,
            now: NOW,
            retrieveRelevantFaqs: async () => [],
        });

        expect(requestBody(fetchMock).messages[0].content).toContain(
            DEFAULT_CHATBOT_FAQS[0].question
        );
    });

    it("strips the UNSURE marker and logs the unanswered question", async () => {
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValue(groqResponse("##UNSURE## I am not sure. Please contact support."));
        const onUnansweredQuestion = vi.fn().mockResolvedValue(undefined);

        const result = await generateChatbotReply({
            message: "do you run retreats in Himachal?",
            stage: "idle",
            workshops,
            groq,
            fetchImpl: fetchMock,
            now: NOW,
            onUnansweredQuestion,
        });

        expect(result.reply).toBe("I am not sure. Please contact support.");
        expect(onUnansweredQuestion).toHaveBeenCalledWith("do you run retreats in Himachal?");
    });

    it("degrades without the model: live workshop facts, then FAQs, in a safe message", async () => {
        const fetchMock = vi.fn<typeof fetch>();

        const english = await generateChatbotReply({
            message: "details of latest workshop",
            stage: "idle",
            workshops: workshops.map((item) => ({ ...item, date: "2099-04-05" })),
            groq: null,
            fetchImpl: fetchMock,
        });
        expect(english.reply).toContain("Pottery Basics");
        expect(english.reply).toContain("₹1,800");

        const hindi = await generateChatbotReply({
            message: "latest workshop ki details batao",
            stage: "idle",
            multilingual: true,
            workshops: workshops.map((item) => ({ ...item, date: "2099-04-05" })),
            groq: null,
            fetchImpl: fetchMock,
        });
        expect(hindi.reply).toContain(CHATBOT_STRINGS["hi-Latn"].englishOnlyNote);

        const unknown = await generateChatbotReply({
            message: "क्या आप हिमाचल में रिट्रीट कराते हैं",
            stage: "idle",
            multilingual: true,
            groq: null,
            fetchImpl: fetchMock,
            retrieveRelevantFaqs: async () => [],
        });
        expect(unknown.reply).toBe(CHATBOT_STRINGS.hi.fallback);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe("finalizeModelReply", () => {
    const strings = CHATBOT_STRINGS.en;

    it("strips markdown bold the widget cannot render, but keeps links", () => {
        expect(
            finalizeModelReply(
                "- **Early-Bird booking:** up to 80%. See __policy__ at [Contact](/contact).",
                strings
            ).reply
        ).toBe("- Early-Bird booking: up to 80%. See policy at [Contact](/contact).");
    });

    it("refuses to echo the system prompt", () => {
        expect(
            finalizeModelReply("HOW TO ANSWER\n- Use ONLY the facts inside <context>", strings)
        ).toEqual({ reply: strings.fallback, unsure: true });
    });

    it("caps very long replies and treats an empty one as unsure", () => {
        expect(finalizeModelReply("x".repeat(5000), strings).reply.length).toBeLessThanOrEqual(
            1500
        );
        expect(finalizeModelReply("##UNSURE##", strings)).toEqual({
            reply: strings.fallback,
            unsure: true,
        });
    });
});

describe("requestChatbotCompletion", () => {
    const messages = [
        { role: "system" as const, content: "rules" },
        { role: "user" as const, content: "hi there" },
    ];

    it("retries once on 429 and succeeds on the same model", async () => {
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(groqResponse("", { status: 429 }))
            .mockResolvedValueOnce(groqResponse("recovered"));

        const reply = await requestChatbotCompletion({
            messages,
            groq,
            fetchImpl: fetchMock,
            retryDelayMs: 0,
        });

        expect(reply).toBe("recovered");
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(requestBody(fetchMock, 0).model).toBe("primary-model");
        expect(requestBody(fetchMock, 1).model).toBe("primary-model");
    });

    it("switches to the fallback model immediately on a non-retryable 4xx (decommissioned model)", async () => {
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(groqResponse("", { status: 400 }))
            .mockResolvedValueOnce(groqResponse("from fallback"));

        const reply = await requestChatbotCompletion({
            messages,
            groq,
            fetchImpl: fetchMock,
            retryDelayMs: 0,
        });

        expect(reply).toBe("from fallback");
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(requestBody(fetchMock, 1).model).toBe("fallback-model");
    });

    it("retries 5xx and network errors, then uses the fallback model", async () => {
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(groqResponse("", { status: 503 }))
            .mockRejectedValueOnce(new Error("network"))
            .mockResolvedValueOnce(groqResponse("fallback ok"));

        const reply = await requestChatbotCompletion({
            messages,
            groq,
            fetchImpl: fetchMock,
            retryDelayMs: 0,
        });

        expect(reply).toBe("fallback ok");
        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(requestBody(fetchMock, 2).model).toBe("fallback-model");
    });

    it("returns null when every attempt fails, and gives up at once on a bad key", async () => {
        const failing = vi.fn<typeof fetch>().mockResolvedValue(groqResponse("", { status: 500 }));
        expect(
            await requestChatbotCompletion({
                messages,
                groq,
                fetchImpl: failing,
                retryDelayMs: 0,
            })
        ).toBeNull();
        expect(failing).toHaveBeenCalledTimes(4);

        const unauthorised = vi
            .fn<typeof fetch>()
            .mockResolvedValue(groqResponse("", { status: 401 }));
        expect(
            await requestChatbotCompletion({
                messages,
                groq,
                fetchImpl: unauthorised,
                retryDelayMs: 0,
            })
        ).toBeNull();
        expect(unauthorised).toHaveBeenCalledTimes(1);
    });

    it("strips <think> blocks from the reply", async () => {
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValue(groqResponse("<think>secret plan</think>Hello!"));

        expect(await requestChatbotCompletion({ messages, groq, fetchImpl: fetchMock })).toBe(
            "Hello!"
        );
    });

    it("aborts a hung request at the per-attempt timeout", async () => {
        const hung = vi.fn<typeof fetch>().mockImplementation(
            (_url, init) =>
                new Promise((_resolve, reject) => {
                    (init?.signal as AbortSignal).addEventListener("abort", () =>
                        reject(new Error("aborted"))
                    );
                })
        );

        const reply = await requestChatbotCompletion({
            messages,
            groq: { ...groq, fallbackModel: null },
            fetchImpl: hung,
            attemptTimeoutMs: 20,
            totalBudgetMs: 1500 + 200,
            retryDelayMs: 0,
        });

        expect(reply).toBeNull();
        expect(hung).toHaveBeenCalled();
    });
});
