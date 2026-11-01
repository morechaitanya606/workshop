import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Workshop } from "@/lib/data";
import {
    ApiClientError,
    getAdminWorkshop,
    getAdminWorkshopBookingStatus,
    updateAdminWorkshop,
} from "@/lib/api-client";
import AdminEditWorkshopPage from "./page";

const WORKSHOP_ID = "pottery-1760000000000";
const auth = vi.hoisted(() => ({ session: { access_token: "token" } }));

vi.mock("next/navigation", () => ({
    useParams: () => ({ id: "pottery-1760000000000" }),
    useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));
vi.mock("next/image", () => ({
    default: ({ src, alt }: { src: string; alt: string }) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} />
    ),
}));
vi.mock("next/link", () => ({
    default: ({ href, children }: { href: string; children: ReactNode }) => (
        <a href={href}>{children}</a>
    ),
}));
vi.mock("@/components/admin/AdminShell", () => ({
    default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/admin/OffersManager", () => ({
    default: ({ workshop }: { workshop?: { id: string; title: string } | null }) => (
        <div data-testid="offers-manager">
            {workshop ? `${workshop.id}|${workshop.title}` : "all"}
        </div>
    ),
}));
vi.mock("@/components/ImageCropper", () => ({
    useImageCropper: () => ({
        cropImages: async () => [],
        cropExistingImage: async () => null,
        cropperElement: null,
    }),
}));
// One stable session object: the page reloads whenever the session changes.
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ session: auth.session }) }));
vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return {
        ...actual,
        getAdminWorkshop: vi.fn(),
        getAdminWorkshopBookingStatus: vi.fn(),
        setAdminWorkshopBookingsClosed: vi.fn(),
        updateAdminWorkshop: vi.fn(),
        uploadMedia: vi.fn(),
    };
});

const loadWorkshop = vi.mocked(getAdminWorkshop);
const loadStatus = vi.mocked(getAdminWorkshopBookingStatus);
const saveWorkshop = vi.mocked(updateAdminWorkshop);

function workshop(overrides: Record<string, unknown> = {}) {
    return {
        id: WORKSHOP_ID,
        title: "Pottery Basics",
        description: "Learn the wheel in one relaxed afternoon, with all clay and tools included.",
        category: "Pottery",
        price: 1500,
        location: "Studio",
        city: "Pune",
        duration: "3 hours",
        date: "2026-11-20",
        time: "10:00",
        maxSeats: 12,
        seatsRemaining: 5,
        coverImage: "/images/cover.webp",
        galleryImages: [],
        locationImages: [],
        earlyBirdEnabled: false,
        earlyBirdDiscountType: "percentage",
        earlyBirdDiscountValue: 0,
        earlyBirdDaysAfterListing: 0,
        ...overrides,
    } as unknown as Workshop;
}

describe("admin edit workshop page", () => {
    beforeEach(() => {
        loadWorkshop.mockResolvedValue({ workshop: workshop(), source: "supabase" } as never);
        loadStatus.mockResolvedValue({
            workshopId: WORKSHOP_ID,
            closed: false,
            closedWorkshopIds: [],
        });
    });
    afterEach(() => {
        cleanup();
    });

    it("shows the Bookings switch with the booked seats", async () => {
        render(<AdminEditWorkshopPage />);

        const toggle = await screen.findByRole("switch", {
            name: "Bookings: Open for Pottery Basics",
        });
        expect(toggle).not.toBeDisabled();
        expect(screen.getByText("7/12 seats booked")).toBeInTheDocument();
        expect(loadStatus).toHaveBeenCalledWith("token", WORKSHOP_ID);
    });

    it("has an Offers section for this workshop, with a link to its public page", async () => {
        render(<AdminEditWorkshopPage />);

        const offers = await screen.findByTestId("offers-manager");
        expect(offers).toHaveTextContent(`${WORKSHOP_ID}|Pottery Basics`);
        expect(offers.closest("section")).toHaveAttribute("id", "offers");
        expect(screen.getByRole("link", { name: "View workshop page" })).toHaveAttribute(
            "href",
            `/workshop/${WORKSHOP_ID}`
        );
    });

    it("has no public page link for a workshop that is not approved yet", async () => {
        loadWorkshop.mockResolvedValue({
            workshop: workshop({ approvalStatus: "pending" }),
            source: "supabase",
        } as never);
        render(<AdminEditWorkshopPage />);

        expect(await screen.findByTestId("offers-manager")).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: "View workshop page" })).not.toBeInTheDocument();
    });

    it("shows the Bookings closed badge when the fresh read says closed", async () => {
        loadStatus.mockResolvedValue({
            workshopId: WORKSHOP_ID,
            closed: true,
            closedWorkshopIds: [WORKSHOP_ID],
        });
        render(<AdminEditWorkshopPage />);

        expect(
            await screen.findByRole("switch", { name: "Bookings: Closed for Pottery Basics" })
        ).toHaveAttribute("aria-checked", "false");
        expect(screen.getByText("Bookings closed")).toBeInTheDocument();
    });

    it("keeps the switch off when the state could not be read", async () => {
        loadStatus.mockRejectedValue(new ApiClientError("Try again.", 503));
        render(<AdminEditWorkshopPage />);

        const toggle = await screen.findByRole("switch");
        expect(toggle).toBeDisabled();
        expect(screen.getByText(/could not be loaded/)).toBeInTheDocument();
        expect(screen.queryByText("Bookings closed")).not.toBeInTheDocument();
    });

    it("shows the Early Bird percentage error next to its field and saves nothing", async () => {
        loadWorkshop.mockResolvedValue({
            workshop: workshop({
                earlyBirdEnabled: true,
                earlyBirdDiscountType: "percentage",
                earlyBirdDiscountValue: 150,
                earlyBirdDaysAfterListing: 2,
            }),
            source: "supabase",
        } as never);
        const { container } = render(<AdminEditWorkshopPage />);
        await screen.findByRole("switch", { name: /Pottery Basics/ });

        fireEvent.submit(container.querySelector("form") as HTMLFormElement);

        const message = await screen.findByText(
            "A percentage Early Bird discount cannot exceed 100."
        );
        // Under the value input itself, not only in a banner nobody can match to a field.
        expect(message.previousElementSibling).toBe(screen.getByPlaceholderText("e.g. 10"));
        await waitFor(() =>
            expect(screen.getByText(/Please fix the highlighted fields/)).toBeInTheDocument()
        );
        expect(saveWorkshop).not.toHaveBeenCalled();
    });
});
