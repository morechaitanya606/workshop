import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SocialShareButtons from "@/components/SocialShareButtons";
import ToastProvider from "@/components/ToastProvider";

const clipboardWriteText = vi.fn();

describe("SocialShareButtons", () => {
    const shareProps = {
        title: "Intro to Wheel Throwing",
        date: "Sun, 29 Mar",
        city: "Bengaluru",
        seatsRemaining: 3,
        url: "https://onlyworkshops.in/workshop/test-workshop",
    };

    beforeEach(() => {
        clipboardWriteText.mockReset();
        Object.defineProperty(window.navigator, "clipboard", {
            configurable: true,
            value: {
                writeText: clipboardWriteText,
            },
        });
        Object.defineProperty(window.navigator, "share", {
            configurable: true,
            value: undefined,
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("falls back to a DM-ready Instagram flow when native share is unavailable", async () => {
        const user = userEvent.setup();
        clipboardWriteText.mockResolvedValue(undefined);
        const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

        render(
            <ToastProvider>
                <SocialShareButtons {...shareProps} />
            </ToastProvider>
        );

        await user.click(screen.getByRole("button", { name: /share on instagram/i }));

        await waitFor(() => {
            expect(openSpy).toHaveBeenCalledWith(
                "https://www.instagram.com/direct/inbox/",
                "_blank",
                "noopener,noreferrer"
            );
        });
        expect(await screen.findByText("Instagram share ready")).toBeInTheDocument();
    });

    it("uses the native share sheet for Instagram when available", async () => {
        const user = userEvent.setup();
        const nativeShare = vi.fn().mockResolvedValue(undefined);
        const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

        Object.defineProperty(window.navigator, "share", {
            configurable: true,
            value: nativeShare,
        });

        render(
            <ToastProvider>
                <SocialShareButtons {...shareProps} />
            </ToastProvider>
        );

        await user.click(screen.getByRole("button", { name: /share on instagram/i }));

        expect(nativeShare).toHaveBeenCalledWith({
            title: shareProps.title,
            text: expect.stringContaining(shareProps.url),
            url: shareProps.url,
        });
        expect(clipboardWriteText).not.toHaveBeenCalled();
        expect(openSpy).not.toHaveBeenCalled();
        expect(screen.queryByText("Instagram share ready")).not.toBeInTheDocument();
    });
});
