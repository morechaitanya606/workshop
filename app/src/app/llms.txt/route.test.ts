import { describe, expect, it, vi } from "vitest";
import type { Workshop } from "@/lib/data";

const SITE_URL = "https://www.onlyworkshops.com";

const mocks = vi.hoisted(() => ({
    loadCityWorkshops: vi.fn(),
    loadCardPricing: vi.fn(),
    workshopCardExtras: vi.fn(),
}));

vi.mock("@/lib/workshop-page-data", () => ({
    loadCityWorkshops: mocks.loadCityWorkshops,
    loadCardPricing: mocks.loadCardPricing,
    workshopCardExtras: mocks.workshopCardExtras,
}));
vi.mock("@/lib/env", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/env")>()),
    getAbsoluteUrl: (path = "/") => `${SITE_URL}${path}`,
}));

import { GET, revalidate } from "./route";

function workshop(overrides: Partial<Workshop>) {
    return {
        id: "workshop-1",
        title: "Workshop",
        category: "",
        date: "2026-10-24",
        time: "10:00:00",
        price: 1999,
        galleryImages: [],
        ...overrides,
    } as unknown as Workshop;
}

describe("GET /llms.txt", () => {
    it("asks for regeneration at least hourly, like the sitemap", () => {
        expect(revalidate).toBe(3600);
    });

    it("answers with plain-text Markdown that lists live activity pages and sessions", async () => {
        mocks.loadCityWorkshops.mockResolvedValue({
            source: "supabase",
            upcoming: [workshop({ id: "wheel-1", title: "Pottery Wheel Workshop" })],
            past: [workshop({ id: "terrarium-1", title: "Terrarium Making", date: "2026-01-10" })],
        });

        const response = await GET();
        const text = await response.text();

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
        expect(text.startsWith("# Only Workshops\n")).toBe(true);
        expect(text).toContain(`(${SITE_URL}/workshops/pune/pottery)`);
        expect(text).toContain(`- [Pottery Wheel Workshop](${SITE_URL}/workshop/wheel-1)`);
        // One past session and no photos is too thin to index, so the hub and this file skip it.
        expect(text).not.toContain("/workshops/pune/terrarium");
    });

    it("prices each session as the cards do, and says when bookings are closed", async () => {
        const wheel = workshop({ id: "wheel-1", title: "Pottery Wheel Workshop" });
        const glaze = workshop({ id: "glaze-1", title: "Glazing Evening" });
        const pricing = { offers: [], closedWorkshopIds: new Set(["glaze-1"]) };
        mocks.loadCityWorkshops.mockResolvedValue({
            source: "supabase",
            upcoming: [wheel, glaze],
            past: [],
        });
        mocks.loadCardPricing.mockResolvedValue(pricing);
        mocks.workshopCardExtras.mockReturnValue({
            cardOffers: {
                "wheel-1": {
                    listPrice: 1999,
                    offerPrice: 1799,
                    savings: 200,
                    label: "Early bird 10% off",
                    labels: ["Early bird 10% off"],
                    discountText: "10% off",
                    endsAt: "2026-10-31T00:00:00.000Z",
                    availableUntil: "2026-10-31T00:00:00.000Z",
                    couponId: null,
                    perBooking: false,
                },
            },
            closedWorkshopIds: ["glaze-1"],
        });

        const text = await (await GET()).text();

        expect(mocks.workshopCardExtras).toHaveBeenCalledWith(
            [wheel, glaze],
            pricing,
            expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)
        );
        expect(text).toContain(
            "₹1,799 per person incl. GST until Sat, 31 Oct 2026, 5:30 am (Early bird 10% off; regular ₹1,999)."
        );
        expect(text).toContain("₹1,999 per person incl. GST. Bookings closed.");
    });

    it("falls back to list prices when offers cannot be read", async () => {
        mocks.loadCityWorkshops.mockResolvedValue({
            source: "supabase",
            upcoming: [workshop({ id: "wheel-1", title: "Pottery Wheel Workshop" })],
            past: [],
        });
        mocks.loadCardPricing.mockRejectedValue(new Error("down"));

        const text = await (await GET()).text();

        expect(text).toContain("₹1,999 per person incl. GST.");
        expect(text).not.toContain("regular");
        expect(mocks.workshopCardExtras).not.toHaveBeenCalled();
    });

    it.each([
        ["the read fails", () => mocks.loadCityWorkshops.mockRejectedValue(new Error("down"))],
        [
            "the read reports an error",
            () =>
                mocks.loadCityWorkshops.mockResolvedValue({
                    source: "error",
                    upcoming: [],
                    past: [],
                }),
        ],
    ])("still returns the static sections when %s", async (_case, arrange) => {
        arrange();

        const response = await GET();
        const text = await response.text();

        expect(response.status).toBe(200);
        expect(text).toContain("## Key pages");
        expect(text).toContain(`(${SITE_URL}/workshops/pune)`);
        expect(text).not.toContain("## Upcoming workshops");
        expect(text).not.toContain("## Workshop activities");
    });
});
