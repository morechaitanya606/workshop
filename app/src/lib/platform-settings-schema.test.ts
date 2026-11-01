import { describe, expect, it } from "vitest";

import {
    PUBLIC_SETTING_KEYS,
    WHATSAPP_COMMUNITY_MESSAGE_MAX_LENGTH,
    WRITABLE_SETTING_KEYS,
    pickPublicSettings,
    sanitizeWhatsAppCommunityUrl,
    validateSettingsPatch,
    validateWhatsAppCommunityMessage,
    validateWhatsAppCommunityUrl,
} from "./platform-settings-schema";

describe("validateWhatsAppCommunityUrl", () => {
    it.each([
        "https://chat.whatsapp.com/AbCdEf123456",
        "https://wa.me/917028478109",
        "https://whatsapp.com/channel/0029Vabc",
        "https://www.whatsapp.com/channel/0029Vabc",
        "https://CHAT.WHATSAPP.COM/AbCdEf123456",
    ])("accepts %s", (url) => {
        expect(validateWhatsAppCommunityUrl(url)).toEqual({ ok: true, value: url });
    });

    it("trims surrounding whitespace", () => {
        expect(validateWhatsAppCommunityUrl("  https://chat.whatsapp.com/AbC  ")).toEqual({
            ok: true,
            value: "https://chat.whatsapp.com/AbC",
        });
    });

    it.each(["", "   ", null, undefined])("treats %p as clearing the link", (value) => {
        expect(validateWhatsAppCommunityUrl(value)).toEqual({ ok: true, value: "" });
    });

    it.each([
        ["http link", "http://chat.whatsapp.com/AbC"],
        ["other host", "https://example.com/AbC"],
        ["look-alike suffix", "https://chat.whatsapp.com.evil.com/AbC"],
        ["look-alike prefix", "https://evilwhatsapp.com/AbC"],
        ["subdomain trick with credentials", "https://chat.whatsapp.com@evil.com/AbC"],
        ["credentials", "https://user:pw@chat.whatsapp.com/AbC"],
        ["custom port", "https://chat.whatsapp.com:8443/AbC"],
        ["javascript scheme", "javascript:alert(1)"],
        ["data scheme", "data:text/html,<script>alert(1)</script>"],
        ["bare host (dead link)", "https://chat.whatsapp.com/"],
        ["not a url", "join our whatsapp"],
        ["embedded whitespace", "https://chat.whatsapp.com/Ab C"],
        ["embedded newline", "https://chat.whatsapp.com/Ab\nC"],
        ["too long", `https://chat.whatsapp.com/${"a".repeat(600)}`],
    ])("rejects %s", (_label, url) => {
        expect(validateWhatsAppCommunityUrl(url).ok).toBe(false);
    });

    it("rejects non-string values", () => {
        expect(validateWhatsAppCommunityUrl(42).ok).toBe(false);
        expect(validateWhatsAppCommunityUrl({}).ok).toBe(false);
    });
});

describe("sanitizeWhatsAppCommunityUrl", () => {
    it("returns the link when valid and null otherwise", () => {
        expect(sanitizeWhatsAppCommunityUrl("https://chat.whatsapp.com/AbC")).toBe(
            "https://chat.whatsapp.com/AbC"
        );
        expect(sanitizeWhatsAppCommunityUrl("")).toBeNull();
        expect(sanitizeWhatsAppCommunityUrl(undefined)).toBeNull();
        expect(sanitizeWhatsAppCommunityUrl("https://evil.example/x")).toBeNull();
    });
});

describe("validateWhatsAppCommunityMessage", () => {
    it("trims, allows empty and enforces the length cap", () => {
        expect(validateWhatsAppCommunityMessage("  hello  ")).toEqual({ ok: true, value: "hello" });
        expect(validateWhatsAppCommunityMessage("")).toEqual({ ok: true, value: "" });
        expect(
            validateWhatsAppCommunityMessage("a".repeat(WHATSAPP_COMMUNITY_MESSAGE_MAX_LENGTH + 1))
                .ok
        ).toBe(false);
        expect(validateWhatsAppCommunityMessage(7).ok).toBe(false);
    });
});

describe("validateSettingsPatch", () => {
    it("accepts the payload the admin page sends today", () => {
        const result = validateSettingsPatch({
            service_fee: 99,
            hero_image_url: "/images/background.webp",
            special_page: {
                enabled: true,
                path: "/workshop/summer-family-retreat",
                title: "Summer Family Retreat",
                description: "A special outing.",
                badge: "Special Event",
                cta_label: "Discover More",
                visible_until: "2026-05-09",
            },
            whatsapp_community_url: "https://chat.whatsapp.com/AbC",
            whatsapp_community_message: "",
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(Object.keys(result.values)).toEqual([
                "service_fee",
                "hero_image_url",
                "special_page",
                "whatsapp_community_url",
                "whatsapp_community_message",
            ]);
        }
    });

    it("rejects unknown keys and names the key", () => {
        expect(validateSettingsPatch({ admin_password: "x" })).toEqual({
            ok: false,
            error: "Unknown setting.",
            key: "admin_password",
        });
    });

    it("rejects one bad key without applying the rest", () => {
        const result = validateSettingsPatch({ service_fee: 10, bogus: true });
        expect(result.ok).toBe(false);
    });

    it.each([null, [], "text", 5])("rejects a non-object payload (%p)", (payload) => {
        expect(validateSettingsPatch(payload).ok).toBe(false);
    });

    it("rejects an empty object", () => {
        expect(validateSettingsPatch({}).ok).toBe(false);
    });

    it.each([
        ["negative", -1],
        ["too large", 100_001],
        ["string", "49"],
        ["NaN", Number.NaN],
        ["Infinity", Number.POSITIVE_INFINITY],
        ["null", null],
    ])("rejects a service_fee that is %s", (_label, value) => {
        expect(validateSettingsPatch({ service_fee: value }).ok).toBe(false);
    });

    it("accepts service_fee boundaries 0 and 100000", () => {
        expect(validateSettingsPatch({ service_fee: 0 }).ok).toBe(true);
        expect(validateSettingsPatch({ service_fee: 100_000 }).ok).toBe(true);
    });

    it.each(["javascript:alert(1)", "//evil.example/x.png", "http://insecure.example/x.png"])(
        "rejects hero_image_url %s",
        (value) => {
            expect(validateSettingsPatch({ hero_image_url: value }).ok).toBe(false);
        }
    );

    it("allows clearing hero_image_url and https URLs", () => {
        expect(validateSettingsPatch({ hero_image_url: "" }).ok).toBe(true);
        expect(validateSettingsPatch({ hero_image_url: "https://cdn.example/x.webp" }).ok).toBe(
            true
        );
    });

    it("validates and normalises the community link", () => {
        const ok = validateSettingsPatch({ whatsapp_community_url: "  https://wa.me/123  " });
        expect(ok).toEqual({ ok: true, values: { whatsapp_community_url: "https://wa.me/123" } });

        const cleared = validateSettingsPatch({ whatsapp_community_url: "" });
        expect(cleared).toEqual({ ok: true, values: { whatsapp_community_url: "" } });

        expect(validateSettingsPatch({ whatsapp_community_url: "https://evil.example/" }).ok).toBe(
            false
        );
    });

    it("rejects unknown fields inside special_page", () => {
        expect(validateSettingsPatch({ special_page: { enabled: true, evil: 1 } }).ok).toBe(false);
        expect(validateSettingsPatch({ special_page: { visible_until: "tomorrow" } }).ok).toBe(
            false
        );
        expect(validateSettingsPatch({ special_page: { path: "//evil.example" } }).ok).toBe(false);
    });

    it("validates cafe partners", () => {
        const good = [{ id: "a-1", name: "Cafe A", logo_url: "https://cdn.example/a.png" }];
        expect(validateSettingsPatch({ cafe_partners: good }).ok).toBe(true);
        expect(validateSettingsPatch({ cafe_partners: [] }).ok).toBe(true);
        expect(validateSettingsPatch({ cafe_partners: "nope" }).ok).toBe(false);
        expect(
            validateSettingsPatch({
                cafe_partners: [{ id: "a", name: "A", logo_url: "javascript:1" }],
            }).ok
        ).toBe(false);
        expect(
            validateSettingsPatch({
                cafe_partners: [{ id: "a", name: "A", logo_url: "/x.png", x: 1 }],
            }).ok
        ).toBe(false);
    });

    it("validates early_bird_offer ranges", () => {
        const base = {
            enabled: true,
            discount_type: "percentage",
            discount_value: 10,
            days_before: 7,
        };
        expect(validateSettingsPatch({ early_bird_offer: base }).ok).toBe(true);
        expect(
            validateSettingsPatch({ early_bird_offer: { ...base, discount_value: 150 } }).ok
        ).toBe(false);
        expect(
            validateSettingsPatch({ early_bird_offer: { ...base, discount_type: "free" } }).ok
        ).toBe(false);
        expect(validateSettingsPatch({ early_bird_offer: { ...base, days_before: 1.5 } }).ok).toBe(
            false
        );
    });

    it("accepts coupon_offers from admins and stores the normalised value", () => {
        const couponId = "11111111-1111-4111-8111-111111111111";
        expect(
            validateSettingsPatch({
                coupon_offers: {
                    [couponId.toUpperCase()]: {
                        visibility: "auto",
                        label: " Limited-time offer ",
                        show_end_date: true,
                    },
                },
            })
        ).toEqual({
            ok: true,
            values: {
                coupon_offers: {
                    [couponId]: {
                        visibility: "auto",
                        label: "Limited-time offer",
                        show_end_date: true,
                    },
                },
            },
        });
    });

    it("rejects malformed coupon_offers and names the key", () => {
        expect(
            validateSettingsPatch({
                coupon_offers: { "not-a-coupon-id": { visibility: "auto" } },
            })
        ).toMatchObject({ ok: false, key: "coupon_offers" });
        expect(validateSettingsPatch({ coupon_offers: [] }).ok).toBe(false);
    });

    it("never lets a coupon code into coupon_offers (the table is readable with the anon key)", () => {
        const couponId = "11111111-1111-4111-8111-111111111111";
        expect(
            validateSettingsPatch({
                coupon_offers: { [couponId]: { visibility: "community", code: "WHATSAPP15" } },
            })
        ).toMatchObject({ ok: false, key: "coupon_offers" });
    });

    it("accepts closed_workshop_ids as a list of workshop ids, trimmed and de-duplicated", () => {
        expect(
            validateSettingsPatch({
                closed_workshop_ids: [
                    " pottery-wheel-1760000000000 ",
                    "pottery-wheel-1760000000000",
                    "11111111-1111-4111-8111-111111111111",
                ],
            })
        ).toEqual({
            ok: true,
            values: {
                closed_workshop_ids: [
                    "pottery-wheel-1760000000000",
                    "11111111-1111-4111-8111-111111111111",
                ],
            },
        });
        expect(validateSettingsPatch({ closed_workshop_ids: [] })).toEqual({
            ok: true,
            values: { closed_workshop_ids: [] },
        });
    });

    it.each([
        ["an object", { "pottery-1": true }],
        ["text", "pottery-1"],
        ["null", null],
        ["a number id", [42]],
        ["an empty id", [""]],
        ["an id with spaces", ["pottery 1"]],
        ["an id with a comma", ["a,b"]],
        ["a long id", ["x".repeat(121)]],
        ["too many ids", Array.from({ length: 501 }, (_, index) => `workshop-${index}`)],
    ])("rejects closed_workshop_ids that is %s", (_label, value) => {
        expect(validateSettingsPatch({ closed_workshop_ids: value })).toMatchObject({
            ok: false,
            key: "closed_workshop_ids",
        });
    });
});

describe("pickPublicSettings", () => {
    it("drops keys that are not on the public allowlist", () => {
        const picked = pickPublicSettings({
            service_fee: 49,
            whatsapp_community_url: "https://chat.whatsapp.com/AbC",
            razorpay_webhook_secret: "shh",
            internal_note: "private",
        });

        expect(picked).toEqual({
            service_fee: 49,
            whatsapp_community_url: "https://chat.whatsapp.com/AbC",
        });
    });

    it("blanks a stored community link that no longer validates", () => {
        expect(pickPublicSettings({ whatsapp_community_url: "javascript:alert(1)" })).toEqual({
            whatsapp_community_url: "",
        });
    });

    it("sends closed_workshop_ids to visitors, reduced to valid ids", () => {
        expect(WRITABLE_SETTING_KEYS).toContain("closed_workshop_ids");
        expect(PUBLIC_SETTING_KEYS).toContain("closed_workshop_ids");
        expect(
            pickPublicSettings({
                closed_workshop_ids: ["pottery-1", 7, "bad id", "pottery-1", "baking-2"],
            })
        ).toEqual({ closed_workshop_ids: ["pottery-1", "baking-2"] });
        expect(pickPublicSettings({ closed_workshop_ids: "garbage" })).toEqual({
            closed_workshop_ids: [],
        });
        expect(pickPublicSettings({ service_fee: 99 })).toEqual({ service_fee: 99 });
    });

    it("handles null and empty records", () => {
        expect(pickPublicSettings(null)).toEqual({});
        expect(pickPublicSettings({})).toEqual({});
    });

    it("keeps the public list inside the writable list", () => {
        for (const key of PUBLIC_SETTING_KEYS) {
            expect(WRITABLE_SETTING_KEYS).toContain(key);
        }
    });

    it("keeps coupon_offers out of the app's public payloads (it holds no codes)", () => {
        expect(WRITABLE_SETTING_KEYS).toContain("coupon_offers");
        expect(PUBLIC_SETTING_KEYS as readonly string[]).not.toContain("coupon_offers");
        expect(
            pickPublicSettings({
                service_fee: 99,
                coupon_offers: {
                    "11111111-1111-4111-8111-111111111111": { visibility: "community" },
                },
            })
        ).toEqual({ service_fee: 99 });
    });
});
