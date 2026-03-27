import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";
import { requireHostOrAdmin } from "@/lib/api-auth";
import { requireSupabaseService } from "@/lib/api-helpers";
import { getOrCreateHostChatbotClient } from "@/lib/chatbot-clients";
import { generateChatbotFaqEmbedding } from "@/lib/chatbot-vector-search";
import { getHuggingFaceEmbeddingConfig } from "@/lib/env";

vi.mock("@/lib/api-auth", () => ({
    requireHostOrAdmin: vi.fn(),
}));

vi.mock("@/lib/api-helpers", () => ({
    requireSupabaseService: vi.fn(),
}));

vi.mock("@/lib/chatbot-clients", () => ({
    getOrCreateHostChatbotClient: vi.fn(),
}));

vi.mock("@/lib/chatbot-vector-search", async () => {
    const actual = await vi.importActual<typeof import("@/lib/chatbot-vector-search")>(
        "@/lib/chatbot-vector-search"
    );

    return {
        ...actual,
        generateChatbotFaqEmbedding: vi.fn(),
    };
});

vi.mock("@/lib/env", async () => {
    const actual = await vi.importActual<typeof import("@/lib/env")>("@/lib/env");

    return {
        ...actual,
        getHuggingFaceEmbeddingConfig: vi.fn(),
    };
});

function createFaqListBuilder(result: unknown) {
    const builder = {
        eq: vi.fn(),
        order: vi.fn(),
    };

    builder.eq.mockImplementation(() => builder);
    builder.order.mockResolvedValue(result);

    return builder;
}

function createFaqInsertBuilder(result: unknown) {
    const builder = {
        select: vi.fn(),
        single: vi.fn(),
    };

    builder.select.mockImplementation(() => builder);
    builder.single.mockResolvedValue(result);

    return builder;
}

describe("host chatbot FAQ routes", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(requireHostOrAdmin).mockResolvedValue({
            ok: true,
            user: { id: "host-1" } as any,
            accessToken: "token",
            role: "host",
        });
        vi.mocked(getOrCreateHostChatbotClient).mockResolvedValue({
            id: "client-host-1",
            host_user_id: "host-1",
            name: "Host Studio",
            api_key: "client-key",
            booking_url: "https://book.example.com",
            is_platform_default: false,
            created_at: "2026-03-27T00:00:00.000Z",
            updated_at: "2026-03-27T00:00:00.000Z",
        });
    });

    it("loads FAQs scoped to the host tenant", async () => {
        const listBuilder = createFaqListBuilder({
            data: [
                {
                    id: "faq-1",
                    client_id: "client-host-1",
                    question: "Fee kya hai?",
                    answer: "Fee 999 hai.",
                    created_at: "2026-03-27T00:00:00.000Z",
                    updated_at: "2026-03-27T00:00:00.000Z",
                },
            ],
            error: null,
        });
        const serviceClient = {
            from: vi.fn(() => ({
                select: vi.fn(() => listBuilder),
            })),
        };

        vi.mocked(requireSupabaseService).mockReturnValue({
            ok: true,
            client: serviceClient as any,
        });

        const response = await GET(
            new NextRequest("http://localhost/api/host/chatbot/faqs", { method: "GET" })
        );
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.faqs).toHaveLength(1);
        expect(serviceClient.from).toHaveBeenCalledWith("faq");
        expect(listBuilder.eq).toHaveBeenCalledWith("client_id", "client-host-1");
    });

    it("generates an embedding and stores tenant-scoped FAQ entries", async () => {
        const insertBuilder = createFaqInsertBuilder({
            data: {
                id: "faq-1",
                client_id: "client-host-1",
                question: "Parking available hai?",
                answer: "Haan, basement parking available hai.",
                created_at: "2026-03-27T00:00:00.000Z",
                updated_at: "2026-03-27T00:00:00.000Z",
            },
            error: null,
        });
        const insert = vi.fn(() => insertBuilder);
        const serviceClient = {
            from: vi.fn(() => ({
                insert,
            })),
        };

        vi.mocked(requireSupabaseService).mockReturnValue({
            ok: true,
            client: serviceClient as any,
        });
        vi.mocked(getHuggingFaceEmbeddingConfig).mockReturnValue({
            apiKey: "hf-key",
            endpoint: "https://example.com/hf",
            model: "intfloat/multilingual-e5-base",
        });
        vi.mocked(generateChatbotFaqEmbedding).mockResolvedValue([0.1, 0.2, 0.3]);

        const response = await POST(
            new NextRequest("http://localhost/api/host/chatbot/faqs", {
                method: "POST",
                body: JSON.stringify({
                    question: "Parking available hai?",
                    answer: "Haan, basement parking available hai.",
                }),
            })
        );
        const body = await response.json();

        expect(response.status).toBe(201);
        expect(generateChatbotFaqEmbedding).toHaveBeenCalledWith(
            "Parking available hai?",
            "Haan, basement parking available hai.",
            {
                apiKey: "hf-key",
                endpoint: "https://example.com/hf",
                model: "intfloat/multilingual-e5-base",
            }
        );
        expect(insert).toHaveBeenCalledWith({
            client_id: "client-host-1",
            question: "Parking available hai?",
            answer: "Haan, basement parking available hai.",
            embedding: "[0.1,0.2,0.3]",
        });
        expect(body.faq.question).toBe("Parking available hai?");
    });
});
