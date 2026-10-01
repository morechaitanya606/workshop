import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { requireHostOrAdmin } from "@/lib/api-auth";
import { requireSupabaseService } from "@/lib/api-helpers";
import { assertRateLimit } from "@/lib/rate-limit";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/api-auth", async () => {
    const { NextResponse } = await import("next/server");
    return {
        requireHostOrAdmin: vi.fn(),
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
    return new NextRequest("http://localhost/api/host/workshops", {
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

function authAs(role: "host" | "admin") {
    vi.mocked(requireHostOrAdmin).mockResolvedValue({
        ok: true,
        user: { id: "user-1" } as any,
        accessToken: "token",
        role,
    } as any);
}

describe("POST /api/host/workshops", () => {
    beforeEach(() => {
        vi.mocked(assertRateLimit).mockResolvedValue({ ok: true } as any);
    });

    it("creates one pending row per session for a host", async () => {
        authAs("host");
        const insert = mockInsert();
        const response = await POST(
            request(
                validBody({
                    sessions: [
                        { date: "2099-06-10", time: "10:00" },
                        { date: "2099-06-11", time: "10:00" },
                    ],
                })
            )
        );
        const body = await response.json();

        expect(response.status).toBe(201);
        expect(insert).toHaveBeenCalledTimes(1);
        const rows = insert.mock.calls[0][0];
        expect(rows).toHaveLength(2);
        expect(rows.every((row) => row.approval_status === "pending")).toBe(true);
        expect(rows.every((row) => row.host_user_id === "user-1")).toBe(true);
        expect(new Set(rows.map((row) => row.id)).size).toBe(2);
        expect(body.ids).toHaveLength(2);
        expect(body.message).toContain("2 workshop sessions submitted for admin approval");
    });

    it("auto-approves rows created by an admin through the host endpoint", async () => {
        authAs("admin");
        const insert = mockInsert();
        const response = await POST(request(validBody({ date: "2099-06-10", time: "10:00" })));
        expect(response.status).toBe(201);
        expect(insert.mock.calls[0][0][0].approval_status).toBe("approved");
    });

    it("rejects a past session without inserting", async () => {
        authAs("host");
        const insert = mockInsert();
        const response = await POST(
            request(validBody({ sessions: [{ date: "2020-01-01", time: "10:00" }] }))
        );
        expect(response.status).toBe(400);
        expect(insert).not.toHaveBeenCalled();
    });
});
