import { describe, it, expect, vi } from "vitest";
import { POST } from "./route";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { NextRequest } from "next/server";

vi.mock("@/lib/api-auth", () => ({
    requireAuthenticatedUser: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({
    createSupabaseAnonServerClient: vi.fn(),
}));

describe("POST /api/coupons/validate", () => {
    it("returns 401 if unauthenticated", async () => {
        const mockResponse = { status: 401, json: () => ({ error: "Unauthorized" }) } as any;
        (requireAuthenticatedUser as any).mockResolvedValue({
            ok: false,
            response: mockResponse,
        });

        const req = new NextRequest("http://localhost/api/coupons/validate", {
            method: "POST",
            body: JSON.stringify({ code: "TEST", workshopId: "123", subtotal: 100 }),
        });

        const res = await POST(req);
        expect(res).toBe(mockResponse);
        expect(requireAuthenticatedUser).toHaveBeenCalledWith(req);
    });

    it("proceeds to logic if authenticated", async () => {
        (requireAuthenticatedUser as any).mockResolvedValue({
            ok: true,
            user: { id: "user123" },
            accessToken: "token",
        });

        const req = new NextRequest("http://localhost/api/coupons/validate", {
            method: "POST",
            body: JSON.stringify({}),
        });

        const res = await POST(req);
        // Wait, the real endpoint throws an error because createSupabaseAnonServerClient is mocked.
        // Or it returns status 400 because code is missing.
        const resBody = await res.json();
        expect(res.status).toBe(400);
        expect(resBody).toEqual({ valid: false, message: "Coupon code is required" });
    });
});
