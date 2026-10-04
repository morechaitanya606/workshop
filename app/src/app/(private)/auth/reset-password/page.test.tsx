import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getSession: vi.fn(),
    updateUser: vi.fn(),
    onAuthStateChange: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
    isSupabaseConfigured: true,
    supabase: {
        auth: {
            getSession: mocks.getSession,
            updateUser: mocks.updateUser,
            onAuthStateChange: mocks.onAuthStateChange,
        },
    },
}));

import ResetPasswordPage from "./page";

describe("ResetPasswordPage", () => {
    beforeEach(() => {
        mocks.onAuthStateChange.mockReturnValue({
            data: { subscription: { unsubscribe: vi.fn() } },
        });
        mocks.updateUser.mockResolvedValue({ data: {}, error: null });
    });

    afterEach(() => {
        cleanup();
    });

    it("offers a new link instead of a form that cannot work when there is no reset session", async () => {
        mocks.getSession.mockResolvedValue({ data: { session: null } });
        render(<ResetPasswordPage />);

        expect(await screen.findByText(/has expired, was already used/i)).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Request a new link" })).toHaveAttribute(
            "href",
            "/auth/forgot-password"
        );
        expect(screen.queryByRole("button", { name: "Update password" })).not.toBeInTheDocument();
    });

    it("holds a weak password to the signup rule, then updates a strong one", async () => {
        const user = userEvent.setup();
        mocks.getSession.mockResolvedValue({ data: { session: { access_token: "t" } } });
        render(<ResetPasswordPage />);

        const password = await screen.findByLabelText("New password");
        const confirm = screen.getByLabelText("Confirm new password");

        await user.type(password, "short");
        await user.type(confirm, "short");
        await user.click(screen.getByRole("button", { name: "Update password" }));
        expect(screen.getByRole("alert")).toHaveTextContent(/at least 8 characters/i);
        expect(mocks.updateUser).not.toHaveBeenCalled();

        await user.clear(password);
        await user.clear(confirm);
        await user.type(password, "Pottery2026");
        await user.type(confirm, "Pottery2026");
        await user.click(screen.getByRole("button", { name: "Update password" }));

        expect(mocks.updateUser).toHaveBeenCalledWith({ password: "Pottery2026" });
        expect(await screen.findByText(/password updated/i)).toBeInTheDocument();
    });

    it("explains an expired session instead of Supabase's raw message", async () => {
        const user = userEvent.setup();
        mocks.getSession.mockResolvedValue({ data: { session: { access_token: "t" } } });
        mocks.updateUser.mockResolvedValue({
            data: {},
            error: { message: "Auth session missing!" },
        });
        render(<ResetPasswordPage />);

        await user.type(await screen.findByLabelText("New password"), "Pottery2026");
        await user.type(screen.getByLabelText("Confirm new password"), "Pottery2026");
        await user.click(screen.getByRole("button", { name: "Update password" }));

        expect(await screen.findByRole("alert")).toHaveTextContent(/request a new one/i);
    });
});
