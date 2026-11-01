// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Workshop } from "@/lib/data";
import { createChainableSupabase } from "@/test/chainable-supabase";
import {
    WorkshopDataUnavailableError,
    failRenderOnDataError,
    loadHomeWorkshops,
    workshopCardExtras,
} from "@/lib/workshop-page-data";

const state = vi.hoisted(() => ({
    configured: true,
    supabase: null as null | { client: unknown },
}));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("next/cache", () => ({
    unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}));
vi.mock("@/lib/supabase-server", () => ({
    get isSupabaseServiceConfigured() {
        return state.configured;
    },
    createSupabaseServiceClient: () => state.supabase?.client,
}));
vi.mock("@/lib/offers-server", () => ({ loadPublicOffers: vi.fn(async () => []) }));
vi.mock("@/lib/workshop-availability-server", () => ({
    loadClosedWorkshopIds: vi.fn(async () => new Set<string>()),
}));

// 24 Oct 2026, 12:00 IST.
const NOW = Date.parse("2026-10-24T06:30:00.000Z");
const TODAY = "2026-10-24";

function workshopFixture(overrides: Partial<Workshop>): Workshop {
    return {
        id: "workshop-1",
        title: "Workshop",
        description: "",
        category: "Pottery",
        price: 2000,
        location: "",
        city: "Pune",
        duration: "2 hours",
        date: "2026-11-20",
        time: "10:00",
        maxSeats: 10,
        seatsRemaining: 5,
        coverImage: "/images/cover.jpg",
        galleryImages: [],
        rating: 0,
        reviewCount: 0,
        hostName: "",
        hostAvatar: "",
        hostBio: "",
        whatYouLearn: [],
        materialsProvided: [],
        ...overrides,
    };
}

const earlyBird: Partial<Workshop> = {
    earlyBirdEnabled: true,
    earlyBirdDiscountType: "percentage",
    earlyBirdDiscountValue: 10,
    earlyBirdDaysAfterListing: 7,
    createdAt: "2026-10-20T00:00:00.000Z",
};

const failed = { data: null, error: { message: "canceling statement due to statement timeout" } };
const empty = { data: [], error: null };

beforeEach(() => {
    state.configured = true;
    state.supabase = null;
});

afterEach(() => {
    vi.unstubAllEnvs();
});

describe("loadHomeWorkshops", () => {
    it("retries once after a failed read and returns the second answer", async () => {
        const supabase = createChainableSupabase({ workshops: [failed, empty, empty, empty] });
        state.supabase = supabase;

        await expect(loadHomeWorkshops()).resolves.toEqual({ data: [], source: "supabase" });
        // Two queries (upcoming and past) per attempt.
        expect(supabase.tables()).toEqual(["workshops", "workshops", "workshops", "workshops"]);
    });

    it("gives up after the retry and reports the error source", async () => {
        const supabase = createChainableSupabase({
            workshops: [failed, empty, empty, failed, empty, empty],
        });
        state.supabase = supabase;

        await expect(loadHomeWorkshops()).resolves.toEqual({ data: [], source: "error" });
        expect(supabase.tables()).toHaveLength(4);
    });

    it("does not retry a good read", async () => {
        const supabase = createChainableSupabase({ workshops: [empty, empty] });
        state.supabase = supabase;

        await expect(loadHomeWorkshops()).resolves.toEqual({ data: [], source: "supabase" });
        expect(supabase.tables()).toHaveLength(2);
    });
});

describe("failRenderOnDataError", () => {
    it("throws at runtime when the data source failed, so the last good page stays", () => {
        expect(() => failRenderOnDataError("error", "/")).toThrow(WorkshopDataUnavailableError);
    });

    it("never throws for a good read", () => {
        expect(() => failRenderOnDataError("supabase", "/")).not.toThrow();
    });

    it("does not throw while next build prerenders", () => {
        vi.stubEnv("NEXT_PHASE", "phase-production-build");
        expect(() => failRenderOnDataError("error", "/")).not.toThrow();
    });

    it("does not throw without a database configured (local development)", () => {
        state.configured = false;
        expect(() => failRenderOnDataError("error", "/")).not.toThrow();
    });

    it("does not throw under next dev, where there is no last good page to keep", () => {
        vi.stubEnv("NODE_ENV", "development");
        expect(() => failRenderOnDataError("error", "/")).not.toThrow();
    });
});

describe("workshopCardExtras", () => {
    it("prices an active Early Bird for one guest", () => {
        const workshop = workshopFixture({ id: "eb", ...earlyBird });
        const { cardOffers, closedWorkshopIds } = workshopCardExtras(
            [workshop],
            { offers: [], closedWorkshopIds: new Set() },
            TODAY,
            NOW
        );
        expect(closedWorkshopIds).toEqual([]);
        expect(cardOffers.eb).toMatchObject({ listPrice: 2000, offerPrice: 1800, savings: 200 });
    });

    it("gives no offer to a closed workshop and lists it as closed", () => {
        const workshop = workshopFixture({ id: "closed-1", ...earlyBird });
        const { cardOffers, closedWorkshopIds } = workshopCardExtras(
            [workshop, workshop],
            { offers: [], closedWorkshopIds: new Set(["closed-1"]) },
            TODAY,
            NOW
        );
        expect(cardOffers).toEqual({});
        expect(closedWorkshopIds).toEqual(["closed-1"]);
    });

    it("gives no offer to a past workshop or one without a discount", () => {
        const past = workshopFixture({ id: "past", date: "2026-10-01", ...earlyBird });
        const plain = workshopFixture({ id: "plain" });
        const { cardOffers } = workshopCardExtras(
            [past, plain],
            { offers: [], closedWorkshopIds: new Set() },
            TODAY,
            NOW
        );
        expect(cardOffers).toEqual({});
    });
});
