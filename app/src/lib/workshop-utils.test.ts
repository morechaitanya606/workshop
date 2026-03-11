import { describe, expect, it } from "vitest";
import type { DbTable } from "@/lib/database.types";
import { mapWorkshopRowToWorkshop, sortWorkshops } from "@/lib/workshop-utils";

function buildWorkshopRow(overrides: Partial<DbTable<"workshops">> = {}): DbTable<"workshops"> {
    const row: DbTable<"workshops"> = {
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
        is_bestseller: true,
        is_new: false,
        host_id: null,
        created_by: null,
        host_user_id: null,
        created_at: "2026-03-08T00:00:00Z",
        updated_at: "2026-03-08T00:00:00Z",
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
        expect(sorted.map((item) => item.id)).toEqual(["w2", "w3", "w1"]);
    });
});
