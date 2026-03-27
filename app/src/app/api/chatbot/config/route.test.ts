import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { requireSupabaseService } from "@/lib/api-helpers";
import { resolveChatbotClient } from "@/lib/chatbot-clients";

vi.mock("@/lib/api-helpers", () => ({
    requireSupabaseService: vi.fn(),
}));

vi.mock("@/lib/chatbot-clients", async () => {
    const actual =
        await vi.importActual<typeof import("@/lib/chatbot-clients")>("@/lib/chatbot-clients");

    return {
        ...actual,
        resolveChatbotClient: vi.fn(),
    };
});

describe("GET /api/chatbot/config", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns a safe default config when tenant resolution fails", async () => {
        vi.mocked(requireSupabaseService).mockReturnValue({
            ok: true,
            client: {} as any,
        });
        vi.mocked(resolveChatbotClient).mockRejectedValue(new Error("clients table missing"));

        const response = await GET(
            new NextRequest("http://localhost/api/chatbot/config?contextWorkshopId=pottery-101", {
                method: "GET",
            })
        );
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.clientId).toBeNull();
        expect(body.clientName).toBe("OnlyWorkshop Platform");
        expect(body.bookingUrl).toContain("/workshop/pottery-101");
    });
});
