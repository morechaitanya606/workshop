import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PublicOffer } from "@/lib/offers";
import { loadPublicOffersResult } from "@/lib/offers-server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { loadClosedWorkshopIds } from "@/lib/workshop-availability-server";

import { GET } from "./route";

vi.mock("@/lib/offers-server", () => ({
    loadPublicOffersResult: vi.fn(),
    OFFERS_RENDER_DEADLINE_MS: 3000,
}));

vi.mock("@/lib/rate-limit", () => ({
    enforceRateLimit: vi.fn(),
}));

vi.mock("@/lib/workshop-availability-server", () => ({
    loadClosedWorkshopIds: vi.fn(),
}));

const HOUR = 60 * 60 * 1000;

function offer(overrides: Partial<PublicOffer> = {}): PublicOffer {
    return {
        id: "11111111-1111-4111-8111-111111111111",
        kind: "auto",
        label: "10% off",
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
        ...overrides,
    };
}

function request(query = "") {
    return new NextRequest(`http://localhost/api/offers${query}`);
}

async function read(response: Response) {
    return (await response.json()) as { offers: PublicOffer[] };
}

describe("GET /api/offers", () => {
    beforeEach(() => {
        vi.mocked(enforceRateLimit).mockResolvedValue({ ok: true } as never);
        vi.mocked(loadPublicOffersResult).mockResolvedValue({ offers: [], ok: true });
        vi.mocked(loadClosedWorkshopIds).mockResolvedValue(new Set());
    });

    it("returns live offers with CDN cache headers", async () => {
        const live = offer({
            id: "live",
            availableUntil: new Date(Date.now() + HOUR).toISOString(),
        });
        vi.mocked(loadPublicOffersResult).mockResolvedValue({
            offers: [
                live,
                offer({ id: "ended", availableUntil: new Date(Date.now() - 1000).toISOString() }),
                offer({ id: "later", startsAt: new Date(Date.now() + HOUR).toISOString() }),
            ],
            ok: true,
        });

        const response = await GET(request());

        expect(response.status).toBe(200);
        expect(response.headers.get("Cache-Control")).toBe(
            "public, s-maxage=60, stale-while-revalidate=120"
        );
        expect(await read(response)).toEqual({ offers: [live] });
        expect(enforceRateLimit).toHaveBeenCalledWith(
            expect.anything(),
            "publicRead",
            "api-offers"
        );
    });

    it("drops offers limited to other workshops but keeps category-limited ones", async () => {
        vi.mocked(loadPublicOffersResult).mockResolvedValue({
            offers: [
                offer({ id: "all" }),
                offer({ id: "mine", workshopIds: ["w1", "w3"] }),
                offer({ id: "other", workshopIds: ["w2"] }),
                offer({ id: "art", categories: ["Art"] }),
            ],
            ok: true,
        });

        const { offers } = await read(await GET(request("?workshopId=%20w1%20")));

        expect(offers.map((item) => item.id)).toEqual(["all", "mine", "art"]);
    });

    it("gives a workshop whose bookings are closed no offers", async () => {
        vi.mocked(loadPublicOffersResult).mockResolvedValue({
            offers: [offer({ id: "all" }), offer({ id: "mine", workshopIds: ["w1"] })],
            ok: true,
        });
        vi.mocked(loadClosedWorkshopIds).mockResolvedValue(new Set(["w1"]));

        expect(await read(await GET(request("?workshopId=w1")))).toEqual({ offers: [] });
        const open = await read(await GET(request("?workshopId=w2")));
        expect(open.offers.map((item) => item.id)).toEqual(["all"]);
        // Without a workshop the closed list is not even read.
        vi.mocked(loadClosedWorkshopIds).mockClear();
        expect((await read(await GET(request()))).offers).toHaveLength(2);
        expect(loadClosedWorkshopIds).not.toHaveBeenCalled();
    });

    it("treats a failed or slow closed-list read as open", async () => {
        vi.mocked(loadPublicOffersResult).mockResolvedValue({ offers: [offer()], ok: true });
        vi.mocked(loadClosedWorkshopIds).mockRejectedValue(new Error("down"));
        expect((await read(await GET(request("?workshopId=w1")))).offers).toHaveLength(1);

        vi.useFakeTimers();
        try {
            vi.mocked(loadClosedWorkshopIds).mockReturnValue(new Promise(() => {}));
            const pending = GET(request("?workshopId=w1"));
            await vi.advanceTimersByTimeAsync(3000);
            expect((await read(await pending)).offers).toHaveLength(1);
        } finally {
            vi.useRealTimers();
        }
    });

    it("sends only public fields, and a code only for listed offers", async () => {
        vi.mocked(loadPublicOffersResult).mockResolvedValue({
            offers: [
                {
                    ...offer({ kind: "community", code: "WHATSAPP15" }),
                    max_uses: 10,
                    used_count: 3,
                } as PublicOffer,
                offer({ id: "listed", kind: "listed", code: "WEEKEND" }),
                offer({ id: "eb", kind: "early_bird" }),
            ],
            ok: true,
        });

        const response = await GET(request());
        const text = await response.clone().text();
        const { offers } = await read(response);

        expect(text).not.toContain("WHATSAPP15");
        expect(text).not.toContain("max_uses");
        expect(text).not.toContain("used_count");
        expect(offers.map((item) => [item.kind, item.code])).toEqual([
            ["community", null],
            ["listed", "WEEKEND"],
        ]);
    });

    it("does not let the CDN cache an empty list from a failed read", async () => {
        vi.mocked(loadPublicOffersResult).mockResolvedValue({ offers: [], ok: false });

        const response = await GET(request());

        expect(response.status).toBe(200);
        expect(response.headers.get("Cache-Control")).toBe("no-store");
        expect(await read(response)).toEqual({ offers: [] });
    });

    it("never answers 500, even if loading throws", async () => {
        vi.mocked(loadPublicOffersResult).mockRejectedValue(new Error("boom"));

        const response = await GET(request());

        expect(response.status).toBe(200);
        expect(response.headers.get("Cache-Control")).toBe("no-store");
        expect(await read(response)).toEqual({ offers: [] });
    });

    it("answers [] for an oversized workshop id without loading anything", async () => {
        const response = await GET(request(`?workshopId=${"x".repeat(121)}`));

        expect(await read(response)).toEqual({ offers: [] });
        expect(loadPublicOffersResult).not.toHaveBeenCalled();
    });

    it("passes the rate limiter's response through", async () => {
        vi.mocked(enforceRateLimit).mockResolvedValue({
            ok: false,
            response: NextResponse.json({ error: "Too many requests." }, { status: 429 }),
        } as never);

        const response = await GET(request());

        expect(response.status).toBe(429);
        expect(loadPublicOffersResult).not.toHaveBeenCalled();
    });
});
