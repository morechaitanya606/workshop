import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import WhatsAppCommunityModal, { getCommunityModalCopy } from "./WhatsAppCommunityModal";

vi.mock("@/lib/analytics", () => ({
    trackEvent: vi.fn(),
}));

const COMMUNITY_URL = "https://chat.whatsapp.com/AbCdEf123456";

function Harness({
    communityUrl,
    message,
    onClose,
}: {
    communityUrl?: string | null;
    message?: string | null;
    onClose?: () => void;
}) {
    const [open, setOpen] = useState(false);
    return (
        <div>
            <button type="button" onClick={() => setOpen(true)}>
                Open popup
            </button>
            <WhatsAppCommunityModal
                open={open}
                onClose={() => {
                    onClose?.();
                    setOpen(false);
                }}
                communityUrl={communityUrl}
                message={message}
                source="test"
                workshopId="w-1"
            />
        </div>
    );
}

async function openPopup(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "Open popup" }));
    return screen.getByRole("dialog");
}

describe("WhatsAppCommunityModal", () => {
    beforeEach(() => {
        document.body.style.overflow = "";
    });

    afterEach(() => {
        cleanup();
        document.body.style.overflow = "";
    });

    it("renders nothing while closed", () => {
        render(
            <WhatsAppCommunityModal open={false} onClose={() => {}} communityUrl={COMMUNITY_URL} />
        );
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("is an accessible, labelled modal dialog", async () => {
        const user = userEvent.setup();
        render(<Harness communityUrl={COMMUNITY_URL} />);

        const dialog = await openPopup(user);

        expect(dialog).toHaveAttribute("aria-modal", "true");
        expect(dialog).toHaveAccessibleName("This workshop is full");
        expect(dialog).toHaveAccessibleDescription(/WhatsApp community/);
    });

    it("renders the join button as a safe new-tab link", async () => {
        const user = userEvent.setup();
        render(<Harness communityUrl={COMMUNITY_URL} />);
        await openPopup(user);

        const join = screen.getByRole("link", { name: /join whatsapp community/i });
        expect(join).toHaveAttribute("href", COMMUNITY_URL);
        expect(join).toHaveAttribute("target", "_blank");
        expect(join.getAttribute("rel")).toContain("noopener");
        expect(join.getAttribute("rel")).toContain("noreferrer");
        expect(screen.queryByRole("link", { name: /contact support/i })).not.toBeInTheDocument();
    });

    it("copies the link to the clipboard and announces it", async () => {
        const user = userEvent.setup();
        // userEvent.setup() installs its own clipboard stub; read it back after the click.
        render(<Harness communityUrl={COMMUNITY_URL} />);
        await openPopup(user);

        await user.click(screen.getByRole("button", { name: /copy link/i }));

        expect(await navigator.clipboard.readText()).toBe(COMMUNITY_URL);
        expect(screen.getByRole("status")).toHaveTextContent(/copied/i);
    });

    it("uses the admin message when one is set", async () => {
        const user = userEvent.setup();
        render(<Harness communityUrl={COMMUNITY_URL} message="  Next batch opens in March!  " />);
        await openPopup(user);

        expect(screen.getByText("Next batch opens in March!")).toBeInTheDocument();
    });

    it.each([
        ["not set", undefined],
        ["empty", ""],
        ["null", null],
        ["a non-WhatsApp host", "https://evil.example/join"],
        ["a javascript: URL", "javascript:alert(1)"],
        ["http instead of https", "http://chat.whatsapp.com/AbC"],
    ])("falls back to contact support when the link is %s", async (_label, communityUrl) => {
        const user = userEvent.setup();
        render(<Harness communityUrl={communityUrl} />);
        await openPopup(user);

        expect(screen.queryByRole("link", { name: /join whatsapp community/i })).toBeNull();
        expect(screen.queryByRole("button", { name: /copy link/i })).toBeNull();
        expect(screen.getByRole("link", { name: /contact support/i })).toHaveAttribute(
            "href",
            "/contact"
        );
        // Never a dead anchor.
        for (const anchor of screen.getAllByRole("link")) {
            expect(anchor.getAttribute("href")).toMatch(/^(\/|https:\/\/)/);
            expect(anchor.getAttribute("href")).not.toMatch(/^(javascript|#)/);
        }
    });

    it("closes on Escape", async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        render(<Harness communityUrl={COMMUNITY_URL} onClose={onClose} />);
        await openPopup(user);

        await user.keyboard("{Escape}");

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("closes on the close button and on a backdrop press, but not on a press inside", async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        render(<Harness communityUrl={COMMUNITY_URL} onClose={onClose} />);

        const dialog = await openPopup(user);
        fireEvent.mouseDown(dialog);
        expect(onClose).not.toHaveBeenCalled();

        fireEvent.mouseDown(screen.getByTestId("whatsapp-community-backdrop"));
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

        await openPopup(user);
        await user.click(screen.getByRole("button", { name: "Close" }));
        expect(onClose).toHaveBeenCalledTimes(2);
    });

    it("moves focus in, traps Tab, locks scroll, and restores focus on close", async () => {
        const user = userEvent.setup();
        render(<Harness communityUrl={COMMUNITY_URL} />);
        const opener = screen.getByRole("button", { name: "Open popup" });

        await user.click(opener);
        const join = screen.getByRole("link", { name: /join whatsapp community/i });
        expect(join).toHaveFocus();
        expect(document.body.style.overflow).toBe("hidden");

        // Focus order inside the dialog: Close, Join, Copy. Tabbing past the last wraps.
        const close = screen.getByRole("button", { name: "Close" });
        const copy = screen.getByRole("button", { name: /copy link/i });
        copy.focus();
        await user.tab();
        expect(close).toHaveFocus();
        await user.tab({ shift: true });
        expect(copy).toHaveFocus();

        await user.keyboard("{Escape}");
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(opener).toHaveFocus();
        expect(document.body.style.overflow).toBe("");
    });

    it("focuses the first action when there is no link", async () => {
        const user = userEvent.setup();
        render(<Harness communityUrl={null} />);
        await openPopup(user);

        expect(screen.getByRole("link", { name: /contact support/i })).toHaveFocus();
        await act(async () => {});
    });
});

describe("getCommunityModalCopy", () => {
    it("prefers a trimmed custom message", () => {
        expect(getCommunityModalCopy(true, "  hi  ").body).toBe("hi");
        expect(getCommunityModalCopy(false, "  hi  ").body).toBe("hi");
    });

    it("differs between the link and no-link defaults", () => {
        expect(getCommunityModalCopy(true).body).toMatch(/WhatsApp community/);
        expect(getCommunityModalCopy(false).body).toMatch(/contact support/i);
        expect(getCommunityModalCopy(true).title).toBe("This workshop is full");
    });
});
