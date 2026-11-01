import { describe, expect, it } from "vitest";

import {
    buildPublicOffers,
    cardOfferFor,
    COUPON_OFFERS_MAX_ENTRIES,
    CAPPED_OFFER_RESERVE,
    describeDiscount,
    earlyBirdOfferFor,
    effectiveOfferDisplay,
    offerDetailsText,
    offerDiscountText,
    OFFER_ADMIN_HINTS,
    offerLabelConflicts,
    offerLabelRevealsCode,
    offerLabelsRevealingCodes,
    offerLabelsToCheckForCodes,
    offersForWorkshop,
    offerTerms,
    offerTermsText,
    parseCouponOffersSetting,
    pricingCouponFromOffer,
    pricingCouponFromRow,
    publicOfferFromCoupon,
    serializeCouponOffersSetting,
    validateCouponOffersSetting,
    type PublicOffer,
} from "@/lib/offers";
import { computeQuote, couponRejection, type PricingWorkshop } from "@/lib/pricing";

const NOW = new Date("2026-10-23T10:00:00.000Z");
const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";
const ID_C = "33333333-3333-4333-8333-333333333333";
const ID_D = "44444444-4444-4444-8444-444444444444";

const workshop: PricingWorkshop = {
    id: "w1",
    price: 1000,
    category: "Art",
    createdAt: "2026-10-22T05:00:00Z",
    earlyBirdEnabled: false,
};

const earlyBirdWorkshop: PricingWorkshop = {
    ...workshop,
    earlyBirdEnabled: true,
    earlyBirdDiscountType: "percentage",
    earlyBirdDiscountValue: 10,
    earlyBirdDaysAfterListing: 3,
};

function row(overrides: Record<string, unknown> = {}) {
    return {
        id: ID_A,
        code: "SAVE10",
        discount_type: "percentage",
        discount_value: 10,
        min_order_amount: 0,
        max_uses: null,
        used_count: 0,
        valid_from: "2026-10-01T00:00:00+00:00",
        valid_until: null,
        applicable_workshop_ids: null,
        applicable_categories: null,
        is_active: true,
        created_by: "admin-1",
        created_at: "2026-10-01T00:00:00+00:00",
        updated_at: null,
        ...overrides,
    };
}

function offer(overrides: Partial<PublicOffer> = {}): PublicOffer {
    return {
        id: ID_A,
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

describe("parseCouponOffersSetting", () => {
    it.each([null, undefined, 7, "nope", "[1,2]", [[]], true])("reads %j as no offers", (raw) => {
        expect(parseCouponOffersSetting(raw)).toEqual({});
    });

    it("reads entries, lower-cases ids and maps to camelCase", () => {
        expect(
            parseCouponOffersSetting({
                [ID_A.toUpperCase()]: {
                    visibility: "auto",
                    label: "  Diwali offer  ",
                    min_guests: 2,
                    show_end_date: true,
                },
                [ID_B]: { visibility: "listed" },
            })
        ).toEqual({
            [ID_A]: { visibility: "auto", label: "Diwali offer", minGuests: 2, showEndDate: true },
            [ID_B]: { visibility: "listed" },
        });
    });

    it("also reads a value stored as JSON text", () => {
        expect(
            parseCouponOffersSetting(JSON.stringify({ [ID_A]: { visibility: "community" } }))
        ).toEqual({ [ID_A]: { visibility: "community" } });
    });

    it("skips entries it cannot read", () => {
        expect(
            parseCouponOffersSetting({
                "not-a-uuid": { visibility: "auto" },
                [ID_A]: { visibility: "public" },
                [ID_B]: "auto",
                [ID_C]: { visibility: "auto" },
            })
        ).toEqual({ [ID_C]: { visibility: "auto" } });
    });

    it("drops an entry whose seat minimum is unreadable instead of applying it to everyone", () => {
        for (const minGuests of [0, 21, 1.5, "2", -1]) {
            expect(
                parseCouponOffersSetting({ [ID_A]: { visibility: "auto", min_guests: minGuests } })
            ).toEqual({});
        }
        expect(parseCouponOffersSetting({ [ID_A]: { visibility: "auto", min_guests: 1 } })).toEqual(
            { [ID_A]: { visibility: "auto" } }
        );
    });

    it("ignores a bad label or end-date flag but keeps the entry", () => {
        expect(
            parseCouponOffersSetting({
                [ID_A]: { visibility: "auto", label: "x".repeat(41), show_end_date: "yes" },
                [ID_B]: { visibility: "auto", label: "two\nlines" },
            })
        ).toEqual({ [ID_A]: { visibility: "auto" }, [ID_B]: { visibility: "auto" } });
    });
});

describe("validateCouponOffersSetting", () => {
    it("accepts and normalises a valid value", () => {
        expect(
            validateCouponOffersSetting({
                [ID_A.toUpperCase()]: {
                    visibility: "auto",
                    label: " Limited-time offer ",
                    min_guests: 1,
                    show_end_date: true,
                },
                [ID_B]: { visibility: "listed", label: "", min_guests: 2, show_end_date: false },
                [ID_C]: { visibility: "hidden", label: null, min_guests: null },
            })
        ).toEqual({
            ok: true,
            value: {
                [ID_A]: { visibility: "auto", label: "Limited-time offer", show_end_date: true },
                [ID_B]: { visibility: "listed", min_guests: 2 },
                [ID_C]: { visibility: "hidden" },
            },
        });
        expect(validateCouponOffersSetting({})).toEqual({ ok: true, value: {} });
    });

    it.each([
        ["not an object", []],
        ["text", "x"],
        ["a bad key", { "coupon-1": { visibility: "auto" } }],
        ["a non-object entry", { [ID_A]: "auto" }],
        ["an unknown field", { [ID_A]: { visibility: "auto", code: "SECRET" } }],
        ["a missing visibility", { [ID_A]: { label: "x" } }],
        ["a bad visibility", { [ID_A]: { visibility: "public" } }],
        ["a long label", { [ID_A]: { visibility: "auto", label: "x".repeat(41) } }],
        ["a multi-line label", { [ID_A]: { visibility: "auto", label: "a\nb" } }],
        ["a numeric label", { [ID_A]: { visibility: "auto", label: 5 } }],
        ["zero seats", { [ID_A]: { visibility: "auto", min_guests: 0 } }],
        ["21 seats", { [ID_A]: { visibility: "auto", min_guests: 21 } }],
        ["fractional seats", { [ID_A]: { visibility: "auto", min_guests: 1.5 } }],
        ["seats as text", { [ID_A]: { visibility: "auto", min_guests: "2" } }],
        ["a non-boolean end-date flag", { [ID_A]: { visibility: "auto", show_end_date: 1 } }],
    ])("rejects %s", (_label, value) => {
        expect(validateCouponOffersSetting(value).ok).toBe(false);
    });

    it("caps the number of entries", () => {
        const many: Record<string, unknown> = {};
        for (let index = 0; index <= COUPON_OFFERS_MAX_ENTRIES; index += 1) {
            const hex = index.toString(16).padStart(12, "0");
            many[`00000000-0000-4000-8000-${hex}`] = { visibility: "auto" };
        }
        expect(validateCouponOffersSetting(many).ok).toBe(false);
    });
});

describe("serializeCouponOffersSetting", () => {
    it("round-trips through the parser", () => {
        const setting = parseCouponOffersSetting({
            [ID_A]: { visibility: "auto", label: "Offer", min_guests: 3, show_end_date: true },
            [ID_B]: { visibility: "community" },
        });
        const stored = serializeCouponOffersSetting(setting);
        expect(validateCouponOffersSetting(stored)).toEqual({ ok: true, value: stored });
        expect(parseCouponOffersSetting(stored)).toEqual(setting);
    });
});

describe("pricingCouponFromRow", () => {
    it("merges the seat minimum from the setting", () => {
        const setting = parseCouponOffersSetting({
            [ID_A.toUpperCase()]: { visibility: "hidden", min_guests: 2 },
        });
        expect(pricingCouponFromRow(row(), setting)?.minGuests).toBe(2);
        expect(pricingCouponFromRow(row({ id: ID_B }), setting)?.minGuests).toBeNull();
        expect(pricingCouponFromRow({ nope: true }, setting)).toBeNull();
    });
});

describe("describeDiscount / offerDiscountText", () => {
    it("describes percentages and rupee amounts", () => {
        expect(describeDiscount("percentage", 10)).toBe("10% off");
        expect(describeDiscount("percentage", 12.5)).toBe("12.5% off");
        expect(describeDiscount("fixed", 1500)).toBe("₹1,500 off");
    });

    it("says a fixed Early Bird is per seat and a fixed coupon per booking", () => {
        expect(
            offerDiscountText({ kind: "early_bird", discountType: "fixed", discountValue: 200 })
        ).toBe("₹200 off per seat");
        for (const kind of ["auto", "listed", "community"] as const) {
            expect(offerDiscountText({ kind, discountType: "fixed", discountValue: 200 })).toBe(
                "₹200 off per booking"
            );
        }
        expect(
            offerDiscountText({ kind: "auto", discountType: "percentage", discountValue: 10 })
        ).toBe("10% off");
    });
});

describe("offerTerms / offerTermsText / offerDetailsText", () => {
    it("lists every condition: seats, minimum order and community-only", () => {
        const group = offer({ kind: "community", minGuests: 2, minOrderAmount: 2000 });
        expect(offerTerms(group)).toEqual([
            "Book 2+ seats",
            "Bookings of ₹2,000 or more (before service fee)",
            "For WhatsApp community members",
        ]);
        expect(offerTermsText(group, { earlyBirdActive: true })).toBe(
            "Book 2+ seats · Bookings of ₹2,000 or more (after Early Bird, before service fee) · For WhatsApp community members"
        );
        expect(offerTerms(offer())).toEqual([]);
    });

    it("adds the discount under a label that does not already state it", () => {
        expect(offerDetailsText(offer({ label: "10% off" }))).toBe("");
        expect(offerDetailsText(offer({ label: "Diwali offer", minOrderAmount: 1500 }))).toBe(
            "10% off · Bookings of ₹1,500 or more (before service fee)"
        );
        expect(
            offerDetailsText(
                offer({
                    kind: "community",
                    label: "Community price drop",
                    discountValue: 15,
                })
            )
        ).toBe("15% off · For WhatsApp community members");
        expect(
            offerDetailsText(
                offer({
                    label: "₹200 off per booking of 2+ seats",
                    discountType: "fixed",
                    discountValue: 200,
                    minGuests: 2,
                })
            )
        ).toBe("Book 2+ seats");
        expect(
            offerDetailsText(
                offer({ label: "Weekend special", discountType: "fixed", discountValue: 200 })
            )
        ).toBe("₹200 off per booking");
    });
});

describe("offerLabelConflicts", () => {
    const percentage = { discountType: "percentage", discountValue: 10, minOrderAmount: 1500 };
    const fixed = { discountType: "fixed", discountValue: 200, minOrderAmount: null };

    it.each([
        ["Diwali offer", percentage, false],
        ["Diwali 10% off", percentage, false],
        ["10 % off this week", percentage, false],
        ["Above ₹1,500", percentage, false],
        ["Up to 20% off", percentage, true],
        ["Flat ₹200 off", percentage, true],
        ["Rs. 300 off", percentage, true],
        ["Flat ₹200 off", fixed, false],
        ["Save Rs 200", fixed, false],
        ["INR 250 off", fixed, true],
        ["10% off", fixed, true],
        ["Book 2+ seats", fixed, false],
    ])("%s on %o -> %s", (label, coupon, conflicts) => {
        expect(offerLabelConflicts(label, coupon)).toBe(conflicts);
    });

    describe("per-seat wording, minimum orders and bare amounts", () => {
        const fixed200 = { discountType: "fixed", discountValue: 200, minOrderAmount: null };
        const fixed200Min2000 = { discountType: "fixed", discountValue: 200, minOrderAmount: 2000 };
        const pct10 = { discountType: "percentage", discountValue: 10, minOrderAmount: null };

        it.each([
            // A fixed coupon comes off once per booking: per-seat wording misstates it.
            ["₹200 off per person", fixed200, true],
            ["₹200 off each", fixed200, true],
            ["₹200 off per seat", fixed200, true],
            ["₹200 off per head", fixed200, true],
            ["₹200 off pp", fixed200, true],
            ["₹200 off/seat", fixed200, true],
            ["₹200 per person", fixed200, true],
            ["₹200 off each booking", fixed200, false],
            ["₹200 off per booking", fixed200, false],
            // A percentage is the same per seat and per booking.
            ["10% off per person", pct10, false],
            // The minimum-order figure is allowed only as a threshold, never as the amount off.
            ["₹2,000 off", fixed200Min2000, true],
            ["Above ₹2,000", fixed200Min2000, false],
            ["Orders above ₹2,000 get ₹200 off", fixed200Min2000, false],
            ["₹2,000+ bookings get ₹200 off", fixed200Min2000, false],
            ["Above ₹1,000", fixed200Min2000, true],
            ["Above ₹2,000", fixed200, true],
            ["Flat ₹1,500 off", percentage, true],
            ["Above ₹1,500", percentage, false],
            ["Bookings of ₹1,500 or more", percentage, false],
            // A bare number followed by "off" is an amount in rupees.
            ["Flat 100 off", pct10, true],
            ["Flat 200 off", fixed200, false],
            ["200/- off", fixed200, false],
            ["300 rupees off", fixed200, true],
        ])("%s on %o -> %s", (label, coupon, conflicts) => {
            expect(offerLabelConflicts(label, coupon)).toBe(conflicts);
        });
    });
});

describe("offerLabelRevealsCode", () => {
    it.each([
        ["Use WHATSAPP15 for 15% off", "WHATSAPP15", true],
        ["code: whatsapp15", "WHATSAPP15", true],
        ["WEEK-END special", "WEEK-END", true],
        ["weekend special", "WEEK-END", true],
        ["Community price drop", "WHATSAPP15", false],
        ["WHATSAPP150 offer", "WHATSAPP15", false],
        ["Diwali offer", "", false],
        ["Diwali offer", null, false],
        // Letter/digit boundaries: punctuation around or inside the code still reveals it.
        ["GET-DIWALI10 now", "DIWALI10", true],
        ["Diwali-10 offer", "DIWALI10", true],
        ["D-I-W-A-L-I-1-0", "DIWALI10", true],
        ["(diwali10)", "DIWALI10", true],
        ["Use code: Diwali10.", "DIWALI10", true],
        ["GETDIWALI10", "DIWALI10", false],
        ["DIWALI100", "DIWALI10", false],
    ])("%s with code %j -> %s", (label, code, reveals) => {
        expect(offerLabelRevealsCode(label, code)).toBe(reveals);
    });
});

describe("offerLabelsToCheckForCodes / offerLabelsRevealingCodes", () => {
    const value = {
        [ID_A.toUpperCase()]: { visibility: "community", label: "Use whatsapp-15" },
        [ID_B]: { visibility: "listed", label: "Use WEEKEND" },
        [ID_C]: { visibility: "hidden", label: "GET-SECRET now" },
        [ID_D]: { visibility: "auto" },
        "not-a-uuid": { visibility: "auto", label: "SECRET" },
    };

    it("checks every labelled entry except listed ones (their code is shown anyway)", () => {
        const expected = [
            { couponId: ID_A, label: "Use whatsapp-15" },
            { couponId: ID_C, label: "GET-SECRET now" },
        ];
        expect(offerLabelsToCheckForCodes(value)).toEqual(expected);
        expect(offerLabelsToCheckForCodes(JSON.stringify(value))).toEqual(expected);
        expect(
            offerLabelsToCheckForCodes({ [ID_A]: { visibility: "auto", label: "   " } })
        ).toEqual([]);
        for (const raw of [null, undefined, 7, "{oops", [], [value]]) {
            expect(offerLabelsToCheckForCodes(raw)).toEqual([]);
        }
    });

    it("returns the ids whose label spells out their own coupon's code", () => {
        const coupons = [
            { id: ID_A, code: "WHATSAPP15" },
            { id: ID_B, code: "WEEKEND" },
            { id: ID_C, code: "SECRET" },
            { id: ID_D, code: "AUTO10" },
        ];
        expect(offerLabelsRevealingCodes(value, coupons)).toEqual([ID_A, ID_C]);
        expect(offerLabelsRevealingCodes(JSON.stringify(value), coupons)).toEqual([ID_A, ID_C]);
        // Ids and codes in any case.
        expect(
            offerLabelsRevealingCodes(value, [{ id: ID_C.toUpperCase(), code: "secret" }])
        ).toEqual([ID_C]);
        // Only the coupon's own code counts; a coupon without a known code reveals nothing.
        expect(offerLabelsRevealingCodes(value, [{ id: ID_A, code: "OTHER" }])).toEqual([]);
        expect(offerLabelsRevealingCodes(value, [{ id: ID_A, code: null }])).toEqual([]);
        expect(offerLabelsRevealingCodes(value, [])).toEqual([]);
    });
});

describe("OFFER_ADMIN_HINTS", () => {
    it("explains that the settings are public, the use-limit rule and the advertised end", () => {
        expect(OFFER_ADMIN_HINTS.publicSettings).toMatch(/anyone can read/);
        expect(OFFER_ADMIN_HINTS.maxUses).toMatch(/Leave max uses empty for Auto and Community/);
        expect(OFFER_ADMIN_HINTS.maxUses).toContain(`${CAPPED_OFFER_RESERVE} or fewer`);
        expect(OFFER_ADMIN_HINTS.advertisedEnd).toContain("30 minutes before");
        expect(OFFER_ADMIN_HINTS.label).toMatch(/only a name/);
    });
});

describe("effectiveOfferDisplay", () => {
    it("hides auto and listed offers once the reserve is reached; leaves others alone", () => {
        const left = (remaining: number) => ({ maxUses: 20, usedCount: 20 - remaining });
        expect(
            effectiveOfferDisplay(left(CAPPED_OFFER_RESERVE + 1), { visibility: "auto" })
        ).toEqual({ visibility: "auto" });
        expect(
            effectiveOfferDisplay(left(CAPPED_OFFER_RESERVE), { visibility: "listed", label: "X" })
        ).toEqual({ visibility: "hidden", label: "X" });
        expect(effectiveOfferDisplay(left(0), { visibility: "community" })).toEqual({
            visibility: "community",
        });
        expect(
            effectiveOfferDisplay({ maxUses: null, usedCount: 999 }, { visibility: "auto" })
        ).toEqual({ visibility: "auto" });
        expect(effectiveOfferDisplay(left(1), undefined)).toBeUndefined();
    });
});

describe("buildPublicOffers", () => {
    const setting = {
        [ID_A]: { visibility: "auto", show_end_date: true },
        [ID_B]: { visibility: "listed", label: "Weekend special" },
        [ID_C]: { visibility: "community" },
        [ID_D]: { visibility: "hidden" },
    };
    const rows = [
        row({ id: ID_C, code: "WHATSAPP15", discount_value: 15 }),
        row({ id: ID_B, code: "WEEKEND", discount_type: "fixed", discount_value: 200 }),
        row({ id: ID_A, code: "AUTO10", valid_until: "2026-10-31T18:30:00+00:00" }),
        row({ id: ID_D, code: "SECRET" }),
    ];

    it("returns [] without rows or without a setting", () => {
        expect(buildPublicOffers(null, setting, NOW)).toEqual([]);
        expect(buildPublicOffers(rows, null, NOW)).toEqual([]);
        expect(buildPublicOffers(rows, "garbage", NOW)).toEqual([]);
    });

    it("builds safe offers, with a code only for listed ones", () => {
        const offers = buildPublicOffers(rows, setting, NOW);
        expect(offers.map((o) => [o.kind, o.code])).toEqual([
            ["auto", null],
            ["listed", "WEEKEND"],
            ["community", null],
        ]);
        expect(JSON.stringify(offers)).not.toContain("SECRET");
        expect(JSON.stringify(offers)).not.toContain("WHATSAPP15");
        expect(JSON.stringify(offers)).not.toContain("AUTO10");
        for (const item of offers) {
            expect(Object.keys(item).sort()).toEqual(
                [
                    "availableUntil",
                    "categories",
                    "code",
                    "discountType",
                    "discountValue",
                    "endsAt",
                    "id",
                    "kind",
                    "label",
                    "minGuests",
                    "minOrderAmount",
                    "startsAt",
                    "workshopIds",
                ].sort()
            );
        }
    });

    it("advertises the end only with show_end_date, 30 minutes before valid_until", () => {
        const [auto, listed] = buildPublicOffers(rows, setting, NOW);
        expect(auto.availableUntil).toBe("2026-10-31T18:00:00.000Z");
        expect(auto.endsAt).toBe("2026-10-31T18:00:00.000Z");
        expect(listed.availableUntil).toBeNull();
        expect(listed.endsAt).toBeNull();
    });

    it("labels offers: admin label first, then a default", () => {
        const labels = buildPublicOffers(rows, setting, NOW).map((o) => o.label);
        expect(labels).toEqual(["10% off", "Weekend special", "Community price drop"]);

        const group = buildPublicOffers(
            [row()],
            { [ID_A]: { visibility: "auto", min_guests: 2 } },
            NOW
        );
        expect(group[0]).toMatchObject({ label: "10% off on 2+ seats", minGuests: 2 });
    });

    it("says per booking in the default label of a fixed offer, never per seat", () => {
        const fixed = (minGuests?: number) =>
            buildPublicOffers(
                [row({ discount_type: "fixed", discount_value: 200 })],
                {
                    [ID_A]: {
                        visibility: "listed",
                        ...(minGuests ? { min_guests: minGuests } : {}),
                    },
                },
                NOW
            )[0].label;
        expect(fixed()).toBe("₹200 off per booking");
        expect(fixed(2)).toBe("₹200 off per booking of 2+ seats");
    });

    it("never shows an admin label that states another discount", () => {
        const labelled = (label: string, overrides: Record<string, unknown> = {}) =>
            buildPublicOffers([row(overrides)], { [ID_A]: { visibility: "auto", label } }, NOW)[0]
                .label;
        expect(labelled("Diwali offer")).toBe("Diwali offer");
        expect(labelled("Diwali 10% off")).toBe("Diwali 10% off");
        expect(labelled("Diwali 20% off")).toBe("10% off");
        expect(labelled("Flat ₹500 off")).toBe("10% off");
        expect(labelled("10% off above ₹1,500", { min_order_amount: 1500 })).toBe(
            "10% off above ₹1,500"
        );
        expect(labelled("Save 10%", { discount_type: "fixed", discount_value: 100 })).toBe(
            "₹100 off per booking"
        );
        const fixed200 = { discount_type: "fixed", discount_value: 200 };
        expect(labelled("₹200 off per person", fixed200)).toBe("₹200 off per booking");
        expect(labelled("₹200 off each booking", fixed200)).toBe("₹200 off each booking");
        expect(labelled("Flat 100 off")).toBe("10% off");
    });

    it("never shows a label that spells out a code that is not listed", () => {
        const labelled = (visibility: string) =>
            buildPublicOffers(
                [row({ code: "WHATSAPP15" })],
                { [ID_A]: { visibility, label: "Use WHATSAPP15" } },
                NOW
            )[0];
        expect(labelled("community").label).toBe("Community price drop");
        expect(labelled("auto").label).toBe("10% off");
        expect(JSON.stringify(labelled("community"))).not.toContain("WHATSAPP15");
        // A listed offer shows its code anyway.
        expect(labelled("listed")).toMatchObject({ label: "Use WHATSAPP15", code: "WHATSAPP15" });

        const hyphenated = buildPublicOffers(
            [row({ code: "WHATSAPP15" })],
            { [ID_A]: { visibility: "community", label: "GET-WHATSAPP15 now" } },
            NOW
        )[0];
        expect(hyphenated.label).toBe("Community price drop");
        expect(JSON.stringify(hyphenated)).not.toContain("WHATSAPP15");
    });

    it("drops inactive, used-up, ended, zero and malformed coupons", () => {
        const only = (r: Record<string, unknown>) =>
            buildPublicOffers([row(r)], { [ID_A]: { visibility: "auto" } }, NOW);
        expect(only({ is_active: false })).toEqual([]);
        expect(only({ is_active: null })).toEqual([]);
        expect(only({ max_uses: 10, used_count: 10 })).toEqual([]);
        // valid_until 10:20 => advertised end 09:50, before NOW.
        expect(only({ valid_until: "2026-10-23T10:20:00Z" })).toEqual([]);
        expect(only({ discount_value: 0 })).toEqual([]);
        expect(only({ discount_type: "bogo" })).toEqual([]);
        expect(only({ applicable_workshop_ids: "w1" })).toEqual([]);
        expect(only({ valid_from: "someday" })).toEqual([]);
        // timestamptz 'infinity' arrives as the text "infinity", which no Date reads: checkout
        // refuses such a coupon (COUPON_INVALID), so it must not be shown as an offer either.
        expect(only({ valid_until: "infinity" })).toEqual([]);
        expect(only({ valid_until: "soon" })).toEqual([]);
        expect(only({ max_uses: 10, used_count: 11 })).toEqual([]);
    });

    it("stops listing or auto-applying a capped offer while a few uses remain", () => {
        const only = (visibility: string, r: Record<string, unknown>) =>
            buildPublicOffers([row(r)], { [ID_A]: { visibility } }, NOW);
        const reserveLeft = 10 - CAPPED_OFFER_RESERVE;
        for (const visibility of ["auto", "listed"]) {
            expect(only(visibility, { max_uses: 10, used_count: reserveLeft - 1 })).toHaveLength(1);
            expect(only(visibility, { max_uses: 10, used_count: reserveLeft })).toEqual([]);
            expect(only(visibility, { max_uses: null, used_count: 500 })).toHaveLength(1);
        }
        // Community codes are typed, like any code today: shown until actually used up.
        expect(only("community", { max_uses: 10, used_count: 9 })).toHaveLength(1);
        expect(only("community", { max_uses: 10, used_count: 10 })).toEqual([]);
    });

    it("keeps scope and minimum order, dropping a zero minimum", () => {
        const [item] = buildPublicOffers(
            [
                row({
                    applicable_workshop_ids: ["w1"],
                    applicable_categories: ["Art"],
                    min_order_amount: 1500,
                }),
            ],
            { [ID_A]: { visibility: "auto" } },
            NOW
        );
        expect(item).toMatchObject({
            workshopIds: ["w1"],
            categories: ["Art"],
            minOrderAmount: 1500,
        });
        const [plain] = buildPublicOffers([row()], { [ID_A]: { visibility: "auto" } }, NOW);
        expect(plain).toMatchObject({ workshopIds: null, categories: null, minOrderAmount: null });
    });

    it("sorts auto, listed, community, then the soonest end first", () => {
        const offers = buildPublicOffers(
            [
                row({ id: ID_B, valid_until: null }),
                row({ id: ID_A, valid_until: "2026-11-01T00:00:00Z" }),
                row({ id: ID_C, valid_until: "2026-10-25T00:00:00Z" }),
            ],
            {
                [ID_A]: { visibility: "listed" },
                [ID_B]: { visibility: "listed" },
                [ID_C]: { visibility: "listed" },
            },
            NOW
        );
        expect(offers.map((o) => o.id)).toEqual([ID_C, ID_A, ID_B]);
    });
});

describe("publicOfferFromCoupon", () => {
    it("returns null for hidden or missing display settings", () => {
        const coupon = pricingCouponFromRow(row(), {})!;
        expect(publicOfferFromCoupon(coupon, undefined)).toBeNull();
        expect(publicOfferFromCoupon(coupon, { visibility: "hidden" })).toBeNull();
    });
});

describe("earlyBirdOfferFor", () => {
    it("describes the workshop's Early Bird with its real end", () => {
        expect(earlyBirdOfferFor(earlyBirdWorkshop, NOW)).toEqual({
            id: "early-bird:w1",
            kind: "early_bird",
            label: "Early bird 10% off",
            discountType: "percentage",
            discountValue: 10,
            minGuests: null,
            minOrderAmount: null,
            startsAt: null,
            availableUntil: "2026-10-26T00:00:00.000Z",
            endsAt: "2026-10-26T00:00:00.000Z",
            code: null,
            workshopIds: ["w1"],
            categories: null,
        });
    });

    it("labels a fixed Early Bird per seat", () => {
        expect(
            earlyBirdOfferFor(
                {
                    ...earlyBirdWorkshop,
                    earlyBirdDiscountType: "fixed",
                    earlyBirdDiscountValue: 150,
                },
                NOW
            )?.label
        ).toBe("Early bird ₹150 off per seat");
    });

    it("describes the discount actually charged, never more", () => {
        expect(
            earlyBirdOfferFor({ ...earlyBirdWorkshop, earlyBirdDiscountValue: 150 }, NOW)?.label
        ).toBe("Early bird 100% off");
        expect(
            earlyBirdOfferFor(
                {
                    ...earlyBirdWorkshop,
                    price: 999,
                    earlyBirdDiscountType: "fixed",
                    earlyBirdDiscountValue: 1500,
                },
                NOW
            )
        ).toMatchObject({ discountValue: 999, label: "Early bird ₹999 off per seat" });
        expect(earlyBirdOfferFor({ ...earlyBirdWorkshop, price: 0 }, NOW)).toBeNull();
        expect(
            earlyBirdOfferFor(
                { ...earlyBirdWorkshop, price: 0, earlyBirdDiscountType: "fixed" },
                NOW
            )
        ).toBeNull();
    });

    it("is null when there is no Early Bird or it has ended", () => {
        expect(earlyBirdOfferFor(workshop, NOW)).toBeNull();
        expect(earlyBirdOfferFor(earlyBirdWorkshop, new Date("2026-10-26T00:00:00Z"))).toBeNull();
    });
});

describe("offersForWorkshop", () => {
    it("puts the Early Bird first and keeps offers in scope and inside their window", () => {
        const offers = [
            offer({ id: "all" }),
            offer({ id: "mine", workshopIds: ["w1"] }),
            offer({ id: "other", workshopIds: ["w2"] }),
            offer({ id: "art", categories: ["Art"] }),
            offer({ id: "music", categories: ["Music"] }),
            offer({ id: "later", startsAt: "2026-10-24T00:00:00Z" }),
            offer({ id: "ended", availableUntil: "2026-10-23T09:59:59Z" }),
            offer({ id: "edge", availableUntil: NOW.toISOString() }),
            offer({ id: "early-bird:w2", kind: "early_bird", workshopIds: ["w2"] }),
        ];
        expect(offersForWorkshop(offers, earlyBirdWorkshop, NOW).map((o) => o.id)).toEqual([
            "early-bird:w1",
            "all",
            "mine",
            "art",
            "edge",
        ]);
    });

    it("never matches a category-limited offer to a workshop without a category", () => {
        const offers = [offer({ id: "art", categories: ["Art"] })];
        expect(offersForWorkshop(offers, { ...workshop, category: null }, NOW)).toEqual([]);
    });

    it("copes with no offers", () => {
        expect(offersForWorkshop(null, workshop, NOW)).toEqual([]);
        expect(offersForWorkshop(undefined, earlyBirdWorkshop, NOW)).toHaveLength(1);
    });

    it("lists no coupon offers for a free workshop (nothing to discount)", () => {
        expect(offersForWorkshop([offer()], { ...workshop, price: 0 }, NOW)).toEqual([]);
    });

    it("never shows a fixed amount larger than the largest possible booking", () => {
        const small = { ...workshop, price: 100 }; // 20 seats at most: ₹2,000
        const [capped] = offersForWorkshop(
            [
                offer({
                    label: "₹5,000 off per booking",
                    discountType: "fixed",
                    discountValue: 5000,
                }),
            ],
            small,
            NOW
        );
        expect(capped).toMatchObject({ discountValue: 2000, label: "₹2,000 off per booking" });

        const named = (label: string) =>
            offersForWorkshop(
                [offer({ label, discountType: "fixed", discountValue: 5000 })],
                small,
                NOW
            )[0].label;
        expect(named("Weekend special")).toBe("Weekend special");
        expect(named("Flat ₹5,000 off")).toBe("₹2,000 off per booking");

        // Quotes do not change: no subtotal can exceed the cap.
        for (const guests of [1, 5, 20]) {
            const quote = (coupon: PublicOffer) =>
                computeQuote({
                    workshop: small,
                    guests,
                    coupon: pricingCouponFromOffer(coupon),
                    serviceFee: 0,
                    now: NOW,
                }).subtotal;
            expect(quote(capped)).toBe(
                quote(offer({ discountType: "fixed", discountValue: 5000 }))
            );
        }

        const affordable = offer({ discountType: "fixed", discountValue: 200 });
        expect(offersForWorkshop([affordable], small, NOW)[0]).toBe(affordable);
    });
});

describe("pricingCouponFromOffer", () => {
    it("adds the grace back so the shared rules compute the same advertised end", () => {
        const coupon = pricingCouponFromOffer(
            offer({ availableUntil: "2026-10-31T18:00:00.000Z", code: "X", kind: "listed" })
        );
        expect(coupon).toMatchObject({
            validUntil: "2026-10-31T18:30:00.000Z",
            code: "X",
            isActive: true,
        });
        expect(
            couponRejection(coupon, {
                workshop,
                guests: 1,
                now: new Date("2026-10-31T18:00:00.001Z"),
                purpose: "display",
            })
        ).toBe("COUPON_EXPIRED");
    });

    it("is null for an Early Bird offer", () => {
        expect(pricingCouponFromOffer(offer({ kind: "early_bird" }))).toBeNull();
    });
});

describe("cardOfferFor", () => {
    it("is null when nothing is discounted (no fake struck-through price)", () => {
        expect(cardOfferFor(workshop, [], NOW)).toBeNull();
        expect(cardOfferFor(workshop, null, NOW)).toBeNull();
        expect(cardOfferFor({ ...workshop, price: 0 }, [offer()], NOW)).toBeNull();
    });

    it("shows the Early Bird price with its real end", () => {
        expect(cardOfferFor(earlyBirdWorkshop, [], NOW)).toEqual({
            listPrice: 1000,
            offerPrice: 900,
            label: "Early bird 10% off",
            labels: ["Early bird 10% off"],
            discountText: "10% off",
            endsAt: "2026-10-26T00:00:00.000Z",
            availableUntil: "2026-10-26T00:00:00.000Z",
            savings: 100,
            couponId: null,
            perBooking: false,
        });
    });

    it("stacks the best auto offer on the Early Bird, priced exactly like checkout", () => {
        const auto = offer({ id: ID_A, label: "Limited-time offer", discountValue: 15 });
        const card = cardOfferFor(earlyBirdWorkshop, [auto], NOW);
        const quote = computeQuote({
            workshop: earlyBirdWorkshop,
            guests: 1,
            coupon: pricingCouponFromOffer(auto),
            serviceFee: 0,
            now: NOW,
        });
        expect(card).toEqual({
            listPrice: 1000,
            offerPrice: quote.subtotal, // 1000 - 100 - round(900 x 15%) = 765
            label: "Limited-time offer", // 135 off beats the Early Bird's 100
            labels: ["Early bird 10% off", "Limited-time offer"],
            discountText: "10% off + 15% off",
            endsAt: "2026-10-26T00:00:00.000Z", // the coupon has no end; the Early Bird's shows
            availableUntil: "2026-10-26T00:00:00.000Z",
            savings: 235,
            couponId: ID_A,
            perBooking: false,
        });
        expect(card?.offerPrice).toBe(765);
    });

    it("spells out every discount with its unit (discountText)", () => {
        const fixedEarlyBird: PricingWorkshop = {
            ...earlyBirdWorkshop,
            earlyBirdDiscountType: "fixed",
            earlyBirdDiscountValue: 150,
        };
        const weekend = offer({
            id: ID_B,
            label: "Weekend special",
            discountType: "fixed",
            discountValue: 200,
        });
        expect(cardOfferFor(fixedEarlyBird, [weekend], NOW)).toMatchObject({
            listPrice: 1000,
            offerPrice: 650, // 1000 - 150 per seat - 200 per booking
            savings: 350,
            label: "Weekend special", // 200 off beats the Early Bird's 150
            labels: ["Early bird ₹150 off per seat", "Weekend special"],
            discountText: "₹150 off per seat + ₹200 off per booking",
            couponId: ID_B,
            perBooking: true,
        });
        expect(
            cardOfferFor(workshop, [offer({ label: "Diwali offer", discountValue: 12.5 })], NOW)
        ).toMatchObject({
            offerPrice: 875,
            label: "Diwali offer",
            labels: ["Diwali offer"],
            discountText: "12.5% off",
            perBooking: false,
        });
        expect(cardOfferFor(fixedEarlyBird, [], NOW)).toMatchObject({
            offerPrice: 850,
            discountText: "₹150 off per seat",
            perBooking: false,
        });
    });

    it("picks the best of several auto offers", () => {
        const card = cardOfferFor(
            workshop,
            [
                offer({ id: ID_A, label: "Small", discountValue: 5 }),
                offer({ id: ID_B, label: "Big", discountType: "fixed", discountValue: 200 }),
            ],
            NOW
        );
        expect(card).toMatchObject({
            offerPrice: 800,
            savings: 200,
            label: "Big",
            couponId: ID_B,
            perBooking: true,
        });
    });

    it("never reports a percentage that could contradict the label", () => {
        const card = cardOfferFor({ ...earlyBirdWorkshop, price: 1999 }, [], NOW);
        expect(card).toMatchObject({ label: "Early bird 10% off", offerPrice: 1800, savings: 199 });
        expect(card).not.toHaveProperty("percentOff");
    });

    it("ignores offers a single guest would not get by themselves", () => {
        const offers = [
            offer({ id: "group", minGuests: 2 }),
            offer({ id: "listed", kind: "listed", code: "TYPEME" }),
            offer({ id: "community", kind: "community" }),
            offer({ id: "minimum", minOrderAmount: 1500 }),
            offer({ id: "later", startsAt: "2026-10-24T00:00:00Z" }),
            offer({ id: "elsewhere", workshopIds: ["w2"] }),
        ];
        expect(cardOfferFor(workshop, offers, NOW)).toBeNull();
    });

    it("hides the end when the soonest-ending discount may not be advertised", () => {
        const quiet = offer({ availableUntil: "2026-10-24T00:00:00.000Z", endsAt: null });
        expect(cardOfferFor(earlyBirdWorkshop, [quiet], NOW)?.endsAt).toBeNull();

        const loud = offer({
            availableUntil: "2026-10-24T00:00:00.000Z",
            endsAt: "2026-10-24T00:00:00.000Z",
        });
        expect(cardOfferFor(earlyBirdWorkshop, [loud], NOW)).toMatchObject({
            endsAt: "2026-10-24T00:00:00.000Z",
            availableUntil: "2026-10-24T00:00:00.000Z",
        });
        expect(cardOfferFor(workshop, [quiet], NOW)?.endsAt).toBeNull();
    });

    it("still says when a quiet price stops (availableUntil), without advertising it", () => {
        const quiet = offer({ id: ID_A, availableUntil: "2026-10-24T00:00:00.000Z", endsAt: null });
        expect(cardOfferFor(workshop, [quiet], NOW)).toMatchObject({
            couponId: ID_A,
            endsAt: null,
            availableUntil: "2026-10-24T00:00:00.000Z",
        });
        // With the Early Bird (ends 26 Oct) the coupon still ends first.
        expect(cardOfferFor(earlyBirdWorkshop, [quiet], NOW)).toMatchObject({
            endsAt: null,
            availableUntil: "2026-10-24T00:00:00.000Z",
        });
        // Once it has passed, a fresh computation drops the coupon (cards do this after mount).
        expect(
            cardOfferFor(earlyBirdWorkshop, [quiet], new Date("2026-10-24T00:00:00.001Z"))
        ).toMatchObject({ couponId: null, offerPrice: 900 });
        // No end anywhere: neither field is set.
        expect(cardOfferFor(workshop, [offer()], NOW)).toMatchObject({
            endsAt: null,
            availableUntil: null,
        });
    });

    it("counts the Early Bird's end: the price lasts until its first discount ends", () => {
        // The coupon ends quietly after the Early Bird: the Early Bird's (advertised) end is first.
        const later = offer({ availableUntil: "2026-10-30T00:00:00.000Z", endsAt: null });
        expect(cardOfferFor(earlyBirdWorkshop, [later], NOW)).toMatchObject({
            couponId: ID_A,
            endsAt: "2026-10-26T00:00:00.000Z",
            availableUntil: "2026-10-26T00:00:00.000Z",
        });
        // A coupon with no end: the Early Bird's.
        expect(cardOfferFor(earlyBirdWorkshop, [offer()], NOW)).toMatchObject({
            endsAt: "2026-10-26T00:00:00.000Z",
            availableUntil: "2026-10-26T00:00:00.000Z",
        });
        // Both end together but the coupon's end may not be advertised: no end is shown.
        const together = offer({ availableUntil: "2026-10-26T00:00:00.000Z", endsAt: null });
        expect(cardOfferFor(earlyBirdWorkshop, [together], NOW)).toMatchObject({
            endsAt: null,
            availableUntil: "2026-10-26T00:00:00.000Z",
        });
    });

    it("stops at the offer's advertised end", () => {
        const timed = offer({ availableUntil: "2026-10-23T11:00:00.000Z" });
        expect(cardOfferFor(workshop, [timed], new Date("2026-10-23T11:00:00.000Z"))).not.toBe(
            null
        );
        expect(cardOfferFor(workshop, [timed], new Date("2026-10-23T11:00:00.001Z"))).toBeNull();
    });
});
