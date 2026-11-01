import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET, PATCH } from "./route";
import { requireAdminUser } from "@/lib/api-auth";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { assertRateLimit } from "@/lib/rate-limit";
import { mirrorImageFields } from "@/lib/image-mirror";
import { revalidateTag } from "next/cache";

vi.mock("@/lib/api-auth", () => ({
    requireAdminUser: vi.fn(),
    jsonError: vi.fn(),
}));

vi.mock("@/lib/image-mirror", () => ({
    mirrorImageFields: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({
    createSupabaseServiceClient: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
    assertRateLimit: vi.fn(),
    getRateLimitKey: vi.fn(() => "settings-test-key"),
}));

vi.mock("@/lib/cached-reads", () => ({
    PLATFORM_SETTINGS_TAG: "platform-settings",
}));

vi.mock("@sentry/nextjs", () => ({
    captureException: vi.fn(),
    captureMessage: vi.fn(),
}));

vi.mock("next/cache", () => ({
    revalidateTag: vi.fn(),
}));

const DB_ERROR = { message: 'relation "platform_settings" violates constraint xyz', code: "23505" };

function patchRequest(body: unknown, { raw }: { raw?: string } = {}) {
    return new NextRequest("http://localhost/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: raw ?? JSON.stringify(body),
    });
}

function mockSupabase({
    selectResult,
    upsertResult,
}: {
    selectResult?: { data: unknown; error: unknown };
    upsertResult?: { error: unknown };
}) {
    const upsert = vi.fn().mockResolvedValue(upsertResult ?? { error: null });
    const select = vi.fn().mockResolvedValue(selectResult ?? { data: [], error: null });
    vi.mocked(createSupabaseServiceClient).mockReturnValue({
        from: vi.fn(() => ({ select, upsert })),
    } as never);
    return { upsert, select };
}

describe("/api/settings", () => {
    beforeEach(async () => {
        const authModule = await import("@/lib/api-auth");
        vi.mocked(authModule.jsonError).mockImplementation(
            (message: string, status = 400, details?: unknown) =>
                NextResponse.json({ error: message, details: details ?? null }, { status })
        );
        vi.mocked(assertRateLimit).mockResolvedValue({ ok: true } as never);
        vi.mocked(requireAdminUser).mockResolvedValue({
            ok: true,
            user: { id: "admin-1" } as never,
            accessToken: "token",
        } as never);
    });

    describe("PATCH", () => {
        it("rejects non-admins without touching the database", async () => {
            vi.mocked(requireAdminUser).mockResolvedValue({
                ok: false,
                response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
            } as never);
            const { upsert } = mockSupabase({});

            const response = await PATCH(patchRequest({ settings: { service_fee: 10 } }));

            expect(response.status).toBe(403);
            expect(upsert).not.toHaveBeenCalled();
        });

        it("rejects unknown keys with 400 and writes nothing", async () => {
            const { upsert } = mockSupabase({});

            const response = await PATCH(
                patchRequest({ settings: { service_fee: 10, razorpay_key_secret: "x" } })
            );

            expect(response.status).toBe(400);
            expect((await response.json()).error).toBe("Unknown setting.");
            expect(upsert).not.toHaveBeenCalled();
            expect(revalidateTag).not.toHaveBeenCalled();
        });

        it("rejects out-of-range and wrong-typed values", async () => {
            const { upsert } = mockSupabase({});

            for (const settings of [
                { service_fee: -5 },
                { service_fee: "49" },
                { whatsapp_community_url: "https://evil.example/join" },
                { whatsapp_community_url: "http://chat.whatsapp.com/AbC" },
                { hero_image_url: "javascript:alert(1)" },
            ]) {
                const response = await PATCH(patchRequest({ settings }));
                expect(response.status).toBe(400);
            }
            expect(upsert).not.toHaveBeenCalled();
        });

        it("returns 400 for malformed JSON and a missing settings object", async () => {
            mockSupabase({});

            expect((await PATCH(patchRequest(null, { raw: "{not json" }))).status).toBe(400);
            expect((await PATCH(patchRequest({}))).status).toBe(400);
            expect((await PATCH(patchRequest({ settings: [] }))).status).toBe(400);
        });

        it("stores the normalised community link and revalidates the cache tag", async () => {
            const { upsert } = mockSupabase({});

            const response = await PATCH(
                patchRequest({
                    settings: {
                        whatsapp_community_url: "  https://chat.whatsapp.com/AbCdEf  ",
                        service_fee: 49,
                    },
                })
            );

            expect(response.status).toBe(200);
            expect(upsert).toHaveBeenCalledTimes(1);
            const rows = upsert.mock.calls[0][0] as Array<{
                setting_key: string;
                setting_value: unknown;
            }>;
            expect(rows.map((row) => [row.setting_key, row.setting_value])).toEqual([
                ["whatsapp_community_url", "https://chat.whatsapp.com/AbCdEf"],
                ["service_fee", 49],
            ]);
            expect(revalidateTag).toHaveBeenCalledWith("platform-settings");
        });

        it("clears the community link when the value is empty", async () => {
            const { upsert } = mockSupabase({});

            const response = await PATCH(
                patchRequest({ settings: { whatsapp_community_url: "" } })
            );

            expect(response.status).toBe(200);
            const rows = upsert.mock.calls[0][0] as Array<{ setting_value: unknown }>;
            expect(rows[0].setting_value).toBe("");
        });

        it.each([
            ["closed_workshop_ids", ["pottery-wheel-1760000000000"]],
            ["closed_workshop_ids", []],
            ["coupon_offers", { "11111111-2222-4333-8444-555555555555": { visibility: "auto" } }],
        ])(
            "refuses %s (only its dedicated route writes it) and writes nothing",
            async (key, value) => {
                const { upsert } = mockSupabase({});

                const response = await PATCH(
                    patchRequest({ settings: { service_fee: 49, [key]: value } })
                );
                const body = await response.json();

                expect(response.status).toBe(400);
                expect(body.details).toEqual({ field: key });
                expect(upsert).not.toHaveBeenCalled();
                expect(revalidateTag).not.toHaveBeenCalled();
            }
        );

        it("still saves the other settings the settings page sends", async () => {
            const { upsert } = mockSupabase({});

            const response = await PATCH(
                patchRequest({
                    settings: {
                        service_fee: 49,
                        whatsapp_community_message: "Join us",
                        cafe_partners: [],
                    },
                })
            );

            expect(response.status).toBe(200);
            const rows = upsert.mock.calls[0][0] as Array<{ setting_key: string }>;
            expect(rows.map((row) => row.setting_key)).toEqual([
                "service_fee",
                "whatsapp_community_message",
                "cafe_partners",
            ]);
        });

        it("copies the hero image and every pasted partner logo in two batches, however many logos", async () => {
            // Same contract as the real helper: swaps each string (or each item of an array).
            vi.mocked(mirrorImageFields).mockImplementation(async (data, fields) => {
                const record = data as Record<string, unknown>;
                for (const field of fields as string[]) {
                    const value = record[field];
                    const copy = (item: unknown) =>
                        typeof item === "string" ? `${item}#copied` : item;
                    record[field] = Array.isArray(value) ? value.map(copy) : copy(value);
                }
            });
            const { upsert } = mockSupabase({});
            const partner = (id: string) => ({
                id,
                name: `Partner ${id}`,
                logo_url: `https://drive.google.com/uc?id=${id}`,
            });

            const response = await PATCH(
                patchRequest({
                    settings: {
                        hero_image_url: "https://drive.google.com/uc?id=hero",
                        cafe_partners: [partner("a"), partner("b"), partner("c")],
                    },
                })
            );

            expect(response.status).toBe(200);
            // Not one call per partner: one for the hero, one for all the logos.
            expect(mirrorImageFields).toHaveBeenCalledTimes(2);
            const logoCall = vi
                .mocked(mirrorImageFields)
                .mock.calls.find(([, fields]) => fields[0] === "logo_url");
            expect(logoCall?.[0]).toEqual({
                logo_url: [
                    "https://drive.google.com/uc?id=a#copied",
                    "https://drive.google.com/uc?id=b#copied",
                    "https://drive.google.com/uc?id=c#copied",
                ],
            });
            const rows = upsert.mock.calls[0][0] as Array<{
                setting_key: string;
                setting_value: unknown;
            }>;
            const stored = Object.fromEntries(
                rows.map((row) => [row.setting_key, row.setting_value])
            );
            expect(stored.hero_image_url).toBe("https://drive.google.com/uc?id=hero#copied");
            expect(
                (stored.cafe_partners as Array<{ id: string; logo_url: string }>).map((item) => [
                    item.id,
                    item.logo_url,
                ])
            ).toEqual([
                ["a", "https://drive.google.com/uc?id=a#copied"],
                ["b", "https://drive.google.com/uc?id=b#copied"],
                ["c", "https://drive.google.com/uc?id=c#copied"],
            ]);
        });

        it("never echoes the raw database error", async () => {
            mockSupabase({ upsertResult: { error: DB_ERROR } });

            const response = await PATCH(patchRequest({ settings: { service_fee: 49 } }));
            const body = JSON.stringify(await response.json());

            expect(response.status).toBe(500);
            expect(body).not.toContain("platform_settings");
            expect(body).not.toContain("violates constraint");
            expect(revalidateTag).not.toHaveBeenCalled();
        });
    });

    describe("GET", () => {
        it("returns only public keys", async () => {
            mockSupabase({
                selectResult: {
                    data: [
                        { setting_key: "service_fee", setting_value: 49 },
                        {
                            setting_key: "whatsapp_community_url",
                            setting_value: "https://chat.whatsapp.com/AbC",
                        },
                        { setting_key: "internal_secret", setting_value: "do-not-leak" },
                    ],
                    error: null,
                },
            });

            const response = await GET(new NextRequest("http://localhost/api/settings"));
            const body = await response.json();

            expect(response.status).toBe(200);
            expect(body.settings).toEqual({
                service_fee: 49,
                whatsapp_community_url: "https://chat.whatsapp.com/AbC",
            });
        });

        it("never echoes the raw database error", async () => {
            mockSupabase({ selectResult: { data: null, error: DB_ERROR } });

            const response = await GET(new NextRequest("http://localhost/api/settings"));
            const body = JSON.stringify(await response.json());

            expect(response.status).toBe(500);
            expect(body).not.toContain("platform_settings");
        });
    });
});
