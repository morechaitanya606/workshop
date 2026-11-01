import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicOffer } from "@/lib/offers";
import WorkshopOffers, { type WorkshopOffersProps } from "./WorkshopOffers";
import type { OfferRow } from "./workshop-pricing";

function offer(partial: Partial<PublicOffer> & Pick<PublicOffer, "id" | "kind">): PublicOffer {
    return {
        label: "Offer",
        discountType: "percentage",
        discountValue: 10,
        minGuests: null,
        minOrderAmount: null,
        startsAt: null,
        availableUntil: null,
        endsAt: null,
        code: null,
        workshopIds: null,
        categories: null,
        ...partial,
    };
}

const rows: OfferRow[] = [
    {
        offer: offer({
            id: "early-bird:w1",
            kind: "early_bird",
            label: "Early bird 10% off",
            endsAt: "2026-11-01T00:00:00.000Z",
        }),
        details: "",
        status: "applied",
        saves: 260,
    },
    {
        offer: offer({ id: "a1", kind: "auto", label: "Limited-time 10% off" }),
        details: "",
        status: "applied",
        saves: 520,
    },
    {
        offer: offer({
            id: "l1",
            kind: "listed",
            label: "₹300 off per booking",
            discountType: "fixed",
            discountValue: 300,
            code: "SAVE300",
        }),
        details: "",
        status: "available",
        saves: 700,
    },
    {
        offer: offer({ id: "c1", kind: "community", label: "Community price drop" }),
        details: "10% off · For WhatsApp community members",
        status: "available",
        saves: 400,
    },
    {
        offer: offer({ id: "g1", kind: "auto", label: "15% off on 3+ seats", minGuests: 3 }),
        details: "Book 3+ seats",
        status: "needs_seats",
        saves: null,
    },
];

function renderOffers(props: Partial<WorkshopOffersProps> = {}) {
    const onApplyCode = vi.fn();
    render(
        <WorkshopOffers
            rows={rows}
            nowMs={null}
            communityUrl="https://chat.whatsapp.com/abc"
            appliedCode={null}
            codeStatus="none"
            codeRejectionText={null}
            applyingCode={null}
            codeError={null}
            retryCode={null}
            signInHref={null}
            guests={2}
            onApplyCode={onApplyCode}
            onRemoveCode={vi.fn()}
            idPrefix="test"
            {...props}
        />
    );
    return { onApplyCode };
}

describe("WorkshopOffers", () => {
    afterEach(() => {
        cleanup();
    });

    it("lists every offer with its details and state", () => {
        renderOffers();
        expect(screen.getByText("Available offers")).toBeInTheDocument();
        expect(screen.getByText("Early bird 10% off")).toBeInTheDocument();
        expect(screen.getByText("Best offer applied")).toBeInTheDocument();
        expect(screen.getByText("SAVE300")).toBeInTheDocument();
        expect(screen.getByText("10% off · For WhatsApp community members")).toBeInTheDocument();
        expect(
            screen.getByRole("link", { name: /Get the code in our WhatsApp community/ })
        ).toHaveAttribute("href", "https://chat.whatsapp.com/abc");
        expect(
            screen.getByText("Applies when you book 3+ seats (you have 2).")
        ).toBeInTheDocument();
    });

    it("renders offer end dates only after mount", () => {
        renderOffers();
        expect(screen.queryByText(/^Ends /)).not.toBeInTheDocument();
        cleanup();
        renderOffers({ nowMs: Date.parse("2026-10-24T06:00:00.000Z") });
        expect(screen.getByText(/^Ends 1 Nov/)).toBeInTheDocument();
    });

    it("applies a listed code with one tap and shows Applying...", () => {
        const { onApplyCode } = renderOffers();
        fireEvent.click(screen.getByRole("button", { name: "Apply code SAVE300" }));
        expect(onApplyCode).toHaveBeenCalledWith("SAVE300");
        cleanup();
        renderOffers({ applyingCode: "SAVE300" });
        const button = screen.getByRole("button", { name: "Apply code SAVE300" });
        expect(button).toHaveTextContent("Applying...");
        expect(button).toBeDisabled();
    });

    it("hides the community teaser without a WhatsApp link", () => {
        renderOffers({ communityUrl: null });
        expect(screen.queryByText("Community price drop")).not.toBeInTheDocument();
    });

    it("explains that a signed-out visitor must log in, keeping the code", () => {
        renderOffers({
            codeError: "Log in to apply this code. We will keep it for you.",
            signInHref: "/auth/login?redirect=%2Fworkshop%2Fw1%3Fcoupon%3DSAVE300",
        });
        expect(screen.getByText(/Log in to apply this code/)).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute(
            "href",
            "/auth/login?redirect=%2Fworkshop%2Fw1%3Fcoupon%3DSAVE300"
        );
    });

    it("types any other code", () => {
        const { onApplyCode } = renderOffers({ rows: [] });
        expect(screen.queryByText("Available offers")).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Have a coupon code?" }));
        fireEvent.change(screen.getByLabelText("Coupon code"), { target: { value: "diwali" } });
        fireEvent.click(screen.getByRole("button", { name: "Apply" }));
        expect(onApplyCode).toHaveBeenCalledWith("DIWALI");
    });

    it("keeps a phone keyboard from correcting or capitalising a typed code", () => {
        renderOffers({ rows: [] });
        fireEvent.click(screen.getByRole("button", { name: "Have a coupon code?" }));
        const field = screen.getByLabelText("Coupon code");
        expect(field).toHaveAttribute("autocorrect", "off");
        expect(field).toHaveAttribute("spellcheck", "false");
        expect(field).toHaveAttribute("autocapitalize", "characters");
    });

    it("does not offer to apply a code the booking cannot use yet, and says why", () => {
        const groupCode: OfferRow = {
            offer: offer({
                id: "l3",
                kind: "listed",
                label: "20% off on 3+ seats",
                minGuests: 3,
                code: "GROUP3",
            }),
            details: "Book 3+ seats",
            status: "needs_seats",
            saves: null,
        };
        const { onApplyCode } = renderOffers({ rows: [groupCode] });
        const apply = screen.getByRole("button", { name: "Apply code GROUP3" });
        expect(apply).toBeDisabled();
        expect(apply).toHaveAccessibleDescription("Applies when you book 3+ seats (you have 2).");
        fireEvent.click(apply);
        expect(onApplyCode).not.toHaveBeenCalled();
    });

    it("lets a code be applied again once the booking meets its minimum", () => {
        const groupCode: OfferRow = {
            offer: offer({
                id: "l3",
                kind: "listed",
                label: "20% off on 3+ seats",
                minGuests: 3,
                code: "GROUP3",
            }),
            details: "Book 3+ seats",
            status: "available",
            saves: 900,
        };
        const { onApplyCode } = renderOffers({ rows: [groupCode], guests: 3 });
        fireEvent.click(screen.getByRole("button", { name: "Apply code GROUP3" }));
        expect(onApplyCode).toHaveBeenCalledWith("GROUP3");
    });

    describe("one offer applies per booking", () => {
        const applied: OfferRow = {
            offer: offer({ id: "a1", kind: "auto", label: "Limited-time offer" }),
            details: "10% off",
            status: "applied",
            saves: 520,
        };
        const smaller: OfferRow = {
            offer: offer({
                id: "l2",
                kind: "listed",
                label: "Group offer",
                discountType: "fixed",
                discountValue: 150,
                code: "GROUP10",
            }),
            details: "₹150 off per booking",
            status: "better_applied",
            saves: 150,
        };

        it("states the rule once when offers compete, and mentions Early Bird when there is one", () => {
            renderOffers();
            expect(screen.getByTestId("offers-rule")).toHaveTextContent(
                "Early Bird applies, plus one more offer: the one that saves you the most."
            );
            cleanup();
            renderOffers({ rows: [applied, smaller] });
            expect(screen.getByTestId("offers-rule")).toHaveTextContent(
                "One offer applies to each booking: the one that saves you the most."
            );
        });

        it("does not state the rule when only one offer is listed", () => {
            renderOffers({ rows: [applied] });
            expect(screen.queryByTestId("offers-rule")).not.toBeInTheDocument();
        });

        it("shows what the applied offer saves, and why a smaller one is not used", () => {
            renderOffers({
                rows: [applied, smaller],
                appliedOfferLabel: "Limited-time offer",
                appliedOfferSaves: 520,
            });
            expect(
                screen.getByText("Applied to your booking: saves you ₹520.")
            ).toBeInTheDocument();
            expect(
                screen.getByText(
                    "Not used: it saves ₹150, but Limited-time offer saves you ₹520. One offer applies per booking, the one that saves the most."
                )
            ).toBeInTheDocument();
            // A losing code has no Apply button.
            expect(screen.queryByRole("button", { name: "Apply code GROUP10" })).toBeNull();
        });

        it("says so when a code not applied would save more than what applies now", () => {
            const bigger: OfferRow = { ...smaller, status: "available", saves: 1040 };
            renderOffers({
                rows: [applied, bigger],
                appliedOfferLabel: "Limited-time offer",
                appliedOfferSaves: 520,
            });
            expect(
                screen.getByText(
                    "Saves you ₹1,040 instead of the ₹520 you get now. One offer applies per booking."
                )
            ).toBeInTheDocument();
            expect(screen.getByRole("button", { name: "Apply code GROUP10" })).toBeEnabled();
        });

        it("falls back to the short sentence when the applied offer is not known", () => {
            renderOffers({ rows: [applied, smaller] });
            expect(
                screen.getByText("A bigger offer is applied. One offer per booking.")
            ).toBeInTheDocument();
        });

        it("explains a typed code that loses, with the offer that beat it", () => {
            renderOffers({
                rows: [],
                appliedCode: "NEW10",
                codeStatus: "better_offer",
                appliedOfferLabel: "Limited-time offer",
                appliedOfferSaves: 520,
            });
            // Shown on the page and read out by the (screen-reader only) status line.
            expect(
                screen.getAllByText(
                    /is valid, but Limited-time offer saves you more \(₹520\)\. One offer applies per booking\./
                )
            ).toHaveLength(2);
            expect(screen.getByRole("status")).toHaveTextContent(
                "Code NEW10 is valid, but Limited-time offer saves you more (₹520). One offer applies per booking."
            );
        });
    });

    it("tells screen readers what happened to the code", () => {
        renderOffers({ appliedCode: "SAVE300", codeStatus: "applied" });
        expect(screen.getByRole("status")).toHaveTextContent(
            "Code SAVE300 applied. The total is updated."
        );
        cleanup();
        renderOffers({
            appliedCode: "OLDCODE",
            codeStatus: "rejected",
            codeRejectionText: "This offer has ended.",
        });
        expect(screen.getByRole("status")).toHaveTextContent(
            "Code OLDCODE cannot be used: This offer has ended."
        );
        cleanup();
        renderOffers({ applyingCode: "SAVE300" });
        expect(screen.getByRole("status")).toHaveTextContent("Checking code SAVE300.");
        cleanup();
        renderOffers();
        expect(screen.getByRole("status")).toBeEmptyDOMElement();
    });
});
