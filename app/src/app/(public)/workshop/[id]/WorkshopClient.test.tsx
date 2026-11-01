import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createElement, lazy, Suspense, type ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Workshop } from "@/lib/data";
import WorkshopClient, { type WorkshopClientProps } from "./WorkshopClient";

const state = vi.hoisted(() => ({
    auth: { user: null, session: null, loading: false } as {
        user: { id: string } | null;
        session: { access_token: string } | null;
        loading: boolean;
    },
    settings: {} as Record<string, unknown>,
    router: { push: () => undefined, prefetch: () => undefined },
    toast: { info: () => undefined, success: () => undefined, error: () => undefined },
    createBookingHold: (async () => ({})) as (...args: unknown[]) => Promise<unknown>,
}));

vi.mock("next/dynamic", () => ({
    default: (loader: () => Promise<{ default: ComponentType<Record<string, unknown>> }>) => {
        const Lazy = lazy(loader);
        return function Dynamic(props: Record<string, unknown>) {
            return (
                <Suspense fallback={null}>
                    <Lazy {...props} />
                </Suspense>
            );
        };
    },
}));
vi.mock("next/navigation", () => ({ useRouter: () => state.router }));
vi.mock("next/image", () => ({
    // eslint-disable-next-line @next/next/no-img-element
    default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));
vi.mock("framer-motion", () => {
    const MOTION_PROPS = [
        "variants",
        "initial",
        "animate",
        "whileInView",
        "viewport",
        "transition",
    ];
    const motion = new Proxy(
        {},
        {
            get: (_target, tag: string) =>
                function Motion(props: Record<string, unknown>) {
                    return createElement(
                        tag,
                        Object.fromEntries(
                            Object.entries(props).filter(([key]) => !MOTION_PROPS.includes(key))
                        )
                    );
                },
        }
    );
    return { motion };
});
vi.mock("@/components/Footer", () => ({ default: () => null }));
vi.mock("@/components/WhatsAppCommunityModal", () => ({ default: () => null }));
vi.mock("@/components/WorkshopFAQ", () => ({ default: () => null }));
vi.mock("@/components/SocialShareButtons", () => ({
    default: ({ url }: { url: string }) => (
        <a data-testid="share-link" href={url}>
            Share
        </a>
    ),
}));
vi.mock("@/components/WorkshopCard", () => ({
    default: ({ workshop }: { workshop: Workshop }) => <h3>{workshop.title}</h3>,
}));
vi.mock("@/components/ToastProvider", () => ({ useToast: () => state.toast }));
vi.mock("./WorkshopGallery", () => ({ default: () => null }));
vi.mock("./WorkshopPastEventSidebar", () => ({ default: () => null }));
vi.mock("@/lib/api-client", () => ({
    addFavorite: async () => ({ favorites: [] }),
    createBookingHold: (...args: unknown[]) => state.createBookingHold(...args),
    getFavorites: async () => ({ favorites: [] }),
    getWorkshopNotifications: async () => ({ subscriptions: {} }),
    isApiClientError: (error: unknown) =>
        Boolean(error && typeof error === "object" && "status" in error),
    removeFavorite: async () => ({ favorites: [] }),
    toApiErrorMessage: (_error: unknown, fallback: string) => fallback,
    updateWorkshopNotifications: async () => ({ subscriptions: {} }),
}));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => state.auth }));
vi.mock("@/lib/analytics", () => ({ trackEvent: () => undefined }));
vi.mock("@/lib/recently-viewed", () => ({ addRecentlyViewed: () => undefined }));
vi.mock("@/lib/platform-settings-context", () => ({
    usePlatformSettings: () => ({ settings: state.settings }),
}));
vi.mock("@/lib/run-when-page-idle", () => ({ runWhenPageIdle: () => () => undefined }));
vi.mock("@/lib/use-modal-a11y", () => ({ useModalA11y: () => undefined }));

const fetchMock = vi.fn();

// 24 Oct 2026, 11:30 IST. The page's own clock is fixed to it, so the Early Bird (listed on the
// 22nd for 10 days) is running and the session (20 Nov) is still ahead whenever this test runs.
const NOW = Date.parse("2026-10-24T06:00:00.000Z");

const baseWorkshop: Workshop = {
    id: "pottery-1760000000000",
    title: "Hand-built pottery",
    description: "Make a bowl.",
    category: "Pottery",
    price: 1999,
    location: "Clay Studio",
    city: "Pune",
    duration: "3 hours",
    date: "2026-11-20",
    time: "10:00",
    maxSeats: 10,
    seatsRemaining: 6,
    coverImage: "/images/cover.jpg",
    galleryImages: [],
    rating: 0,
    reviewCount: 0,
    hostName: "Asha",
    hostAvatar: "/images/host.jpg",
    hostBio: "A potter.",
    whatYouLearn: ["Throwing"],
    materialsProvided: ["Clay"],
    eventAddress: "12 Lane, Koregaon Park",
    createdAt: "2026-10-22T10:00:00.000Z",
    earlyBirdEnabled: true,
    earlyBirdDiscountType: "percentage",
    earlyBirdDiscountValue: 10,
    earlyBirdDaysAfterListing: 10,
};

function renderPage(props: Partial<WorkshopClientProps> & { workshop?: Partial<Workshop> } = {}) {
    const { workshop, ...rest } = props;
    return render(
        <WorkshopClient
            workshop={{ ...baseWorkshop, ...workshop }}
            renderedAtMs={NOW}
            todayIso="2026-10-24"
            {...rest}
        />
    );
}

function accepted(id: string, type: "percentage" | "fixed", discount: number) {
    return {
        ok: true,
        status: 200,
        json: async () => ({ valid: true, id, type, discount }),
    } as Response;
}

const pagePath = `/workshop/${baseWorkshop.id}`;

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    state.auth = { user: null, session: null, loading: false };
    state.settings = {};
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal(
        "matchMedia",
        vi.fn(() => ({
            matches: false,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        }))
    );
    window.history.replaceState(null, "", pagePath);
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    window.history.replaceState(null, "", "/");
});

describe("WorkshopClient: a coupon code in the address", () => {
    it("takes it out of the address bar, and the share link never carries it", async () => {
        window.history.replaceState(null, "", `${pagePath}?coupon=hidden15&utm_source=wa`);
        renderPage();
        const share = await screen.findByTestId("share-link");
        await waitFor(() =>
            expect(share).toHaveAttribute("href", `${window.location.origin}${pagePath}`)
        );
        expect(window.location.search).toBe("?utm_source=wa");
    });

    it("applies it once the visitor is signed in", async () => {
        state.auth = { user: { id: "u1" }, session: { access_token: "tok" }, loading: false };
        fetchMock.mockResolvedValue(
            accepted("00000000-0000-4000-8000-0000000000aa", "percentage", 15)
        );
        window.history.replaceState(null, "", `${pagePath}?coupon=hidden15`);
        renderPage();
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
            code: "HIDDEN15",
            workshopId: baseWorkshop.id,
            guests: 2,
        });
        expect((await screen.findAllByText(/Code HIDDEN15/)).length).toBeGreaterThan(0);
        expect(window.location.search).toBe("");
    });

    it("keeps it for the login link while signed out, without asking the server", async () => {
        window.history.replaceState(null, "", `${pagePath}?coupon=hidden15`);
        renderPage();
        await waitFor(() => {
            const links = screen.getAllByRole("link", { name: /Log in/ });
            expect(links.length).toBeGreaterThan(0);
            for (const link of links) {
                const redirect = new URL(
                    link.getAttribute("href") ?? "",
                    "http://localhost"
                ).searchParams.get("redirect");
                expect(redirect).toBe(`${pagePath}?coupon=HIDDEN15`);
            }
        });
        expect(fetchMock).not.toHaveBeenCalled();
        expect(window.location.search).toBe("");
    });

    it("keeps it for the login link while the session is still being read", async () => {
        // supabase-js loads lazily, so on a slow phone the visitor can tap "Log in" before the
        // session is known: the code must already be in that link.
        state.auth = { user: null, session: null, loading: true };
        window.history.replaceState(null, "", `${pagePath}?coupon=hidden15`);
        renderPage();
        await waitFor(() => {
            const links = screen.getAllByRole("link", { name: /Log in/ });
            expect(links.length).toBeGreaterThan(0);
            for (const link of links) {
                const redirect = new URL(
                    link.getAttribute("href") ?? "",
                    "http://localhost"
                ).searchParams.get("redirect");
                expect(redirect).toBe(`${pagePath}?coupon=HIDDEN15`);
            }
        });
        expect(fetchMock).not.toHaveBeenCalled();
        expect(window.location.search).toBe("");
    });

    it("does not send the page address to Google Maps", () => {
        renderPage();
        expect(document.querySelector("iframe")).toHaveAttribute(
            "referrerpolicy",
            "strict-origin-when-cross-origin"
        );
    });
});

describe("WorkshopClient: bookings closed by the admin", () => {
    it("shows Bookings closed, never Sold out, and no offers or Book button", () => {
        renderPage({ bookingsClosed: true, workshop: { seatsRemaining: 0 } });
        expect(screen.getAllByText("Bookings closed").length).toBeGreaterThan(0);
        expect(screen.queryByText(/sold out/i)).not.toBeInTheDocument();
        expect(screen.queryByText("Available offers")).not.toBeInTheDocument();
        expect(screen.queryByRole("link", { name: /Log in/ })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /Reserve/ })).not.toBeInTheDocument();
    });

    it("is not closed by an older tab's settings that still list the workshop", () => {
        state.settings = { closed_workshop_ids: [baseWorkshop.id] };
        renderPage({ bookingsClosed: false });
        expect(screen.queryByText("Bookings closed")).not.toBeInTheDocument();
        expect(screen.getAllByText("Seats available").length).toBeGreaterThan(0);
        // The exact number is not shown.
        expect(screen.queryByText(/\d+ seats? available/)).not.toBeInTheDocument();
    });

    it("closes the page when a seat hold is refused because the admin closed it since", async () => {
        vi.useRealTimers();
        state.auth = { user: { id: "u1" }, session: { access_token: "tok" }, loading: false };
        state.createBookingHold = async () => {
            throw Object.assign(new Error("Bookings for this workshop are closed."), {
                status: 409,
                details: { code: "BOOKINGS_CLOSED" },
            });
        };
        renderPage({ renderedAtMs: Date.now() });
        fireEvent.click(screen.getAllByRole("button", { name: /Reserve Spot/ })[0]);
        await waitFor(() =>
            expect(screen.queryByRole("button", { name: /Reserve Spot/ })).not.toBeInTheDocument()
        );
        expect(screen.getAllByText("Bookings closed").length).toBeGreaterThan(0);
        expect(screen.queryByText(/sold out/i)).not.toBeInTheDocument();
    });
});

describe("WorkshopClient: what a visitor is shown for a workshop nobody can book", () => {
    it("advertises the Early Bird only while the workshop can be booked", () => {
        const open = renderPage();
        expect(screen.getAllByText("Early bird 10% off").length).toBeGreaterThan(0);
        expect(document.querySelectorAll(".line-through").length).toBeGreaterThan(0);
        open.unmount();

        renderPage({ workshop: { seatsRemaining: 0 } });
        expect(screen.queryByText(/Early bird/i)).not.toBeInTheDocument();
        expect(document.querySelector(".line-through")).toBeNull();
        expect(screen.getAllByText(/Sold out/i).length).toBeGreaterThan(0);
    });

    it("does not suggest a closed workshop as the alternative to a sold-out one", () => {
        const open = { ...baseWorkshop, id: "open-alt", title: "Open alternative" };
        const closed = { ...baseWorkshop, id: "closed-alt", title: "Closed alternative" };
        renderPage({
            workshop: { seatsRemaining: 0 },
            similarWorkshops: [closed, open],
            closedSimilarIds: ["closed-alt"],
        });
        const panel = screen.getByText("All spots are taken for this workshop")
            .parentElement as HTMLElement;
        expect(within(panel).getByText("Open alternative")).toBeInTheDocument();
        expect(within(panel).queryByText("Closed alternative")).not.toBeInTheDocument();
    });
});
