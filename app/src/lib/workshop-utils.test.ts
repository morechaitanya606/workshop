import { describe, expect, it } from "vitest";
import type { Workshop } from "@/lib/data";
import { workshopCreateSchema } from "@/lib/validators";
import {
    buildWorkshopInsertPayloads,
    dedupeWorkshopsForReuse,
    getCategorySelectionState,
    mapWorkshopToFormPrefill,
    sortWorkshopsBySession,
} from "@/lib/workshop-utils";

function parseCreate(
    sessions: Array<Record<string, unknown>>,
    extra: Record<string, unknown> = {}
) {
    const result = workshopCreateSchema.safeParse({
        title: "Pottery for Beginners!",
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
        sessions,
        ...extra,
    });
    if (!result.success) throw new Error(JSON.stringify(result.error.issues));
    return result.data;
}

describe("buildWorkshopInsertPayloads", () => {
    it("creates one row per session with identical details and unique ids", () => {
        const input = parseCreate([
            { date: "2099-06-10", time: "10:00" },
            { date: "2099-06-10", time: "15:00", maxSeats: 6 },
            { date: "2099-06-17", time: "10:00" },
        ]);
        const rows = buildWorkshopInsertPayloads(
            input,
            "user-1",
            { approvalStatus: "pending" },
            1234
        );

        expect(rows).toHaveLength(3);
        expect(new Set(rows.map((row) => row.id)).size).toBe(3);
        expect(rows.map((row) => row.id)).toEqual([
            "pottery-for-beginners-1234-20990610-1000",
            "pottery-for-beginners-1234-20990610-1500",
            "pottery-for-beginners-1234-20990617-1000",
        ]);
        expect(rows.map((row) => [row.date, row.time])).toEqual([
            ["2099-06-10", "10:00"],
            ["2099-06-10", "15:00"],
            ["2099-06-17", "10:00"],
        ]);
        expect(rows.map((row) => [row.max_seats, row.seats_remaining])).toEqual([
            [12, 12],
            [6, 6],
            [12, 12],
        ]);
        for (const row of rows) {
            expect(row.title).toBe(rows[0].title);
            expect(row.description).toBe(rows[0].description);
            expect(row.price).toBe(1500);
            expect(row.approval_status).toBe("pending");
            expect(row.host_user_id).toBe("user-1");
        }
    });

    it("keeps the historical id format for a single session", () => {
        const input = parseCreate([{ date: "2099-06-10", time: "10:00" }]);
        const [row] = buildWorkshopInsertPayloads(input, "user-1", {}, 99);
        expect(row.id).toBe("pottery-for-beginners-99");
        expect(row.approval_status).toBe("approved");
    });
});

const source: Workshop = {
    id: "w-1",
    title: "Pottery for Beginners",
    description: "Learn the wheel.",
    category: "Pottery",
    price: 1500,
    location: "Studio 12",
    city: "Pune",
    duration: "3 hours",
    date: "2026-03-01",
    time: "10:00",
    maxSeats: 12,
    seatsRemaining: 3,
    coverImage: "/images/cover.webp",
    galleryImages: ["/images/a.webp", "/images/b.webp"],
    videoUrl: "https://youtube.com/watch?v=1",
    rating: 4.8,
    reviewCount: 22,
    hostName: "Asha Rao",
    hostAvatar: "/images/icon.png",
    hostBio: "Potter.",
    hostExperience: "10 years",
    hostSocialLinks: { instagram: "https://instagram.com/asha" },
    socialLinks: { website: "https://example.com" },
    whatYouLearn: ["Centering clay", "Trimming"],
    materialsProvided: ["Clay"],
    badgeLabels: ["Beginners welcome"],
    isNew: true,
    isBestseller: true,
    eventAddress: "12 MG Road",
    latitude: 18.5204,
    longitude: 73.8567,
    locationImages: ["/images/loc.webp"],
    earlyBirdEnabled: true,
    earlyBirdDiscountType: "fixed",
    earlyBirdDiscountValue: 200,
    earlyBirdDaysAfterListing: 2,
    createdAt: "2026-02-01T00:00:00Z",
    approvalStatus: "approved",
};

describe("mapWorkshopToFormPrefill", () => {
    it("copies the reusable details as form strings", () => {
        const prefill = mapWorkshopToFormPrefill(source);
        expect(prefill).toMatchObject({
            title: "Pottery for Beginners",
            category: "Pottery",
            price: "1500",
            location: "Studio 12",
            city: "Pune",
            duration: "3 hours",
            maxSeats: "12",
            coverImage: "/images/cover.webp",
            galleryImages: "/images/a.webp\n/images/b.webp",
            videoUrl: "https://youtube.com/watch?v=1",
            instagramLink: "",
            websiteLink: "https://example.com",
            hostInstagram: "https://instagram.com/asha",
            hostName: "Asha Rao",
            hostExperience: "10 years",
            whatYouLearn: "Centering clay\nTrimming",
            materialsProvided: "Clay",
            badgeLabels: "Beginners welcome",
            eventAddress: "12 MG Road",
            latitude: "18.5204",
            longitude: "73.8567",
            locationImages: "/images/loc.webp",
            earlyBirdEnabled: "true",
            earlyBirdDiscountType: "fixed",
            earlyBirdDiscountValue: "200",
            earlyBirdDaysAfterListing: "2",
        });
    });

    it("does not copy date, time, seat counters, rating, approval or ids", () => {
        const prefill = mapWorkshopToFormPrefill(source) as Record<string, unknown>;
        for (const key of [
            "id",
            "date",
            "time",
            "sessions",
            "seatsRemaining",
            "rating",
            "reviewCount",
            "approvalStatus",
            "isNew",
            "isBestseller",
            "createdAt",
        ]) {
            expect(prefill).not.toHaveProperty(key);
        }
    });

    it("produces a payload the create schema accepts once slots are added", () => {
        const prefill = mapWorkshopToFormPrefill(source);
        const parsed = workshopCreateSchema.safeParse({
            title: prefill.title,
            description: "Learn the wheel and take home a handmade bowl.",
            category: prefill.category,
            price: Number(prefill.price),
            location: prefill.location,
            city: prefill.city,
            duration: prefill.duration,
            maxSeats: Number(prefill.maxSeats),
            coverImage: prefill.coverImage,
            galleryImages: prefill.galleryImages.split("\n"),
            whatYouLearn: prefill.whatYouLearn.split("\n"),
            materialsProvided: prefill.materialsProvided.split("\n"),
            hostName: prefill.hostName,
            hostBio: "Potter with ten years of experience.",
            sessions: [{ date: "2099-06-10", time: "10:00" }],
        });
        expect(parsed.success).toBe(true);
    });

    it("handles sparse workshops", () => {
        const prefill = mapWorkshopToFormPrefill({
            ...source,
            videoUrl: undefined,
            hostExperience: undefined,
            hostSocialLinks: undefined,
            socialLinks: undefined,
            badgeLabels: undefined,
            eventAddress: undefined,
            latitude: undefined,
            longitude: undefined,
            locationImages: undefined,
            earlyBirdEnabled: false,
            earlyBirdDiscountValue: 0,
            earlyBirdDaysAfterListing: 0,
        });
        expect(prefill.videoUrl).toBe("");
        expect(prefill.latitude).toBe("");
        expect(prefill.badgeLabels).toBe("");
        expect(prefill.earlyBirdEnabled).toBe("false");
        expect(prefill.earlyBirdDiscountValue).toBe("");
    });
});

describe("getCategorySelectionState", () => {
    it("selects a known category or falls back to Other with the custom text", () => {
        const labels = ["Pottery", "Baking"];
        expect(getCategorySelectionState("Pottery", labels)).toEqual({
            selection: "Pottery",
            custom: "",
        });
        expect(getCategorySelectionState(" Calligraphy ", labels)).toEqual({
            selection: "__other__",
            custom: "Calligraphy",
        });
        expect(getCategorySelectionState("", labels)).toEqual({ selection: "", custom: "" });
    });
});

describe("dedupeWorkshopsForReuse", () => {
    it("collapses sessions of the same workshop and sorts newest first", () => {
        const make = (id: string, title: string, createdAt: string, date: string): Workshop => ({
            ...source,
            id,
            title,
            createdAt,
            date,
        });
        const result = dedupeWorkshopsForReuse([
            make("a-1", "Pottery", "2026-01-01T00:00:00Z", "2026-02-01"),
            make("b-1", "Baking", "2026-03-01T00:00:00Z", "2026-04-01"),
            make("a-2", "pottery ", "2026-02-01T00:00:00Z", "2026-02-08"),
        ]);
        expect(result.map((item) => [item.id, item.sessionCount])).toEqual([
            ["b-1", 1],
            ["a-2", 2],
        ]);
    });
});

describe("sortWorkshopsBySession", () => {
    it("orders by date then time without mutating", () => {
        const list = [
            { ...source, id: "c", date: "2099-01-02", time: "09:00" },
            { ...source, id: "b", date: "2099-01-01", time: "15:00" },
            { ...source, id: "a", date: "2099-01-01", time: "10:00" },
        ];
        expect(sortWorkshopsBySession(list).map((item) => item.id)).toEqual(["a", "b", "c"]);
        expect(list[0].id).toBe("c");
    });
});
