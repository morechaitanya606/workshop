// @vitest-environment node
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Workshop } from "@/lib/data";
import { getCachedPlatformSettings } from "@/lib/cached-reads";
import { getCachedFaqRows } from "@/lib/faqs";
import type { PublicOffer } from "@/lib/offers";
import { loadPublicOffers } from "@/lib/offers-server";
import { loadClosedWorkshopIds } from "@/lib/workshop-availability-server";
import WorkshopDetailPage from "./page";
import WorkshopClient, { type WorkshopClientProps } from "./WorkshopClient";
import { priceWorkshop, toPricingWorkshop } from "./workshop-pricing";
import { loadWorkshop } from "./workshop-read";

const state = vi.hoisted(() => ({ notFoundCalls: 0 }));

vi.mock("next/navigation", () => ({
    notFound: () => {
        state.notFoundCalls += 1;
        throw new Error("NEXT_NOT_FOUND");
    },
}));
vi.mock("./WorkshopClient", () => ({ default: () => null }));
vi.mock("./workshop-read", () => ({ loadWorkshop: vi.fn(), WORKSHOP_READ_TIMEOUT_MS: 5000 }));
vi.mock("@/lib/offers-server", () => ({ loadPublicOffers: vi.fn() }));
vi.mock("@/lib/workshop-availability-server", () => ({ loadClosedWorkshopIds: vi.fn() }));
vi.mock("@/lib/cached-reads", () => ({ getCachedPlatformSettings: vi.fn() }));
vi.mock("@/lib/faqs", () => ({ getCachedFaqRows: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({
    isSupabaseServiceConfigured: false,
    createSupabaseServiceClient: vi.fn(),
}));

// 24 Oct 2026, 11:30 IST. The Early Bird (listed on the 22nd for 10 days) is running and the
// session (20 Nov, 10:00 IST) is a month away.
const NOW = Date.parse("2026-10-24T06:00:00.000Z");
// Two hours before the session starts: inside the 3-hour booking cut-off.
const INSIDE_CUTOFF = Date.parse("2026-11-20T02:30:00.000Z");
// Early afternoon the day before: bookable, and the Early Bird has long ended.
const BOOKABLE_LATER = Date.parse("2026-11-19T06:00:00.000Z");

const workshop: Workshop = {
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

const auto10: PublicOffer = {
    id: "00000000-0000-4000-8000-000000000001",
    kind: "auto",
    label: "Limited-time 10% off",
    discountType: "percentage",
    discountValue: 10,
    minGuests: null,
    minOrderAmount: null,
    startsAt: null,
    availableUntil: "2026-11-30T18:00:00.000Z",
    endsAt: "2026-11-30T18:00:00.000Z",
    code: null,
    workshopIds: null,
    categories: null,
};

function elementsOf(node: ReactNode, found: ReactElement[] = []): ReactElement[] {
    if (Array.isArray(node)) {
        node.forEach((child) => elementsOf(child, found));
    } else if (isValidElement(node)) {
        found.push(node);
        elementsOf((node.props as { children?: ReactNode }).children, found);
    }
    return found;
}

type EventMarkup = {
    offers: {
        price: number;
        availability: string;
        priceValidUntil?: string;
        validThrough?: string;
    };
};

async function renderPage(options: { workshop?: Partial<Workshop> } = {}) {
    vi.mocked(loadWorkshop).mockResolvedValue({ ...workshop, ...options.workshop });
    const tree = await WorkshopDetailPage({ params: Promise.resolve({ id: workshop.id }) });
    const elements = elementsOf(tree);
    const scripts = elements
        .filter((element) => element.type === "script")
        .map((element) => {
            const html = (element.props as { dangerouslySetInnerHTML: { __html: string } })
                .dangerouslySetInnerHTML.__html;
            return JSON.parse(html) as { "@type": string };
        });
    const client = elements.find((element) => element.type === WorkshopClient);
    return {
        props: client?.props as WorkshopClientProps,
        event: scripts.find((script) => script["@type"] === "Event") as EventMarkup | undefined,
    };
}

/** What the page shows for one guest, from the props the server hands the client. */
function shownOnePersonPrice(props: WorkshopClientProps, nowMs: number, source = workshop) {
    const pricing = priceWorkshop({
        workshop: toPricingWorkshop(source),
        guests: 1,
        offers: props.offers ?? [],
        code: null,
        serviceFee: props.serviceFee ?? 99,
        now: nowMs,
        bookingsClosed: props.bookingsClosed,
    });
    return pricing.headline?.offerPrice ?? source.price;
}

describe("WorkshopDetailPage", () => {
    beforeEach(() => {
        state.notFoundCalls = 0;
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(NOW);
        vi.mocked(getCachedPlatformSettings).mockResolvedValue({});
        vi.mocked(getCachedFaqRows).mockResolvedValue([]);
        vi.mocked(loadPublicOffers).mockResolvedValue([]);
        vi.mocked(loadClosedWorkshopIds).mockResolvedValue(new Set());
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("answers 404 only for a workshop that does not exist", async () => {
        vi.mocked(loadWorkshop).mockResolvedValue(null);
        await expect(
            WorkshopDetailPage({ params: Promise.resolve({ id: "nothing-here" }) })
        ).rejects.toThrow("NEXT_NOT_FOUND");
        expect(state.notFoundCalls).toBe(1);
    });

    it("lets a failed read fail the render instead of turning it into a 404", async () => {
        vi.mocked(loadWorkshop).mockRejectedValue(new Error("Workshop x could not be read."));
        await expect(
            WorkshopDetailPage({ params: Promise.resolve({ id: workshop.id }) })
        ).rejects.toThrow("could not be read");
        expect(state.notFoundCalls).toBe(0);
    });

    it("prices the Event markup like the page: the one-guest Early Bird price, valid until its end", async () => {
        const { props, event } = await renderPage();
        const shown = shownOnePersonPrice(props, NOW);
        expect(shown).toBeLessThan(workshop.price);
        expect(event?.offers.price).toBe(shown);
        expect(event?.offers.availability).toBe("https://schema.org/InStock");
        expect(event?.offers.priceValidUntil).toBe("2026-11-02");
        expect(props.bookingsClosed).toBe(false);
        expect(props.renderedAtMs).toBe(NOW);
    });

    it("adds the live auto offer to the Early Bird in the markup, as the page does", async () => {
        vi.mocked(loadPublicOffers).mockResolvedValue([auto10]);
        const { props, event } = await renderPage();
        const shown = shownOnePersonPrice(props, NOW);
        expect(event?.offers.price).toBe(shown);
        // Both discounts: below what the Early Bird alone gives.
        expect(shown).toBeLessThan(1800);
        expect(props.offers?.map((offer) => offer.kind)).toEqual(["early_bird", "auto"]);
    });

    it("closed by the admin: no offers, the list price and SoldOut in the markup", async () => {
        vi.mocked(loadPublicOffers).mockResolvedValue([auto10]);
        vi.mocked(loadClosedWorkshopIds).mockResolvedValue(new Set([workshop.id]));
        const { props, event } = await renderPage();
        expect(props.bookingsClosed).toBe(true);
        expect(props.offers).toEqual([]);
        expect(event?.offers.price).toBe(workshop.price);
        expect(event?.offers.availability).toBe("https://schema.org/SoldOut");
        expect(event?.offers.priceValidUntil).toBeUndefined();
    });

    it("a closed workshop with seats left is not marked sold out by its seats, only by the switch", async () => {
        vi.mocked(loadClosedWorkshopIds).mockResolvedValue(new Set(["another-workshop"]));
        const { props, event } = await renderPage();
        expect(props.bookingsClosed).toBe(false);
        expect(event?.offers.availability).toBe("https://schema.org/InStock");
    });

    it("inside the booking cut-off the markup agrees with the page: no discount, not available", async () => {
        vi.setSystemTime(BOOKABLE_LATER);
        vi.mocked(loadPublicOffers).mockResolvedValue([auto10]);
        const open = await renderPage();
        expect(open.event?.offers.availability).toBe("https://schema.org/InStock");
        expect(open.event?.offers.price).toBeLessThan(workshop.price);

        vi.setSystemTime(INSIDE_CUTOFF);
        const cutOff = await renderPage();
        expect(cutOff.event?.offers.availability).toBe("https://schema.org/SoldOut");
        expect(cutOff.event?.offers.price).toBe(workshop.price);
        expect(cutOff.event?.offers.priceValidUntil).toBeUndefined();
        // Not closed by the admin: the client decides the cut-off itself, from its own clock.
        expect(cutOff.props.bookingsClosed).toBe(false);
    });

    it("a sold-out workshop advertises no discount in the markup", async () => {
        vi.mocked(loadPublicOffers).mockResolvedValue([auto10]);
        const { event } = await renderPage({ workshop: { seatsRemaining: 0 } });
        expect(event?.offers.availability).toBe("https://schema.org/SoldOut");
        expect(event?.offers.price).toBe(workshop.price);
    });

    it("prices with the platform's service fee, and checkout's default without one", async () => {
        vi.mocked(getCachedPlatformSettings).mockResolvedValue({ service_fee: 49 });
        expect((await renderPage()).props.serviceFee).toBe(49);
        vi.mocked(getCachedPlatformSettings).mockResolvedValue({});
        expect((await renderPage()).props.serviceFee).toBe(99);
        vi.mocked(getCachedPlatformSettings).mockRejectedValue(new Error("down"));
        expect((await renderPage()).props.serviceFee).toBe(99);
    });

    it("has no Event markup for a session that already happened", async () => {
        const { event } = await renderPage({ workshop: { date: "2026-10-01" } });
        expect(event).toBeUndefined();
    });
});
