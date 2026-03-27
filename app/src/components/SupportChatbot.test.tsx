import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SupportChatbot from "@/components/SupportChatbot";
import { askChatbot, getChatbotConfig } from "@/lib/api-client";

vi.mock("framer-motion", () => ({
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    motion: {
        button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
            <button {...props}>{children}</button>
        ),
        div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
            <div {...props}>{children}</div>
        ),
    },
    useReducedMotion: () => false,
}));

vi.mock("next/navigation", () => ({
    usePathname: vi.fn(() => "/chatbot/embed"),
    useParams: vi.fn(() => ({})),
}));

vi.mock("@/lib/api-client", () => ({
    askChatbot: vi.fn(),
    getChatbotConfig: vi.fn(),
}));

describe("SupportChatbot", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal("fetch", vi.fn());
        window.HTMLElement.prototype.scrollIntoView = vi.fn();

        vi.mocked(getChatbotConfig).mockResolvedValue({
            clientId: "client-1",
            clientName: "Marathi Makers",
            bookingUrl: "https://book.example.com/chatbot",
        });
        vi.mocked(askChatbot).mockResolvedValue({
            reply: "Fee 999 hai. Aap direct booking kar sakte ho.",
            showBookingButton: true,
            askName: false,
            askPhone: false,
        });
    });

    it("sends embedded tenant context and renders the tenant booking CTA", async () => {
        const user = userEvent.setup();

        render(<SupportChatbot mode="embedded" clientApiKey="tenant-api-key" />);

        expect(await screen.findByText(/Marathi Makers ka AI assistant/i)).toBeInTheDocument();

        await user.type(screen.getByPlaceholderText("Apna message type karo"), "Fee kya hai?");
        await user.click(screen.getByRole("button", { name: /send message/i }));

        await waitFor(() => {
            expect(askChatbot).toHaveBeenCalledWith({
                message: "Fee kya hai?",
                stage: "idle",
                lead: {
                    name: "",
                    phone: "",
                    query: "",
                },
                clientId: "client-1",
                clientApiKey: "tenant-api-key",
                contextWorkshopId: null,
            });
        });

        expect(
            await screen.findByText("Fee 999 hai. Aap direct booking kar sakte ho.")
        ).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /complete booking/i })).toHaveAttribute(
            "href",
            "https://book.example.com/chatbot"
        );
    });
});
