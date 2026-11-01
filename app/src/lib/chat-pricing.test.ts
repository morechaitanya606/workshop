// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { Workshop } from "@/lib/data";
import { generateChatbotReply } from "@/lib/chatbot";
import { buildWorkshopContext, workshopPriceText } from "@/lib/chatbot-prompt";
import { loadSupportChatWorkshops, resolveSupportChatReply } from "@/lib/support-chat";

const mocks = vi.hoisted(() => ({
    loadPublicOffersResult: vi.fn(),
    loadClosedWorkshopIds: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
// The chat's pricing snapshot is loaded through these two reads; no database in a unit test.
vi.mock("@/lib/offers-server", () => ({ loadPublicOffersResult: mocks.loadPublicOffersResult }));
vi.mock("@/lib/workshop-availability-server", () => ({
    loadClosedWorkshopIds: mocks.loadClosedWorkshopIds,
}));
vi.mock("@/lib/supabase-server", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/supabase-server")>()),
    isSupabaseServiceConfigured: false,
}));

// 24 Oct 2026, 12:00 IST.
const NOW = new Date("2026-10-24T06:30:00.000Z");

const workshop: Workshop = {
    id: "pottery-basics-1761000000000",
    title: "Pottery Basics",
    description: "Learn to throw a bowl.",
    category: "Pottery",
    price: 2000,
    location: "Clay Studio",
    city: "Pune",
    duration: "3 hours",
    date: "2026-11-20",
    time: "10:00",
    maxSeats: 10,
    seatsRemaining: 8,
    coverImage: "/images/pottery.jpg",
    galleryImages: [],
    rating: 0,
    reviewCount: 0,
    hostName: "Asha",
    hostAvatar: "",
    hostBio: "",
    whatYouLearn: ["centering"],
    materialsProvided: ["Clay"],
};

const earlyBird: Workshop = {
    ...workshop,
    earlyBirdEnabled: true,
    earlyBirdDiscountType: "percentage",
    earlyBirdDiscountValue: 10,
    earlyBirdDaysAfterListing: 7,
    createdAt: "2026-10-20T00:00:00.000Z",
};

describe("workshopPriceText", () => {
    it("is the list price per person without an offer", () => {
        expect(workshopPriceText(workshop, { now: NOW })).toBe("₹2,000 per person");
    });

    it("states an offer price with its end and the regular price, so it stays true later", () => {
        const text = workshopPriceText(earlyBird, { now: NOW });
        expect(text).toMatch(/^₹1,800 per person until .*2026, 5:30 am \(.+; regular ₹2,000\)$/);
    });

    it("gives a closed workshop no offer", () => {
        expect(
            workshopPriceText(earlyBird, {
                now: NOW,
                pricing: { closedWorkshopIds: [earlyBird.id] },
            })
        ).toBe("₹2,000 per person");
    });
});

describe("chat context", () => {
    it("marks closed workshops as BOOKINGS CLOSED, not sold out", () => {
        const context = buildWorkshopContext({
            workshops: [workshop],
            now: NOW,
            pricing: { closedWorkshopIds: new Set([workshop.id]) },
        });
        expect(context).toContain("BOOKINGS CLOSED");
        expect(context).not.toContain("SOLD OUT");
    });
});

describe("support chat replies", () => {
    it("quotes the seat price per person, not per booking", () => {
        const result = resolveSupportChatReply("price of pottery basics", [workshop], {
            today: NOW,
            pricing: null,
        });
        expect(result.reply).toContain("Rs. 2,000 per person");
        expect(result.reply).not.toContain("per booking");
    });

    it("says bookings are closed for a closed workshop", () => {
        const pricing = { closedWorkshopIds: [workshop.id] };
        const availability = resolveSupportChatReply(
            "are seats available for pottery basics",
            [workshop],
            {
                today: NOW,
                pricing,
            }
        );
        expect(availability.reply).toContain("closed for bookings");

        const booking = resolveSupportChatReply("how do I book pottery basics", [workshop], {
            today: NOW,
            pricing,
        });
        expect(booking.reply).toContain("Bookings for Pottery Basics are closed");
    });
});

const groq = {
    apiKey: "test-key",
    endpoint: "https://example.com/groq",
    model: "primary-model",
    fallbackModel: "fallback-model",
};

function modelReply(content: string) {
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
}

/** The system prompt (rules + workshop context) the model was sent. */
function sentContext(fetchMock: ReturnType<typeof vi.fn>) {
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    return JSON.parse(String(init.body)).messages[0].content as string;
}

function askModel(extra: Partial<Parameters<typeof generateChatbotReply>[0]> = {}) {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(modelReply("ok"));
    return generateChatbotReply({
        message: "how much is pottery basics?",
        stage: "idle",
        workshops: [earlyBird],
        groq,
        fetchImpl: fetchMock,
        now: NOW,
        ...extra,
    }).then(() => sentContext(fetchMock));
}

describe("chat with a model knows the closed bookings and live prices", () => {
    it("tells the model a closed workshop is BOOKINGS CLOSED with its list price", async () => {
        const context = await askModel({ pricing: { closedWorkshopIds: [earlyBird.id] } });
        expect(context).toContain("BOOKINGS CLOSED (cannot be booked)");
        expect(context).not.toContain("SOLD OUT");
        expect(context).toContain("₹2,000 per person");
        expect(context).not.toContain("regular ₹2,000");
    });

    it("quotes the live Early Bird price, with its end and the regular price, when open", async () => {
        const context = await askModel({ pricing: { closedWorkshopIds: [] } });
        expect(context).toContain("₹1,800 per person until");
        expect(context).toContain("regular ₹2,000");
        expect(context).toContain("8 of 10 seats left");
        expect(context).not.toContain("BOOKINGS CLOSED (cannot");
    });

    it("tells the model never to recommend a closed or sold-out workshop", async () => {
        const context = await askModel({ pricing: { closedWorkshopIds: [] } });
        expect(context).toContain("skip any marked BOOKINGS CLOSED or sold out");
        expect(context).toContain("A workshop marked BOOKINGS CLOSED cannot be booked");
    });

    it("defaults to the snapshot loaded with the workshops, like the rule-based replies", async () => {
        mocks.loadPublicOffersResult.mockResolvedValue({ offers: [], ok: true });
        mocks.loadClosedWorkshopIds.mockResolvedValue(new Set([earlyBird.id]));
        await loadSupportChatWorkshops(NOW.getTime());

        expect(await askModel()).toContain("BOOKINGS CLOSED (cannot be booked)");
        // An explicit null opts out: Early Bird prices only, nothing closed.
        const withoutSnapshot = await askModel({ pricing: null });
        expect(withoutSnapshot).toContain("8 of 10 seats left");
        expect(withoutSnapshot).not.toContain("BOOKINGS CLOSED (cannot");
    });
});

describe("chat booking requests for a closed workshop", () => {
    const sourdough: Workshop = {
        ...workshop,
        id: "sourdough-baking-1761000000001",
        title: "Sourdough Baking",
        category: "Baking",
        description: "Bake a loaf.",
    };
    const pricing = { closedWorkshopIds: [workshop.id] };

    it("answers that bookings are closed instead of starting the name and phone steps", async () => {
        const closed = await generateChatbotReply({
            message: "I want to book this workshop",
            stage: "idle",
            workshops: [workshop, sourdough],
            contextWorkshopId: workshop.id,
            pricing,
            groq: null,
        });
        expect(closed.askName).toBe(false);
        expect(closed.reply).toContain("Bookings for Pottery Basics are closed");

        const named = await generateChatbotReply({
            message: "I want to book pottery basics",
            stage: "idle",
            workshops: [workshop, sourdough],
            pricing,
            groq: null,
        });
        expect(named.askName).toBe(false);
        expect(named.reply).toContain("Bookings for Pottery Basics are closed");
    });

    it("still starts the booking steps for an open workshop, even from a closed one's page", async () => {
        const fromOpenPage = await generateChatbotReply({
            message: "I want to book this workshop",
            stage: "idle",
            workshops: [workshop, sourdough],
            contextWorkshopId: sourdough.id,
            pricing,
            groq: null,
        });
        expect(fromOpenPage.askName).toBe(true);

        const namedOpen = await generateChatbotReply({
            message: "I want to book Sourdough Baking",
            stage: "idle",
            workshops: [workshop, sourdough],
            contextWorkshopId: workshop.id,
            pricing,
            groq: null,
        });
        expect(namedOpen.askName).toBe(true);
    });

    it("starts the booking steps when nothing is closed or no pricing is known", async () => {
        for (const noClosed of [{ closedWorkshopIds: [] }, null]) {
            const result = await generateChatbotReply({
                message: "I want to book this workshop",
                stage: "idle",
                workshops: [workshop],
                contextWorkshopId: workshop.id,
                pricing: noClosed,
                groq: null,
            });
            expect(result.askName).toBe(true);
        }
    });
});

describe("chat's latest-workshop reply", () => {
    // Far in the future so it is "upcoming" whenever the suite runs; Early Bird is still live at NOW.
    const next: Workshop = { ...earlyBird, date: "2099-04-05" };
    const ask = (workshops: Workshop[], closedWorkshopIds: string[]) =>
        generateChatbotReply({
            message: "details of latest workshop",
            stage: "idle",
            workshops,
            pricing: { closedWorkshopIds },
            groq: null,
            now: NOW,
        });

    it("quotes the live price per person and the seats while it is open", async () => {
        const { reply } = await ask([next], []);
        expect(reply).toContain("It costs ₹1,800 per person until");
        expect(reply).toContain("regular ₹2,000");
        expect(reply).toContain("It currently has 8 seats left.");
    });

    it("says bookings are closed, with the list price and no seats, when closed", async () => {
        const { reply } = await ask([next], [next.id]);
        expect(reply).toContain("It costs ₹2,000 per person.");
        expect(reply).toContain("Bookings for it are closed.");
        expect(reply).not.toContain("seats left");
        expect(reply).not.toContain("sold out");
    });

    it("says sold out, not '0 seats left', when no seat remains", async () => {
        const { reply } = await ask([{ ...next, seatsRemaining: 0 }], []);
        expect(reply).toContain("It is sold out.");
        expect(reply).not.toContain("0 seats left");
    });
});
