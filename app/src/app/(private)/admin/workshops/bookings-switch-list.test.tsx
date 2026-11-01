import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Workshop } from "@/lib/data";
import {
    getAdminCoupons,
    getAdminWorkshops,
    setAdminWorkshopBookingsClosed,
    type AdminWorkshopBookingStatusResponse,
} from "@/lib/api-client";
import AdminWorkshopsPage from "./page";

const auth = vi.hoisted(() => ({ session: { access_token: "token" } }));

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
// One stable session object: the page reloads its list whenever the session changes.
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ session: auth.session }) }));
vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return {
        ...actual,
        getAdminWorkshops: vi.fn(),
        getAdminCoupons: vi.fn(),
        setAdminWorkshopBookingsClosed: vi.fn(),
        getAdminWorkshopBookingStatus: vi.fn(),
        approveAdminWorkshop: vi.fn(),
        rejectAdminWorkshop: vi.fn(),
        deleteAdminWorkshop: vi.fn(),
    };
});

const listWorkshops = vi.mocked(getAdminWorkshops);
const setClosed = vi.mocked(setAdminWorkshopBookingsClosed);
const listCoupons = vi.mocked(getAdminCoupons);

function offer(id: string, overrides: Record<string, unknown> = {}) {
    return {
        id,
        code: id.toUpperCase(),
        discount_type: "percentage",
        discount_value: 10,
        is_active: true,
        used_count: 0,
        valid_until: null,
        created_at: null,
        applicable_workshop_ids: null,
        ...overrides,
    };
}

function workshop(id: string, title: string, maxSeats: number, seatsRemaining: number) {
    return {
        id,
        title,
        coverImage: "/images/cover.webp",
        category: "Pottery",
        approvalStatus: "approved",
        date: "2026-11-20",
        time: "10:00",
        location: "Studio",
        city: "Pune",
        price: 1500,
        maxSeats,
        seatsRemaining,
    } as unknown as Workshop;
}

const POTTERY = workshop("pottery-1760000000000", "Pottery Basics", 12, 5);
const BAKING = workshop("baking-1760000000001", "Sourdough Baking", 10, 10);

function deferred<T>() {
    let resolve: (value: T) => void = () => {};
    const promise = new Promise<T>((r) => (resolve = r));
    return { promise, resolve };
}

function switchOf(title: string) {
    return screen.getByRole("switch", { name: new RegExp(`for ${title}$`) });
}

describe("admin workshops list: Bookings switches", () => {
    beforeEach(() => {
        // Embedded browsers answer window.confirm with "cancel" at once: the switch must not use it.
        vi.spyOn(window, "confirm").mockReturnValue(false);
        listWorkshops.mockResolvedValue({
            data: [POTTERY, BAKING],
            closedWorkshopIds: [BAKING.id],
            closedWorkshopIdsOk: true,
        });
        listCoupons.mockResolvedValue({ coupons: [], nextCursor: null } as never);
    });
    afterEach(() => {
        cleanup();
    });

    it("counts the active offers that reach each workshop on its Offers button", async () => {
        listCoupons.mockResolvedValue({
            coupons: [
                offer("everyone"),
                offer("pottery-only", { applicable_workshop_ids: [POTTERY.id] }),
                offer("baking-only", { applicable_workshop_ids: [BAKING.id] }),
                offer("baking-too", { applicable_workshop_ids: [BAKING.id] }),
                offer("paused", { is_active: false }),
            ],
            nextCursor: null,
        } as never);
        render(<AdminWorkshopsPage />);

        // Pottery: the one for everyone + its own. Baking: the one for everyone + its two.
        // The paused offer counts for neither.
        const potteryOffers = await screen.findByRole("link", { name: "Offers (2)" });
        expect(potteryOffers).toHaveAttribute("href", `/admin/workshops/${POTTERY.id}/edit#offers`);
        expect(screen.getByRole("link", { name: "Offers (3)" })).toHaveAttribute(
            "href",
            `/admin/workshops/${BAKING.id}/edit#offers`
        );
    });

    it("still shows an Offers button when the offers cannot be read", async () => {
        listCoupons.mockRejectedValue(new Error("offline"));
        render(<AdminWorkshopsPage />);

        const buttons = await screen.findAllByRole("link", { name: "Offers" });
        expect(buttons).toHaveLength(2);
    });

    it("shows one named switch per workshop, with the state in words and a badge when closed", async () => {
        render(<AdminWorkshopsPage />);

        expect(
            await screen.findByRole("switch", { name: "Bookings: Open for Pottery Basics" })
        ).toBe(switchOf("Pottery Basics"));
        expect(switchOf("Sourdough Baking")).toHaveTextContent("Bookings: Closed");
        expect(switchOf("Sourdough Baking")).toHaveAttribute("aria-checked", "false");
        expect(screen.getAllByText("Bookings closed")).toHaveLength(1);
        expect(screen.getByText("7/12 seats booked")).toBeInTheDocument();
    });

    it("keeps every switch off when the closed list could not be read", async () => {
        listWorkshops.mockResolvedValue({
            data: [POTTERY, BAKING],
            closedWorkshopIds: [],
            closedWorkshopIdsOk: false,
        });
        render(<AdminWorkshopsPage />);

        await screen.findByRole("switch", { name: /for Pottery Basics$/ });
        expect(switchOf("Pottery Basics")).toBeDisabled();
        expect(switchOf("Sourdough Baking")).toBeDisabled();
        expect(screen.getAllByText(/could not be loaded/)).toHaveLength(2);
    });

    it("keeps both workshops closed when two quick saves are answered out of order", async () => {
        listWorkshops.mockResolvedValue({
            data: [POTTERY, BAKING],
            closedWorkshopIds: [],
            closedWorkshopIdsOk: true,
        });
        const first = deferred<AdminWorkshopBookingStatusResponse>();
        const second = deferred<AdminWorkshopBookingStatusResponse>();
        setClosed.mockImplementation((_token, id) =>
            id === POTTERY.id ? first.promise : second.promise
        );
        render(<AdminWorkshopsPage />);
        await screen.findByRole("switch", { name: /for Pottery Basics$/ });

        // The owner closes Pottery, then Baking, before either save has been answered.
        fireEvent.click(switchOf("Pottery Basics"));
        fireEvent.click(screen.getByRole("button", { name: "Close bookings for Pottery Basics" }));
        fireEvent.click(switchOf("Sourdough Baking"));
        fireEvent.click(
            screen.getByRole("button", { name: "Close bookings for Sourdough Baking" })
        );

        // The later save is answered first (its list has both); the earlier one answers last with
        // the list as it was when it finished (only Pottery).
        second.resolve({
            workshopId: BAKING.id,
            closed: true,
            closedWorkshopIds: [POTTERY.id, BAKING.id],
        });
        await waitFor(() => expect(switchOf("Sourdough Baking")).not.toBeDisabled());
        first.resolve({
            workshopId: POTTERY.id,
            closed: true,
            closedWorkshopIds: [POTTERY.id],
        });
        await waitFor(() => expect(switchOf("Pottery Basics")).not.toBeDisabled());

        expect(switchOf("Pottery Basics")).toHaveTextContent("Bookings: Closed");
        expect(switchOf("Sourdough Baking")).toHaveTextContent("Bookings: Closed");
        expect(screen.getAllByText("Bookings closed")).toHaveLength(2);
    });
});
