import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { submitHostApplication, toApiErrorMessage } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import BecomeAHostForm from "./BecomeAHostForm";

const mocks = vi.hoisted(() => ({
    push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/lib/auth-context", () => ({
    useAuth: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
    submitHostApplication: vi.fn(),
    toApiErrorMessage: vi.fn(),
}));

type AuthState = ReturnType<typeof useAuth>;

function mockAuth(state: Partial<Record<keyof AuthState, unknown>>) {
    vi.mocked(useAuth).mockReturnValue({
        user: null,
        session: null,
        loading: false,
        role: null,
        roleLoading: false,
        ...state,
    } as unknown as AuthState);
}

const signedInUser = {
    id: "user-1",
    email: "asha@example.com",
    user_metadata: { full_name: "Asha Patil" },
};

function submitForm() {
    const form = screen.getByRole("button", { name: /submit application/i }).closest("form");
    if (!form) throw new Error("form not rendered");
    fireEvent.submit(form);
}

describe("BecomeAHostForm", () => {
    beforeEach(() => {
        vi.mocked(toApiErrorMessage).mockImplementation((error: unknown, fallback: string) =>
            error instanceof Error ? error.message : fallback
        );
    });

    afterEach(() => {
        cleanup();
    });

    it("shows a spinner instead of the form while auth loads", () => {
        mockAuth({ loading: true, roleLoading: true });
        render(<BecomeAHostForm />);

        expect(screen.getByRole("status")).toHaveTextContent("Loading the application form");
        expect(screen.queryByRole("button", { name: /submit application/i })).toBeNull();
    });

    it("sends a signed-out visitor to login and back", () => {
        mockAuth({});
        render(<BecomeAHostForm />);

        expect(screen.getByText("Sign in to submit your host application.")).toBeInTheDocument();
        submitForm();

        expect(mocks.push).toHaveBeenCalledWith("/auth/login?redirect=%2Fbecome-a-host");
        expect(submitHostApplication).not.toHaveBeenCalled();
    });

    it("prefills the account and submits the same payload as before", async () => {
        mockAuth({ user: signedInUser, session: { access_token: "token-1" } });
        vi.mocked(submitHostApplication).mockResolvedValue({
            message: "Application submitted for admin review.",
        } as Awaited<ReturnType<typeof submitHostApplication>>);
        render(<BecomeAHostForm />);

        expect(screen.getByLabelText("Full Name")).toHaveValue("Asha Patil");
        expect(screen.getByLabelText("Email Address")).toHaveValue("asha@example.com");

        fireEvent.change(screen.getByLabelText("Mobile Number"), {
            target: { value: " +91 90000 00000 " },
        });
        fireEvent.change(screen.getByLabelText("Field of Expertise"), {
            target: { value: "Pottery" },
        });
        fireEvent.change(screen.getByLabelText("Where are you based?"), {
            target: { value: "Baner, Pune" },
        });
        fireEvent.change(screen.getByLabelText("Experience & Bio"), {
            target: { value: "I have taught wheel pottery to beginners for years." },
        });
        fireEvent.change(screen.getByLabelText("Instagram (Optional)"), {
            target: { value: "https://instagram.com/asha" },
        });
        submitForm();

        expect(
            await screen.findByText("Application submitted for admin review.")
        ).toBeInTheDocument();
        expect(submitHostApplication).toHaveBeenCalledWith("token-1", {
            name: "Asha Patil",
            email: "asha@example.com",
            bio: "I have taught wheel pottery to beginners for years.",
            portfolioUrl: "",
            applicationType: "creator",
            details: {
                expertise: "Pottery",
                location: "Baner, Pune",
                phone: "+91 90000 00000",
                socialLinks: {
                    instagram: "https://instagram.com/asha",
                    youtube: "",
                    website: "",
                },
            },
        });
        expect(screen.getByRole("link", { name: "Go to Profile" })).toHaveAttribute(
            "href",
            "/profile"
        );
    });

    it("shows the API error and keeps the form", async () => {
        mockAuth({ user: signedInUser, session: { access_token: "token-1" } });
        vi.mocked(submitHostApplication).mockRejectedValue(new Error("Too many attempts."));
        render(<BecomeAHostForm />);

        submitForm();

        expect(await screen.findByText("Too many attempts.")).toBeInTheDocument();
        await waitFor(() =>
            expect(screen.getByRole("button", { name: /submit application/i })).toBeEnabled()
        );
    });

    it("tells an approved host and disables a second submission", () => {
        mockAuth({ user: signedInUser, session: { access_token: "token-1" }, role: "host" });
        render(<BecomeAHostForm />);

        expect(screen.getByText(/already approved as a host/i)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /submit application/i })).toBeDisabled();
    });
});
