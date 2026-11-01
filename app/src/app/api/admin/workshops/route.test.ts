import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";
import { requireAdminUser } from "@/lib/api-auth";
import { requireSupabaseService } from "@/lib/api-helpers";
import { assertRateLimit } from "@/lib/rate-limit";
import { readClosedWorkshopIds } from "@/lib/workshop-availability-server";
import { createChainableSupabase } from "@/test/chainable-supabase";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/workshop-library", () => ({ syncWorkshopLibrary: vi.fn() }));
vi.mock("@/lib/workshop-availability-server", () => ({ readClosedWorkshopIds: vi.fn() }));
vi.mock("@/lib/api-auth", async () => {
    const { NextResponse } = await import("next/server");
    return {
        requireAdminUser: vi.fn(),
        jsonError: vi.fn((message: string, status: number) =>
            NextResponse.json({ error: message }, { status })
        ),
    };
});
vi.mock("@/lib/api-helpers", () => ({ requireSupabaseService: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
    assertRateLimit: vi.fn(),
    getRateLimitKey: vi.fn(() => "key"),
}));

function validBody(overrides: Record<string, unknown> = {}) {
    return {
        title: "Pottery for Beginners",
        description: "Learn the wheel and take home a handmade bowl.",
        category: "Pottery",
        price: 1500,
        location: "Studio 12",
        city: "Pune",
        duration: "3 hours",
        maxSeats: 12,
        coverImage: "/images/cover.webp",
        whatYouLearn: ["Centering clay"],
        materialsProvided: ["Clay"],
        hostName: "Asha Rao",
        hostBio: "Potter with ten years of experience.",
        ...overrides,
    };
}

function request(body: unknown) {
    return new NextRequest("http://localhost/api/admin/workshops", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
    });
}

function mockInsert() {
    const insert = vi.fn((rows: Array<Record<string, unknown>>) => ({
        select: vi.fn(async () => ({
            data: rows.map((row) => ({
                created_at: "2099-01-01T00:00:00Z",
                rating: 0,
                review_count: 0,
                ...row,
            })),
            error: null,
        })),
    }));
    vi.mocked(requireSupabaseService).mockReturnValue({
        ok: true,
        client: { from: vi.fn(() => ({ insert })) } as any,
    });
    return insert;
}

describe("GET /api/admin/workshops", () => {
    const ROW = {
        id: "pottery-wheel-1760000000000",
        title: "Pottery",
        created_at: "2099-01-01T00:00:00Z",
        max_seats: 12,
        seats_remaining: 4,
    };

    beforeEach(() => {
        vi.mocked(requireAdminUser).mockResolvedValue({
            ok: true,
            user: { id: "admin-1" } as any,
            accessToken: "token",
            role: "admin",
        } as any);
    });

    it("returns the workshops with the fresh closed ids", async () => {
        const db = createChainableSupabase({ workshops: [{ data: [ROW], error: null }] });
        vi.mocked(requireSupabaseService).mockReturnValue({ ok: true, client: db.client as any });
        vi.mocked(readClosedWorkshopIds).mockResolvedValue({
            ok: true,
            ids: new Set([ROW.id]),
        });

        const response = await GET(new NextRequest("http://localhost/api/admin/workshops"));
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.data).toHaveLength(1);
        expect(body.data[0]).toMatchObject({ id: ROW.id, maxSeats: 12, seatsRemaining: 4 });
        expect(body.closedWorkshopIds).toEqual([ROW.id]);
        expect(body.closedWorkshopIdsOk).toBe(true);
        expect(readClosedWorkshopIds).toHaveBeenCalledWith(db.client);
    });

    it("says so when the closed ids could not be read (never 'nothing closed')", async () => {
        const db = createChainableSupabase({ workshops: [{ data: [ROW], error: null }] });
        vi.mocked(requireSupabaseService).mockReturnValue({ ok: true, client: db.client as any });
        vi.mocked(readClosedWorkshopIds).mockResolvedValue({ ok: false, ids: new Set() });

        const body = await (
            await GET(new NextRequest("http://localhost/api/admin/workshops"))
        ).json();

        expect(body.closedWorkshopIds).toEqual([]);
        expect(body.closedWorkshopIdsOk).toBe(false);
    });

    it("is admin-only", async () => {
        vi.mocked(requireAdminUser).mockResolvedValue({
            ok: false,
            response: new Response(null, { status: 403 }),
        } as any);

        const response = await GET(new NextRequest("http://localhost/api/admin/workshops"));

        expect(response.status).toBe(403);
        expect(readClosedWorkshopIds).not.toHaveBeenCalled();
    });
});

describe("POST /api/admin/workshops", () => {
    beforeEach(() => {
        vi.mocked(requireAdminUser).mockResolvedValue({
            ok: true,
            user: { id: "admin-1" } as any,
            accessToken: "token",
            role: "admin",
        } as any);
        vi.mocked(assertRateLimit).mockResolvedValue({ ok: true } as any);
    });

    it("creates one row per session in a single insert and returns every id", async () => {
        const insert = mockInsert();
        const response = await POST(
            request(
                validBody({
                    sessions: [
                        { date: "2099-06-17", time: "10:00" },
                        { date: "2099-06-10", time: "10:00" },
                        { date: "2099-06-10", time: "15:00", maxSeats: 6 },
                    ],
                })
            )
        );
        const body = await response.json();

        expect(response.status).toBe(201);
        expect(insert).toHaveBeenCalledTimes(1);
        const rows = insert.mock.calls[0][0];
        expect(rows).toHaveLength(3);
        expect(new Set(rows.map((row) => row.id)).size).toBe(3);
        expect(rows.map((row) => row.max_seats)).toEqual([12, 12, 6]);
        expect(rows.every((row) => row.approval_status === "approved")).toBe(true);

        expect(body.ids).toHaveLength(3);
        expect(body.workshops).toHaveLength(3);
        // Earliest session first; `workshop` stays the first one for older clients.
        expect(
            body.workshops.map((w: { date: string; time: string }) => `${w.date} ${w.time}`)
        ).toEqual(["2099-06-10 10:00", "2099-06-10 15:00", "2099-06-17 10:00"]);
        expect(body.workshop.id).toBe(body.ids[0]);
    });

    it("still accepts a single date and time", async () => {
        const insert = mockInsert();
        const response = await POST(request(validBody({ date: "2099-06-10", time: "10:00" })));
        expect(response.status).toBe(201);
        expect(insert.mock.calls[0][0]).toHaveLength(1);
    });

    it("rejects duplicate slots without inserting anything", async () => {
        const insert = mockInsert();
        const response = await POST(
            request(
                validBody({
                    sessions: [
                        { date: "2099-06-10", time: "10:00" },
                        { date: "2099-06-10", time: "10:00" },
                    ],
                })
            )
        );
        expect(response.status).toBe(400);
        expect(insert).not.toHaveBeenCalled();
    });

    it("rejects free-form times such as 7:00 PM", async () => {
        const insert = mockInsert();
        const response = await POST(
            request(validBody({ sessions: [{ date: "2099-06-10", time: "7:00 PM" }] }))
        );
        expect(response.status).toBe(400);
        expect(insert).not.toHaveBeenCalled();
    });
});
