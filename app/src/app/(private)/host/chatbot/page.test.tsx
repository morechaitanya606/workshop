import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HostChatbotPage from "./page";
import { useAuth } from "@/lib/auth-context";
import {
    createHostChatbotFaq,
    getHostChatbotClient,
    getHostChatbotFaqs,
    getHostChatbotLeads,
    getHostChatbotUnansweredQuestions,
} from "@/lib/api-client";

vi.mock("@/components/host/HostShell", () => ({
    default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/lib/auth-context", () => ({
    useAuth: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
    createHostChatbotFaq: vi.fn(),
    deleteHostChatbotFaq: vi.fn(),
    getHostChatbotClient: vi.fn(),
    getHostChatbotFaqs: vi.fn(),
    getHostChatbotLeads: vi.fn(),
    getHostChatbotUnansweredQuestions: vi.fn(),
    toApiErrorMessage: vi.fn((error: unknown, fallback: string) =>
        error instanceof Error ? error.message : fallback
    ),
    updateHostChatbotClient: vi.fn(),
    updateHostChatbotFaq: vi.fn(),
}));

describe("HostChatbotPage", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Object.defineProperty(window.navigator, "clipboard", {
            configurable: true,
            value: {
                writeText: vi.fn().mockResolvedValue(undefined),
            },
        });

        vi.mocked(useAuth).mockReturnValue({
            session: {
                access_token: "host-access-token",
            },
        } as any);

        vi.mocked(getHostChatbotClient).mockResolvedValue({
            client: {
                id: "client-1",
                name: "Studio One",
                apiKey: "api-key-1",
                bookingUrl: "https://book.example.com",
                embedScriptUrl: "https://app.example.com/chatbot.js",
                embedIframeUrl: "https://app.example.com/chatbot/embed?client=api-key-1",
                embedSnippet:
                    '<script src="https://app.example.com/chatbot.js" data-client="api-key-1"></script>',
            },
        });
        vi.mocked(getHostChatbotFaqs).mockResolvedValue({ faqs: [] });
        vi.mocked(getHostChatbotLeads).mockResolvedValue({ leads: [] });
        vi.mocked(getHostChatbotUnansweredQuestions).mockResolvedValue({
            unansweredQuestions: [],
        });
        vi.mocked(createHostChatbotFaq).mockResolvedValue({
            faq: {
                id: "faq-1",
                client_id: "client-1",
                question: "Fee kya hai?",
                answer: "Fee 999 hai.",
                created_at: "2026-03-27T00:00:00.000Z",
                updated_at: "2026-03-27T00:00:00.000Z",
            },
        });
    });

    it("lets a host create an FAQ from the chatbot dashboard", async () => {
        const user = userEvent.setup();

        render(<HostChatbotPage />);

        expect(await screen.findByRole("heading", { name: "AI Chatbot" })).toBeInTheDocument();

        const faqSection = screen.getByRole("heading", { name: "Add FAQ" }).closest("section");
        if (!faqSection) {
            throw new Error("FAQ form section was not rendered.");
        }

        const faqFields = within(faqSection).getAllByRole("textbox");
        const questionInput = faqFields[0];
        const answerInput = faqFields[1];

        await user.type(questionInput, "Fee kya hai?");
        await user.type(answerInput, "Fee 999 hai.");
        await user.click(screen.getByRole("button", { name: "Add FAQ" }));

        await waitFor(() => {
            expect(createHostChatbotFaq).toHaveBeenCalledWith("host-access-token", {
                question: "Fee kya hai?",
                answer: "Fee 999 hai.",
            });
        });

        expect(await screen.findByText("FAQ created.")).toBeInTheDocument();
        expect(screen.getByText("Fee kya hai?")).toBeInTheDocument();
        expect(screen.getByText("Fee 999 hai.")).toBeInTheDocument();
    });
});
