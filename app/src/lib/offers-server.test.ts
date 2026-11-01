import * as Sentry from "@sentry/nextjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildPublicOffers, CAPPED_OFFER_RESERVE, cardOfferFor } from "@/lib/offers";
import { computeQuote, pickBestCoupon, type PricingWorkshop } from "@/lib/pricing";
import { createChainableSupabase, type QueuedResult } from "@/test/chainable-supabase";

import {
    autoOfferCoupons,
    findLabelsRevealingCodes,
    loadOfferCoupons,
    loadPublicOffers,
    loadPublicOffersResult,
    OFFERS_RENDER_DEADLINE_MS,
    OFFERS_REQUEST_TIMEOUT_MS,
    OFFERS_TAG,
} from "./offers-server";

const state = vi.hoisted(() => ({
    configured: true,
    cacheOptions: [] as unknown[],
    clientOptions: [] as unknown[],
    createClient: (() => {
        throw new Error("not set");
    }) as () => unknown,
}));

vi.mock("next/cache", () => ({
    // Pass-through: these tests cover the read itself, and what it hands to unstable_cache.
    unstable_cache: (fn: () => unknown, _keys: unknown, options: unknown) => {
        state.cacheOptions.push(options);
        return fn;
    },
}));

vi.mock("@/lib/supabase-server", () => ({
    get isSupabaseServiceConfigured() {
        return state.configured;
    },
    createSupabaseServiceClient: (options: unknown) => {
        state.clientOptions.push(options);
        return state.createClient();
    },
}));

vi.mock("@/lib/cached-reads", () => ({
    OFFERS_TAG: "public-offers",
    PLATFORM_SETTINGS_TAG: "platform-settings",
}));

vi.mock("@sentry/nextjs", () => ({
    captureException: vi.fn(),
}));

const ID_AUTO = "11111111-1111-4111-8111-111111111111";
const ID_LISTED = "22222222-2222-4222-8222-222222222222";
const ID_COMMUNITY = "33333333-3333-4333-8333-333333333333";
const ID_HIDDEN = "44444444-4444-4444-8444-444444444444";

const SETTING = {
    [ID_AUTO]: { visibility: "auto", label: "Limited-time offer", show_end_date: true },
    [ID_LISTED]: { visibility: "listed" },
    [ID_COMMUNITY]: { visibility: "community", min_guests: 2 },
    [ID_HIDDEN]: { visibility: "hidden", min_guests: 3 },
};

function couponRow(id: string, code: string, overrides: Record<string, unknown> = {}) {
    return {
        id,
        code,
        discount_type: "percentage",
        discount_value: 10,
        min_order_amount: 0,
        max_uses: 50,
        used_count: 2,
        valid_from: "2026-01-01T00:00:00+00:00",
        valid_until: null,
        applicable_workshop_ids: null,
        applicable_categories: null,
        is_active: true,
        ...overrides,
    };
}

const ROWS = [
    couponRow(ID_AUTO, "AUTO10", { valid_until: "2099-01-01T00:30:00+00:00" }),
    couponRow(ID_LISTED, "LISTED200", { discount_type: "fixed", discount_value: 200 }),
    couponRow(ID_COMMUNITY, "WHATSAPP15", { discount_value: 15 }),
];

function useDb(results: Record<string, QueuedResult[]>) {
    const db = createChainableSupabase(results);
    state.createClient = () => db.client;
    return db;
}

describe("loadPublicOffers", () => {
    beforeEach(() => {
        state.configured = true;
    });

    it("caches for a minute under the offers and platform-settings tags", () => {
        expect(OFFERS_TAG).toBe("public-offers");
        expect(state.cacheOptions).toContainEqual({
            tags: ["public-offers", "platform-settings"],
            revalidate: 60,
        });
    });

    it("builds public offers from the setting and the visible coupons only", async () => {
        const db = useDb({
            platform_settings: [{ data: { setting_value: SETTING }, error: null }],
            coupons: [{ data: ROWS, error: null }],
        });

        const result = await loadPublicOffersResult();

        expect(result.ok).toBe(true);
        expect(result.offers.map((offer) => [offer.kind, offer.label, offer.code])).toEqual([
            ["auto", "Limited-time offer", null],
            ["listed", "₹200 off per booking", "LISTED200"],
            ["community", "Community price drop", null],
        ]);
        expect(result.offers[0].endsAt).toBe("2099-01-01T00:00:00.000Z");

        const serialized = JSON.stringify(result.offers);
        for (const secret of ["AUTO10", "WHATSAPP15", "max_uses", "used_count", "maxUses"]) {
            expect(serialized).not.toContain(secret);
        }

        expect(db.callsFor("platform_settings")).toContainEqual({
            op: "eq",
            args: ["setting_key", "coupon_offers"],
        });
        const couponCalls = db.callsFor("coupons");
        expect(couponCalls).toContainEqual({ op: "select", args: ["*"] });
        expect(couponCalls).toContainEqual({ op: "eq", args: ["is_active", true] });
        // Hidden coupons are never even read.
        expect(couponCalls).toContainEqual({
            op: "in",
            args: ["id", [ID_AUTO, ID_LISTED, ID_COMMUNITY]],
        });
    });

    it("returns [] without reading coupons when the setting is missing (today's behaviour)", async () => {
        const db = useDb({ platform_settings: [{ data: null, error: null }] });

        expect(await loadPublicOffersResult()).toEqual({ offers: [], ok: true });
        expect(db.tables()).toEqual(["platform_settings"]);
    });

    it("treats a malformed setting as no offers", async () => {
        const db = useDb({
            platform_settings: [{ data: { setting_value: "{oops" }, error: null }],
        });

        expect(await loadPublicOffers()).toEqual([]);
        expect(db.tables()).toEqual(["platform_settings"]);
    });

    it("reads with a tight per-request timeout", async () => {
        useDb({ platform_settings: [{ data: null, error: null }] });
        state.clientOptions.length = 0;

        await loadPublicOffersResult();

        expect(state.clientOptions).toEqual([{ requestTimeoutMs: OFFERS_REQUEST_TIMEOUT_MS }]);
        expect(OFFERS_REQUEST_TIMEOUT_MS).toBeLessThan(OFFERS_RENDER_DEADLINE_MS);
    });

    it("does not retry: a failed setting read is reported as not ok at once", async () => {
        const db = useDb({
            platform_settings: [
                { data: null, error: { message: "timeout" } },
                { data: { setting_value: SETTING }, error: null },
            ],
        });

        expect(await loadPublicOffersResult()).toEqual({ offers: [], ok: false });
        expect(db.tables()).toEqual(["platform_settings"]);
        expect(Sentry.captureException).toHaveBeenCalled();
    });

    it("reports a failed coupons read as not ok", async () => {
        const db = useDb({
            platform_settings: [{ data: { setting_value: SETTING }, error: null }],
            coupons: [{ data: null, error: { message: "boom" } }],
        });

        expect(await loadPublicOffersResult()).toEqual({ offers: [], ok: false });
        expect(db.tables()).toEqual(["platform_settings", "coupons"]);
    });

    describe("when the database hangs", () => {
        afterEach(() => {
            vi.useRealTimers();
        });

        it("gives up at the render deadline with no offers", async () => {
            vi.useFakeTimers();
            const hanging = {
                from() {
                    const builder: unknown = new Proxy(
                        {},
                        {
                            get(_target, prop: string) {
                                if (prop === "then") return undefined;
                                return () =>
                                    prop === "maybeSingle" ? new Promise(() => {}) : builder;
                            },
                        }
                    );
                    return builder;
                },
            };
            state.createClient = () => hanging;

            let settled = false;
            const pending = loadPublicOffersResult().then((result) => {
                settled = true;
                return result;
            });

            await vi.advanceTimersByTimeAsync(OFFERS_RENDER_DEADLINE_MS - 1);
            expect(settled).toBe(false);
            await vi.advanceTimersByTimeAsync(1);
            expect(await pending).toEqual({ offers: [], ok: false });
        });
    });

    it("hands every caller its own empty list on failure", async () => {
        state.createClient = () => {
            throw new Error("down");
        };

        const first = await loadPublicOffersResult();
        first.offers.push({ id: "leaked" } as never);

        expect((await loadPublicOffersResult()).offers).toEqual([]);
        expect(await loadPublicOffers()).toEqual([]);
    });

    it("never throws, even when the client cannot be created", async () => {
        state.createClient = () => {
            throw new Error("Missing environment variable(s)");
        };

        expect(await loadPublicOffers()).toEqual([]);
        expect(await loadPublicOffersResult()).toEqual({ offers: [], ok: false });
    });

    it("returns [] when the service role is not configured", async () => {
        state.configured = false;
        state.createClient = () => {
            throw new Error("should not be called");
        };

        expect(await loadPublicOffersResult()).toEqual({ offers: [], ok: true });
    });
});

describe("loadOfferCoupons", () => {
    it("returns every active coupon with display settings, seat minimum merged", async () => {
        const db = createChainableSupabase({
            platform_settings: [{ data: { setting_value: SETTING }, error: null }],
            coupons: [
                {
                    data: [...ROWS, couponRow(ID_HIDDEN, "SECRET"), { id: "broken" }],
                    error: null,
                },
            ],
        });

        const result = await loadOfferCoupons(db.client as never);

        expect(result.ok).toBe(true);
        expect(
            result.coupons.map(({ coupon, display }) => [
                coupon.code,
                display.visibility,
                coupon.minGuests,
                coupon.usedCount,
            ])
        ).toEqual([
            ["AUTO10", "auto", null, 2],
            ["LISTED200", "listed", null, 2],
            ["WHATSAPP15", "community", 2, 2],
            ["SECRET", "hidden", 3, 2],
        ]);
        expect(result.setting[ID_COMMUNITY]).toEqual({ visibility: "community", minGuests: 2 });
        expect(db.callsFor("coupons")).toContainEqual({
            op: "in",
            args: ["id", [ID_AUTO, ID_LISTED, ID_COMMUNITY, ID_HIDDEN]],
        });
    });

    it("stops auto-applying an offer near its use cap, as the public list does", async () => {
        const nearCap = couponRow(ID_AUTO, "AUTO10", { max_uses: 5, used_count: 2 });
        const usedUp = couponRow(ID_LISTED, "LISTED200", { max_uses: 5, used_count: 5 });
        const uncapped = couponRow(ID_COMMUNITY, "WHATSAPP15", { max_uses: null });
        const db = createChainableSupabase({
            platform_settings: [
                {
                    data: {
                        setting_value: {
                            [ID_AUTO]: { visibility: "auto" },
                            [ID_LISTED]: { visibility: "auto" },
                            [ID_COMMUNITY]: { visibility: "auto" },
                        },
                    },
                    error: null,
                },
            ],
            coupons: [{ data: [nearCap, usedUp, uncapped], error: null }],
        });

        const result = await loadOfferCoupons(db.client as never);

        expect(
            result.coupons.map(({ coupon, display }) => [coupon.code, display.visibility])
        ).toEqual([
            ["AUTO10", "hidden"],
            ["LISTED200", "hidden"],
            ["WHATSAPP15", "auto"],
        ]);
        expect(autoOfferCoupons(result).map((coupon) => coupon.code)).toEqual(["WHATSAPP15"]);
        // Still an advertised coupon: a typed code stops at the advertised end.
        expect(result.coupons[0].coupon.advertised).toBe(true);
    });

    it("skips the coupons read when no offers are configured", async () => {
        const db = createChainableSupabase({ platform_settings: [{ data: null, error: null }] });

        expect(await loadOfferCoupons(db.client as never)).toEqual({
            ok: true,
            coupons: [],
            setting: {},
        });
        expect(db.tables()).toEqual(["platform_settings"]);
    });

    it("reports failures as not ok without throwing, keeping the setting it read", async () => {
        const settingFails = createChainableSupabase({
            platform_settings: [{ data: null, error: { message: "timeout" } }],
        });
        expect(await loadOfferCoupons(settingFails.client as never)).toEqual({
            ok: false,
            coupons: [],
            setting: {},
        });

        const couponsFail = createChainableSupabase({
            platform_settings: [{ data: { setting_value: SETTING }, error: null }],
            coupons: [{ data: null, error: { message: "timeout" } }],
        });
        const result = await loadOfferCoupons(couponsFail.client as never);
        expect(result.ok).toBe(false);
        expect(result.coupons).toEqual([]);
        expect(Object.keys(result.setting)).toHaveLength(4);

        const throwing = {
            from() {
                throw new Error("network");
            },
        };
        expect((await loadOfferCoupons(throwing as never)).ok).toBe(false);
    });

    describe("noAutoOffers (a failed read that provably hides no automatic offer)", () => {
        it("is set when the setting was read, lists no automatic offer, and the coupons read failed", async () => {
            const db = createChainableSupabase({
                platform_settings: [
                    {
                        data: {
                            setting_value: {
                                [ID_LISTED]: { visibility: "listed" },
                                [ID_COMMUNITY]: { visibility: "community", min_guests: 2 },
                                [ID_HIDDEN]: { visibility: "hidden" },
                            },
                        },
                        error: null,
                    },
                ],
                coupons: [{ data: null, error: { message: "timeout" } }],
            });

            const result = await loadOfferCoupons(db.client as never);

            expect(result.ok).toBe(false);
            expect(result.noAutoOffers).toBe(true);
            // The setting is still handed over, so a typed code keeps its offer rules.
            expect(result.setting[ID_COMMUNITY]).toEqual({
                visibility: "community",
                minGuests: 2,
            });
        });

        it("is not set when the setting lists an automatic offer", async () => {
            const db = createChainableSupabase({
                platform_settings: [
                    {
                        data: {
                            setting_value: {
                                [ID_LISTED]: { visibility: "listed" },
                                [ID_AUTO]: { visibility: "auto" },
                            },
                        },
                        error: null,
                    },
                ],
                coupons: [{ data: null, error: { message: "timeout" } }],
            });

            const result = await loadOfferCoupons(db.client as never);

            expect(result.ok).toBe(false);
            expect(result.noAutoOffers).toBeUndefined();
        });

        it("is not set when the setting itself could not be read", async () => {
            const db = createChainableSupabase({
                platform_settings: [{ data: null, error: { message: "timeout" } }],
            });

            const result = await loadOfferCoupons(db.client as never);

            expect(result.ok).toBe(false);
            expect(result.noAutoOffers).toBeUndefined();
        });

        it("is not set when the client throws before anything was read", async () => {
            const throwing = {
                from() {
                    throw new Error("network");
                },
            };

            const result = await loadOfferCoupons(throwing as never);

            expect(result.ok).toBe(false);
            expect(result.noAutoOffers).toBeUndefined();
        });

        it("is never part of a successful read", async () => {
            const db = createChainableSupabase({
                platform_settings: [{ data: { setting_value: SETTING }, error: null }],
                coupons: [{ data: ROWS, error: null }],
            });

            expect((await loadOfferCoupons(db.client as never)).noAutoOffers).toBeUndefined();
        });
    });
});

describe("findLabelsRevealingCodes", () => {
    it("answers safe without reading coupons when no label needs checking", async () => {
        const db = createChainableSupabase({});
        const onlyListed = {
            [ID_LISTED]: { visibility: "listed", label: "Use LISTED200" },
            [ID_AUTO]: { visibility: "auto" },
        };

        expect(await findLabelsRevealingCodes(onlyListed, db.client as never)).toEqual({
            ok: true,
            couponIds: [],
        });
        expect(await findLabelsRevealingCodes({}, db.client as never)).toEqual({
            ok: true,
            couponIds: [],
        });
        expect(db.tables()).toEqual([]);
    });

    it("answers safe when no label spells out its own coupon's code", async () => {
        const db = createChainableSupabase({
            coupons: [
                {
                    data: [
                        { id: ID_AUTO, code: "AUTO10" },
                        { id: ID_COMMUNITY, code: "WHATSAPP15" },
                    ],
                    error: null,
                },
            ],
        });
        const setting = {
            [ID_AUTO]: { visibility: "auto", label: "Limited-time offer" },
            [ID_COMMUNITY]: { visibility: "community", label: "Community price drop" },
        };

        expect(await findLabelsRevealingCodes(setting, db.client as never)).toEqual({
            ok: true,
            couponIds: [],
        });
        const calls = db.callsFor("coupons");
        // Only the id and code of the labelled coupons, never whole rows.
        expect(calls).toContainEqual({ op: "select", args: ["id, code"] });
        expect(calls).toContainEqual({ op: "in", args: ["id", [ID_AUTO, ID_COMMUNITY]] });
    });

    it("names every non-listed coupon whose label reveals its code", async () => {
        const db = createChainableSupabase({
            coupons: [
                {
                    data: [
                        { id: ID_AUTO, code: "AUTO10" },
                        { id: ID_COMMUNITY, code: "WHATSAPP15" },
                        { id: ID_HIDDEN, code: "SECRET" },
                    ],
                    error: null,
                },
            ],
        });
        const setting = {
            [ID_AUTO.toUpperCase()]: { visibility: "auto", label: "Limited-time offer" },
            [ID_COMMUNITY]: { visibility: "community", label: "Use whatsapp-15 today" },
            [ID_HIDDEN]: { visibility: "hidden", label: "GET-SECRET now" },
            // Listed: the code is shown anyway, so it is not even read.
            [ID_LISTED]: { visibility: "listed", label: "Use LISTED200" },
        };

        expect(await findLabelsRevealingCodes(setting, db.client as never)).toEqual({
            ok: true,
            couponIds: [ID_COMMUNITY, ID_HIDDEN],
        });
        expect(db.callsFor("coupons")).toContainEqual({
            op: "in",
            args: ["id", [ID_AUTO, ID_COMMUNITY, ID_HIDDEN]],
        });
    });

    it("fails closed when the codes cannot be read", async () => {
        const setting = { [ID_COMMUNITY]: { visibility: "community", label: "Join us" } };

        const failing = createChainableSupabase({
            coupons: [{ data: null, error: { message: "permission denied for table coupons" } }],
        });
        const result = await findLabelsRevealingCodes(setting, failing.client as never);
        expect(result).toEqual({ ok: false });
        expect(JSON.stringify(result)).not.toContain("permission");
        expect(Sentry.captureException).toHaveBeenCalled();

        const noRows = createChainableSupabase({ coupons: [{ data: null, error: null }] });
        expect(await findLabelsRevealingCodes(setting, noRows.client as never)).toEqual({
            ok: false,
        });

        const throwing = {
            from() {
                throw new Error("network");
            },
        };
        expect(await findLabelsRevealingCodes(setting, throwing as never)).toEqual({ ok: false });
    });
});

describe("card price = checkout price (parity)", () => {
    // Early Bird 10% until 26 Oct 00:00 UTC: one seat is ₹1,000 list, ₹900 after Early Bird.
    const WORKSHOP: PricingWorkshop = {
        id: "pottery-wheel-1760000000000",
        price: 1000,
        category: "Art",
        createdAt: "2026-10-22T05:00:00Z",
        earlyBirdEnabled: true,
        earlyBirdDiscountType: "percentage",
        earlyBirdDiscountValue: 10,
        earlyBirdDaysAfterListing: 3,
    };
    const id = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`;
    const FLASH = id(1);
    const FIXED = id(2);
    const PERCENT = id(3);
    const MIN_ORDER = id(4);
    const NEAR_CAP = id(5);
    const GROUP = id(6);
    const LISTED = id(7);
    const COMMUNITY = id(8);
    const NO_END = id(9);

    const setting = {
        [FLASH]: { visibility: "auto", label: "Flash sale", show_end_date: true },
        [FIXED]: { visibility: "auto" },
        [PERCENT]: { visibility: "auto", show_end_date: true },
        [MIN_ORDER]: { visibility: "auto", label: "Big booking offer" },
        [NEAR_CAP]: { visibility: "auto" },
        [GROUP]: { visibility: "auto", min_guests: 2 },
        [LISTED]: { visibility: "listed" },
        [COMMUNITY]: { visibility: "community" },
        [NO_END]: { visibility: "auto" },
    };
    const rows = [
        // 12%: ₹108 with Early Bird. Advertised end 09:50, inside the grace until 10:20.
        couponRow(FLASH, "FLASH12", {
            discount_value: 12,
            max_uses: null,
            valid_until: "2026-10-23T10:20:00+00:00",
        }),
        // ₹75 per booking, no end.
        couponRow(FIXED, "AUTO75", { discount_type: "fixed", discount_value: 75, max_uses: null }),
        // 8%: ₹72 with Early Bird, ₹80 without. Advertised end 28 Oct 18:00.
        couponRow(PERCENT, "AUTO8", {
            discount_value: 8,
            max_uses: null,
            valid_until: "2026-10-28T18:30:00+00:00",
        }),
        // ₹100 from ₹901: just above one seat after Early Bird (₹900). Advertised end 27 Oct 00:00.
        couponRow(MIN_ORDER, "BIG100", {
            discount_type: "fixed",
            discount_value: 100,
            min_order_amount: 901,
            max_uses: null,
            valid_until: "2026-10-27T00:30:00+00:00",
        }),
        // 20% but only CAPPED_OFFER_RESERVE uses left: never auto-applied on either side.
        couponRow(NEAR_CAP, "CAP20", {
            discount_value: 20,
            max_uses: 10,
            used_count: 10 - CAPPED_OFFER_RESERVE,
        }),
        // Bigger discounts a single guest never gets without a code or more seats.
        couponRow(GROUP, "GROUP25", { discount_value: 25, max_uses: null }),
        couponRow(LISTED, "LIST30", { discount_value: 30, max_uses: null }),
        couponRow(COMMUNITY, "WHATSAPP40", { discount_value: 40, max_uses: null }),
        // timestamptz 'infinity' arrives as the text "infinity": checkout cannot read it and
        // refuses the coupon, so no card may show it.
        couponRow(NO_END, "FOREVER50", {
            discount_value: 50,
            max_uses: null,
            valid_until: "infinity",
        }),
    ];

    it.each([
        ["2026-10-23T09:00:00.000Z", "the flash sale", FLASH, 792],
        ["2026-10-23T09:50:00.000Z", "the flash sale at its advertised end", FLASH, 792],
        ["2026-10-23T09:50:00.001Z", "the fixed offer (flash sale in its grace)", FIXED, 825],
        ["2026-10-23T10:20:00.001Z", "the fixed offer (flash sale over)", FIXED, 825],
        ["2026-10-25T23:59:59.999Z", "the fixed offer (last Early Bird ms)", FIXED, 825],
        ["2026-10-26T00:00:00.000Z", "the minimum-order offer (Early Bird over)", MIN_ORDER, 900],
        ["2026-10-27T00:00:00.000Z", "the minimum-order offer at its end", MIN_ORDER, 900],
        ["2026-10-27T00:00:00.001Z", "the percentage offer", PERCENT, 920],
        ["2026-10-28T18:00:00.001Z", "the fixed offer (percentage over)", FIXED, 925],
    ])("at %s both apply %s", async (iso, _name, couponId, price) => {
        const now = new Date(iso).getTime();

        // Checkout: fresh rows, the auto candidates, the best for the hold's guests, at "order".
        const db = createChainableSupabase({
            platform_settings: [{ data: { setting_value: setting }, error: null }],
            coupons: [{ data: rows, error: null }],
        });
        const offerCoupons = await loadOfferCoupons(db.client as never);
        expect(offerCoupons.ok).toBe(true);
        const best = pickBestCoupon(autoOfferCoupons(offerCoupons), {
            workshop: WORKSHOP,
            guests: 1,
            now,
            purpose: "order",
        });
        const quote = (purpose: "order" | "confirm") =>
            computeQuote({
                workshop: WORKSHOP,
                guests: 1,
                coupon: best?.coupon ?? null,
                serviceFee: 99,
                now,
                purpose,
            });
        const order = quote("order");
        expect(order).toMatchObject({ couponId, subtotal: price, total: price + 99 });
        // The RPC's rules charge the same amount for that order.
        expect(quote("confirm").subtotal).toBe(price);

        // The card, from the public offer list built now or cached up to a minute ago.
        for (const builtAt of [now, now - 59_000]) {
            const card = cardOfferFor(WORKSHOP, buildPublicOffers(rows, setting, builtAt), now);
            expect(card).toMatchObject({
                listPrice: order.listSubtotal,
                offerPrice: order.subtotal,
                savings: order.savings,
                couponId: order.couponId,
            });
        }
    });
});
