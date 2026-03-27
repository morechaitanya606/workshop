import { describe, expect, it, vi } from "vitest";
import { resolveChatbotBookingUrl, resolveChatbotClient } from "@/lib/chatbot-clients";
import { getWorkshopOwnerLookup } from "@/lib/workshop-attendees";

vi.mock("@/lib/workshop-attendees", () => ({
    getWorkshopOwnerLookup: vi.fn(),
}));

function createServiceClient(clients: Array<Record<string, unknown>>) {
    return {
        from: vi.fn((table: string) => {
            const filters = new Map<string, unknown>();
            const query = {
                select: vi.fn(() => query),
                eq: vi.fn((column: string, value: unknown) => {
                    filters.set(column, value);
                    return query;
                }),
                maybeSingle: vi.fn(async () => {
                    if (table !== "clients") {
                        return { data: null, error: null };
                    }

                    const record =
                        clients.find((client) =>
                            Array.from(filters.entries()).every(
                                ([column, value]) => client[column] === value
                            )
                        ) ?? null;

                    return { data: record, error: null };
                }),
            };

            return query;
        }),
    } as any;
}

describe("chatbot client helpers", () => {
    it("resolves an explicit client api key first", async () => {
        const serviceClient = createServiceClient([
            {
                id: "client-1",
                host_user_id: "host-1",
                name: "Host One",
                api_key: "client-key",
                booking_url: "https://example.com/book",
                is_platform_default: false,
                created_at: "2026-03-27T00:00:00.000Z",
                updated_at: "2026-03-27T00:00:00.000Z",
            },
        ]);

        const result = await resolveChatbotClient(serviceClient, {
            clientApiKey: "client-key",
            contextWorkshopId: "ignored-workshop",
        });

        expect(result.source).toBe("api_key");
        expect(result.client?.id).toBe("client-1");
        expect(result.explicitLookupFailed).toBe(false);
    });

    it("resolves a workshop tenant through the workshop owner and falls back to booking url helpers", async () => {
        vi.mocked(getWorkshopOwnerLookup).mockResolvedValue({
            exists: true,
            ownerUserId: "host-2",
            isMock: false,
        });

        const serviceClient = createServiceClient([
            {
                id: "platform-client",
                host_user_id: null,
                name: "OnlyWorkshop Platform",
                api_key: "platform-key",
                booking_url: null,
                is_platform_default: true,
                created_at: "2026-03-27T00:00:00.000Z",
                updated_at: "2026-03-27T00:00:00.000Z",
            },
            {
                id: "client-2",
                host_user_id: "host-2",
                name: "Host Two",
                api_key: "host-two-key",
                booking_url: "https://host-two.example.com/book",
                is_platform_default: false,
                created_at: "2026-03-27T00:00:00.000Z",
                updated_at: "2026-03-27T00:00:00.000Z",
            },
        ]);

        const result = await resolveChatbotClient(serviceClient, {
            contextWorkshopId: "pottery-101",
        });

        expect(result.source).toBe("workshop");
        expect(result.client?.id).toBe("client-2");
        expect(resolveChatbotBookingUrl(result.client, "pottery-101")).toBe(
            "https://host-two.example.com/book"
        );
    });
});
