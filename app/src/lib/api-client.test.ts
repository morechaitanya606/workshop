import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    ApiClientError,
    createAdminWorkshop,
    getAdminStats,
    getAdminWorkshop,
    toApiErrorMessage,
    updateAdminWorkshop,
} from "@/lib/api-client";
import type { WorkshopCreateInput, WorkshopUpdateInput } from "@/lib/validators";

function jsonResponse(payload: unknown, status = 200) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
});

describe("toApiErrorMessage", () => {
    it("returns API error message when error is ApiClientError", () => {
        const message = toApiErrorMessage(
            new ApiClientError("Server said no.", 400),
            "Fallback error"
        );
        expect(message).toBe("Server said no.");
    });

    it("returns fallback message for unknown errors", () => {
        const message = toApiErrorMessage(new Error("random"), "Fallback error");
        expect(message).toBe("Fallback error");
    });
});

describe("admin API client methods", () => {
    const accessToken = "test-token";

    it("calls /api/admin/stats with auth header", async () => {
        fetchMock.mockResolvedValueOnce(
            jsonResponse({
                stats: {
                    activeWorkshops: 3,
                    totalBookedSeats: 21,
                    revenue: 9900,
                    avgRating: "4.7",
                },
            })
        );

        const result = await getAdminStats(accessToken);

        expect(result.stats.activeWorkshops).toBe(3);
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/admin/stats",
            expect.objectContaining({
                method: "GET",
                cache: "no-store",
                headers: expect.objectContaining({
                    Authorization: `Bearer ${accessToken}`,
                }),
            })
        );
    });

    it("calls /api/admin/workshops/:id with no-store cache", async () => {
        fetchMock.mockResolvedValueOnce(
            jsonResponse({
                workshop: {
                    id: "w1",
                },
            })
        );

        const result = await getAdminWorkshop(accessToken, "w1");

        expect(result.workshop.id).toBe("w1");
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/admin/workshops/w1",
            expect.objectContaining({
                method: "GET",
                cache: "no-store",
                headers: expect.objectContaining({
                    Authorization: `Bearer ${accessToken}`,
                }),
            })
        );
    });

    it("serializes payload when creating workshop", async () => {
        fetchMock.mockResolvedValueOnce(
            jsonResponse({
                workshop: {
                    id: "w-create",
                },
            })
        );

        const payload: WorkshopCreateInput = {
            title: "Clay Pottery Basics",
            description: "A hands-on beginner pottery workshop with wheel practice and glazing.",
            category: "Pottery",
            price: 1800,
            location: "Koregaon Park Studio",
            city: "Pune",
            duration: "3 hours",
            date: "2026-03-30",
            time: "11:00",
            maxSeats: 12,
            coverImage: "/images/workshops/example.webp",
            galleryImages: ["/images/workshops/example.webp"],
            videoUrl: "",
            socialLinks: {
                instagram: "",
                youtube: "",
                website: "",
            },
            hostName: "Aarav",
            hostBio: "Ceramic artist with 7 years of teaching experience.",
            hostExperience: "7 years",
            hostSocialLinks: {
                instagram: "",
                youtube: "",
                website: "",
            },
            whatYouLearn: ["Wheel control", "Glazing basics"],
            materialsProvided: ["Clay", "Tools"],
            badgeLabels: [],
        };

        await createAdminWorkshop(accessToken, payload);

        expect(fetchMock).toHaveBeenCalledWith(
            "/api/admin/workshops",
            expect.objectContaining({
                method: "POST",
                headers: expect.objectContaining({
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${accessToken}`,
                }),
                body: JSON.stringify(payload),
            })
        );
    });

    it("serializes partial payload when updating workshop", async () => {
        fetchMock.mockResolvedValueOnce(
            jsonResponse({
                workshop: {
                    id: "w-update",
                },
            })
        );

        const payload: WorkshopUpdateInput = {
            title: "Updated title",
            maxSeats: 20,
        };

        await updateAdminWorkshop(accessToken, "w-update", payload);

        expect(fetchMock).toHaveBeenCalledWith(
            "/api/admin/workshops/w-update",
            expect.objectContaining({
                method: "PATCH",
                headers: expect.objectContaining({
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${accessToken}`,
                }),
                body: JSON.stringify(payload),
            })
        );
    });

    it("throws ApiClientError for failed admin request", async () => {
        fetchMock.mockResolvedValueOnce(
            jsonResponse(
                {
                    error: "Admin access denied.",
                },
                403
            )
        );

        await expect(getAdminStats(accessToken)).rejects.toBeInstanceOf(ApiClientError);
    });
});
