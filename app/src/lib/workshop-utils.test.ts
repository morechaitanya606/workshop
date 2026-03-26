import { describe, expect, it } from "vitest";
import type { Tables } from "@/lib/database.types";
import {
    buildWorkshopInsertPayload,
    mapWorkshopRowToWorkshop,
    queryMockWorkshops,
    sortWorkshops,
} from "@/lib/workshop-utils";

function buildWorkshopRow(overrides: Partial<Tables<"workshops">> = {}): Tables<"workshops"> {
    const row: Tables<"workshops"> = {
        approval_status: "approved",
        id: "workshop-1",
        title: "Ceramics Basics",
        description: "Learn wheel throwing and glazing in one afternoon session.",
        category: "Pottery",
        price: 1800,
        location: "Andheri Studio",
        city: "Mumbai",
        duration: "3h",
        date: "2026-04-20",
        time: "14:00:00",
        max_seats: 12,
        seats_remaining: 8,
        cover_image: "/images/workshops/IMG_20260306_125503.jpg",
        gallery_images: ["/images/workshops/IMG_20260306_125552.png"],
        video_url: "https://example.com/demo.mp4",
        social_links: { instagram: "https://instagram.com/ceramics" },
        host_name: "Anita",
        host_avatar: null,
        host_bio: "Ceramic artist and instructor.",
        host_experience: "10 years",
        host_social_links: { youtube: "https://youtube.com/@anita" },
        what_you_learn: ["Wheel centering"],
        materials_provided: ["Clay", "Apron"],
        badge_labels: null,
        is_bestseller: true,
        is_new: false,
        host_id: null,
        created_by: null,
        host_user_id: null,
        created_at: "2026-03-08T00:00:00Z",
        updated_at: "2026-03-08T00:00:00Z",
        early_bird_enabled: null,
        early_bird_discount_type: null,
        early_bird_discount_value: null,
        early_bird_days_after_listing: null,
        event_address: null,
        latitude: null,
        longitude: null,
        location_images: null,
        ...overrides,
    };

    return {
        ...row,
        host_id: row.host_id ?? null,
        host_user_id: row.host_user_id ?? null,
    };
}

describe("mapWorkshopRowToWorkshop", () => {
    it("maps DB rows into UI workshop shape", () => {
        const mapped = mapWorkshopRowToWorkshop(buildWorkshopRow());

        expect(mapped.id).toBe("workshop-1");
        expect(mapped.time).toBe("14:00");
        expect(mapped.coverImage).toMatch(/\.webp$/);
        expect(mapped.galleryImages[0]).toMatch(/\.webp$/);
        expect(mapped.socialLinks?.instagram).toBe("https://instagram.com/ceramics");
        expect(mapped.hostSocialLinks?.youtube).toBe("https://youtube.com/@anita");
        expect(mapped.hostAvatar).toContain("/images/workshops/IMG-20260306-WA0006.webp");
        expect(mapped.approvalStatus).toBe("approved");
    });

    it("handles legacy rows with missing array fields", () => {
        const mapped = mapWorkshopRowToWorkshop(
            buildWorkshopRow({
                gallery_images: null as any,
                location_images: null as any,
                what_you_learn: null as any,
                materials_provided: null as any,
            })
        );

        expect(mapped.galleryImages).toEqual([]);
        expect(mapped.locationImages).toEqual([]);
        expect(mapped.whatYouLearn).toEqual([]);
        expect(mapped.materialsProvided).toEqual([]);
    });
});

describe("sortWorkshops", () => {
    it("sorts by price descending", () => {
        const items = [
            mapWorkshopRowToWorkshop(buildWorkshopRow({ id: "w1", price: 1200 })),
            mapWorkshopRowToWorkshop(buildWorkshopRow({ id: "w2", price: 2400 })),
            mapWorkshopRowToWorkshop(buildWorkshopRow({ id: "w3", price: 1800 })),
        ];

        const sorted = sortWorkshops(items, "price_desc");
        expect(sorted.map((item: any) => item.id)).toEqual(["w2", "w3", "w1"]);
    });
});

describe("queryMockWorkshops", () => {
    it("matches known category ids against workshop category labels", () => {
        const result = queryMockWorkshops({
            q: "",
            category: "pottery",
            city: "",
            dateFrom: "",
            dateTo: "",
            sort: "date_asc",
            page: 1,
            pageSize: 8,
        });

        expect(result.total).toBeGreaterThan(0);
        expect(result.data.map((item: any) => item.category)).toContain("Pottery");
        expect(result.data.map((item: any) => item.id)).toContain("1");
    });
});

describe("buildWorkshopInsertPayload", () => {
    it("persists badge labels and early bird settings for new workshops", () => {
        const payload = buildWorkshopInsertPayload(
            {
                title: "Late Night Pottery",
                description: "A hands-on studio session for beginners and hobby potters.",
                category: "Pottery",
                price: 2200,
                location: "Bandra Studio",
                city: "Mumbai",
                duration: "2h",
                date: "2026-05-01",
                time: "19:00",
                maxSeats: 16,
                coverImage: "https://example.com/cover.jpg",
                galleryImages: ["https://example.com/gallery-1.jpg"],
                videoUrl: "",
                socialLinks: {
                    instagram: "https://instagram.com/onlyworkshops",
                    youtube: "",
                    website: "",
                },
                hostName: "Mira",
                hostBio: "Ceramic artist and educator.",
                hostExperience: "8 years",
                hostSocialLinks: {
                    instagram: "",
                    youtube: "",
                    website: "",
                },
                whatYouLearn: ["Centering clay"],
                materialsProvided: ["Clay"],
                badgeLabels: ["Beginners welcome", "All materials included"],
                eventAddress: "Bandra West, Mumbai",
                latitude: 19.0596,
                longitude: 72.8295,
                locationImages: ["https://example.com/location-1.jpg"],
                earlyBirdEnabled: true,
                earlyBirdDiscountType: "percentage",
                earlyBirdDiscountValue: 15,
                earlyBirdDaysAfterListing: 3,
            },
            "user-1"
        );

        expect(payload.badge_labels).toEqual(["Beginners welcome", "All materials included"]);
        expect(payload.early_bird_enabled).toBe(true);
        expect(payload.early_bird_discount_type).toBe("percentage");
        expect(payload.early_bird_discount_value).toBe(15);
        expect(payload.early_bird_days_after_listing).toBe(3);
        expect(payload.approval_status).toBe("approved");
    });

    it("normalizes share links for image and video fields before insert", () => {
        const payload = buildWorkshopInsertPayload(
            {
                title: "Creative Friday",
                description:
                    "A mixed-media workshop with guided exercises and a finished take-home piece.",
                category: "Arts & Crafts",
                price: 1600,
                location: "Studio Nine",
                city: "Mumbai",
                duration: "2h",
                date: "2026-05-08",
                time: "18:30",
                maxSeats: 14,
                coverImage: "drive.google.com/file/d/cover456/view?usp=sharing",
                galleryImages: ["www.example.com/gallery-2.jpg"],
                videoUrl: "youtu.be/dQw4w9WgXcQ",
                socialLinks: {
                    instagram: "",
                    youtube: "",
                    website: "",
                },
                hostName: "Naina",
                hostBio: "Mixed-media artist and facilitator.",
                hostExperience: "",
                hostSocialLinks: {
                    instagram: "",
                    youtube: "",
                    website: "",
                },
                whatYouLearn: ["Layering techniques"],
                materialsProvided: ["Canvas"],
                badgeLabels: [],
                eventAddress: "",
                locationImages: ["images/workshops/location.webp"],
                earlyBirdEnabled: false,
                earlyBirdDiscountType: "percentage",
                earlyBirdDiscountValue: 0,
                earlyBirdDaysAfterListing: 0,
            },
            "user-1"
        );

        expect(payload.cover_image).toBe("https://drive.google.com/uc?export=view&id=cover456");
        expect(payload.gallery_images).toEqual(["https://www.example.com/gallery-2.jpg"]);
        expect(payload.video_url).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
        expect(payload.location_images).toEqual(["/images/workshops/location.webp"]);
    });

    it("can mark host-submitted workshops as pending approval", () => {
        const payload = buildWorkshopInsertPayload(
            {
                title: "Late Night Pottery",
                description: "A hands-on studio session for beginners and hobby potters.",
                category: "Pottery",
                price: 2200,
                location: "Bandra Studio",
                city: "Mumbai",
                duration: "2h",
                date: "2026-05-01",
                time: "19:00",
                maxSeats: 16,
                coverImage: "https://example.com/cover.jpg",
                galleryImages: [],
                videoUrl: "",
                socialLinks: {
                    instagram: "",
                    youtube: "",
                    website: "",
                },
                hostName: "Mira",
                hostBio: "Ceramic artist and educator.",
                hostExperience: "",
                hostSocialLinks: {
                    instagram: "",
                    youtube: "",
                    website: "",
                },
                whatYouLearn: ["Centering clay"],
                materialsProvided: ["Clay"],
                badgeLabels: [],
                eventAddress: "",
                locationImages: [],
                earlyBirdEnabled: false,
                earlyBirdDiscountType: "percentage",
                earlyBirdDiscountValue: 0,
                earlyBirdDaysAfterListing: 0,
            },
            "user-1",
            { approvalStatus: "pending" }
        );

        expect(payload.approval_status).toBe("pending");
    });
});
