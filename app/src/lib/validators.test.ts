import { describe, expect, it } from "vitest";
import {
    bookingCheckoutSchema,
    bookingHoldSchema,
    communityCreateSchema,
    communityJoinSchema,
    workshopCreateSchema,
    workshopFeedbackSchema,
    workshopUpdateSchema,
} from "@/lib/validators";

describe("bookingHoldSchema", () => {
    it("accepts valid hold payload", () => {
        const parsed = bookingHoldSchema.safeParse({
            workshopId: "workshop-1",
            guests: 2,
        });

        expect(parsed.success).toBe(true);
    });

    it("rejects invalid guests", () => {
        const parsed = bookingHoldSchema.safeParse({
            workshopId: "workshop-1",
            guests: 0,
        });

        expect(parsed.success).toBe(false);
    });
});

describe("bookingCheckoutSchema", () => {
    const basePayload = {
        holdId: "9f762c60-855c-4a6f-b2b6-470f62f2f04d",
        workshopId: "workshop-1",
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.com",
        phone: "1234567890",
    };

    it("accepts payload without razorpay fields during order creation", () => {
        const parsed = bookingCheckoutSchema.safeParse(basePayload);
        expect(parsed.success).toBe(true);
    });

    it("rejects partial razorpay confirmation fields", () => {
        const parsed = bookingCheckoutSchema.safeParse({
            ...basePayload,
            razorpayOrderId: "order_123",
        });
        expect(parsed.success).toBe(false);
    });

    it("accepts all razorpay fields together", () => {
        const parsed = bookingCheckoutSchema.safeParse({
            ...basePayload,
            razorpayOrderId: "order_123",
            razorpayPaymentId: "pay_123",
            razorpaySignature: "sig_123",
        });
        expect(parsed.success).toBe(true);
    });
});

describe("workshopFeedbackSchema", () => {
    it("accepts feedback with media", () => {
        const parsed = workshopFeedbackSchema.safeParse({
            rating: 5,
            comment: "Amazing host and clear instructions.",
            photos: ["/media/review-1.png"],
            videoUrl: "https://youtube.com/watch?v=abc123",
        });
        expect(parsed.success).toBe(true);
    });

    it("rejects comment that is too short", () => {
        const parsed = workshopFeedbackSchema.safeParse({
            rating: 5,
            comment: "ok",
        });
        expect(parsed.success).toBe(false);
    });
});

describe("workshopUpdateSchema", () => {
    it("accepts newer admin workshop fields for editing", () => {
        const parsed = workshopUpdateSchema.safeParse({
            hostName: "Mira",
            hostBio: "Ceramic artist and educator.",
            hostExperience: "8 years",
            socialLinks: {
                instagram: "https://instagram.com/onlyworkshops",
                youtube: "",
                website: "",
            },
            hostSocialLinks: {
                instagram: "",
                youtube: "https://youtube.com/@mira",
                website: "",
            },
            whatYouLearn: ["Centering clay", "Shaping a mug"],
            materialsProvided: ["Clay", "Apron"],
            earlyBirdEnabled: true,
            earlyBirdDiscountType: "percentage",
            earlyBirdDiscountValue: 10,
            earlyBirdDaysAfterListing: 2,
        });

        expect(parsed.success).toBe(true);
    });

    it("normalizes bare social and media URLs for workshop forms", () => {
        const parsed = workshopUpdateSchema.safeParse({
            coverImage: "drive.google.com/file/d/abc123/view?usp=sharing",
            videoUrl: "youtu.be/dQw4w9WgXcQ",
            socialLinks: {
                instagram: "www.instagram.com/onlyworkshops",
                youtube: "",
                website: "onlyworkshops.in",
            },
            hostSocialLinks: {
                instagram: "",
                youtube: "youtube.com/@mira",
                website: "",
            },
        });

        expect(parsed.success).toBe(true);
        if (!parsed.success) return;

        expect(parsed.data.coverImage).toBe("https://drive.google.com/uc?export=view&id=abc123");
        expect(parsed.data.videoUrl).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
        expect(parsed.data.socialLinks?.instagram).toBe("https://www.instagram.com/onlyworkshops");
        expect(parsed.data.socialLinks?.website).toBe("https://onlyworkshops.in");
        expect(parsed.data.hostSocialLinks?.youtube).toBe("https://youtube.com/@mira");
    });
});

describe("workshopCreateSchema", () => {
    it("normalizes image links before create validation", () => {
        const parsed = workshopCreateSchema.safeParse({
            title: "Terracotta Stories",
            description:
                "A detailed pottery session for beginners who want to build their first mug.",
            category: "Pottery",
            price: 1800,
            location: "Kala Studio",
            city: "Pune",
            duration: "2h",
            date: "2026-04-12",
            time: "15:00",
            maxSeats: 12,
            coverImage: "drive.google.com/file/d/cover123/view?usp=sharing",
            galleryImages: ["www.example.com/gallery-1.jpg", "images/workshops/custom.webp"],
            videoUrl: "",
            socialLinks: {
                instagram: "",
                youtube: "",
                website: "",
            },
            hostName: "Aarav",
            hostBio: "Pottery instructor with a focus on beginner-friendly studio sessions.",
            hostExperience: "",
            hostSocialLinks: {
                instagram: "",
                youtube: "",
                website: "",
            },
            whatYouLearn: ["Center clay"],
            materialsProvided: ["Clay"],
            badgeLabels: [],
            eventAddress: "",
            locationImages: ["uploads/uploads/user-1/map-shot.png"],
            earlyBirdEnabled: false,
            earlyBirdDiscountType: "percentage",
            earlyBirdDiscountValue: 0,
            earlyBirdDaysAfterListing: 0,
        });

        expect(parsed.success).toBe(true);
        if (!parsed.success) return;

        expect(parsed.data.coverImage).toBe("https://drive.google.com/uc?export=view&id=cover123");
        expect(parsed.data.galleryImages).toEqual([
            "https://www.example.com/gallery-1.jpg",
            "/images/workshops/custom.webp",
        ]);
        expect(parsed.data.locationImages).toEqual(["/uploads/uploads/user-1/map-shot.png"]);
    });
});

describe("communityCreateSchema", () => {
    it("accepts a valid community publishing payload", () => {
        const parsed = communityCreateSchema.safeParse({
            title: "Mumbai Storytellers Circle",
            summary: "A weekly meetup for writers, speakers, and story lovers.",
            description:
                "We host regular gatherings for people who love storytelling, writing, and live sharing sessions across Mumbai.",
            category: "Storytelling",
            city: "Mumbai",
            hostName: "Asha Mehta",
            hostEmail: "asha@example.com",
            hostPhone: "9876543210",
            meetingFormat: "Offline",
            meetupFrequency: "Every Saturday evening",
            coverImage: "",
            instagramUrl: "https://instagram.com/storycircle",
            websiteUrl: "",
            whatsappUrl: "",
        });

        expect(parsed.success).toBe(true);
    });

    it("requires at least one community contact link", () => {
        const parsed = communityCreateSchema.safeParse({
            title: "Mumbai Storytellers Circle",
            summary: "A weekly meetup for writers, speakers, and story lovers.",
            description:
                "We host regular gatherings for people who love storytelling, writing, and live sharing sessions across Mumbai.",
            category: "Storytelling",
            city: "Mumbai",
            hostName: "Asha Mehta",
            hostEmail: "asha@example.com",
            hostPhone: "9876543210",
            meetingFormat: "Offline",
            meetupFrequency: "Every Saturday evening",
            coverImage: "",
            instagramUrl: "",
            websiteUrl: "",
            whatsappUrl: "",
        });

        expect(parsed.success).toBe(false);
    });
});

describe("communityJoinSchema", () => {
    it("accepts a basic community join request", () => {
        const parsed = communityJoinSchema.safeParse({
            fullName: "Rohan Shah",
            email: "rohan@example.com",
            phone: "9999999999",
            note: "Would love to join the next session.",
        });

        expect(parsed.success).toBe(true);
    });
});
