import { z } from "zod";
import {
    isSupportedWorkshopImageUrl,
    normalizeUrlInput,
    normalizeWorkshopImageUrlInput,
    normalizeWorkshopVideoUrlInput,
} from "@/lib/workshop-media";

const urlOrEmpty = z
    .string()
    .optional()
    .transform((value) => normalizeUrlInput(value || ""))
    .refine((value) => value === "" || /^https?:\/\/.+/i.test(value), "Must be a valid URL.");

const imageUrl = z
    .string()
    .transform((value) => normalizeWorkshopImageUrlInput(value))
    .refine(
        (value) => value.startsWith("/") || /^https?:\/\/.+/i.test(value),
        "Must be a valid URL."
    )
    .refine((value) => isSupportedWorkshopImageUrl(value), "Must be a public image URL.");

const imageUrlOrEmpty = z
    .string()
    .optional()
    .transform((value) => normalizeWorkshopImageUrlInput(value || ""))
    .refine(
        (value) => value === "" || value.startsWith("/") || /^https?:\/\/.+/i.test(value),
        "Must be a valid URL."
    )
    .refine(
        (value) => value === "" || isSupportedWorkshopImageUrl(value),
        "Must be a public image URL."
    );

const videoUrlOrEmpty = z
    .string()
    .optional()
    .transform((value) => normalizeWorkshopVideoUrlInput(value || ""))
    .refine(
        (value) => value === "" || value.startsWith("/") || /^https?:\/\/.+/i.test(value),
        "Must be a valid URL."
    );

const optionalLatitude = z.preprocess(
    (value) => (value === "" || value === null || Number.isNaN(value) ? undefined : value),
    z.coerce.number().min(-90).max(90).optional()
);

const optionalLongitude = z.preprocess(
    (value) => (value === "" || value === null || Number.isNaN(value) ? undefined : value),
    z.coerce.number().min(-180).max(180).optional()
);

export const socialLinksSchema = z.object({
    instagram: urlOrEmpty,
    youtube: urlOrEmpty,
    website: urlOrEmpty,
});

export const workshopCreateSchema = z.object({
    title: z.string().trim().min(3).max(180),
    description: z.string().trim().min(20).max(5000),
    category: z.string().trim().min(2).max(80),
    price: z.coerce.number().int().positive().max(1000000),
    location: z.string().trim().min(2).max(180),
    city: z.string().trim().min(2).max(120),
    duration: z.string().trim().min(1).max(80),
    date: z.string().trim().min(8).max(20),
    time: z.string().trim().min(3).max(20),
    maxSeats: z.coerce.number().int().min(1).max(500),
    coverImage: imageUrl,
    galleryImages: z.array(imageUrl).max(20).default([]),
    videoUrl: videoUrlOrEmpty,
    socialLinks: socialLinksSchema.default({
        instagram: "",
        youtube: "",
        website: "",
    }),
    hostName: z.string().trim().min(2).max(120),
    hostBio: z.string().trim().min(10).max(2000),
    hostExperience: z.string().trim().max(120).optional().default(""),
    hostSocialLinks: socialLinksSchema.default({
        instagram: "",
        youtube: "",
        website: "",
    }),
    whatYouLearn: z.array(z.string().trim().min(1).max(240)).min(1).max(20),
    materialsProvided: z.array(z.string().trim().min(1).max(240)).min(1).max(20),
    badgeLabels: z.array(z.string().trim().min(1).max(120)).max(8).optional().default([]),
    eventAddress: z.string().trim().max(300).optional().default(""),
    latitude: optionalLatitude,
    longitude: optionalLongitude,
    locationImages: z.array(imageUrl).max(10).optional().default([]),
    earlyBirdEnabled: z.boolean().optional().default(false),
    earlyBirdDiscountType: z.enum(["percentage", "fixed"]).optional().default("percentage"),
    earlyBirdDiscountValue: z.coerce.number().int().min(0).max(100000).optional().default(0),
    earlyBirdDaysAfterListing: z.coerce.number().int().min(0).max(365).optional().default(0),
});

export type WorkshopCreateInput = z.infer<typeof workshopCreateSchema>;

export const workshopUpdateSchema = z
    .object({
        title: z.string().trim().min(3).max(180).optional(),
        description: z.string().trim().min(20).max(5000).optional(),
        category: z.string().trim().min(2).max(80).optional(),
        price: z.coerce.number().int().positive().max(1000000).optional(),
        location: z.string().trim().min(2).max(180).optional(),
        city: z.string().trim().min(2).max(120).optional(),
        duration: z.string().trim().min(1).max(80).optional(),
        date: z.string().trim().min(8).max(20).optional(),
        time: z.string().trim().min(3).max(20).optional(),
        maxSeats: z.coerce.number().int().min(1).max(500).optional(),
        coverImage: imageUrl.optional(),
        galleryImages: z.array(imageUrl).max(20).optional(),
        videoUrl: videoUrlOrEmpty.optional(),
        socialLinks: socialLinksSchema.optional(),
        hostName: z.string().trim().min(2).max(120).optional(),
        hostBio: z.string().trim().min(10).max(2000).optional(),
        hostExperience: z.string().trim().max(120).optional(),
        hostSocialLinks: socialLinksSchema.optional(),
        whatYouLearn: z.array(z.string().trim().min(1).max(240)).min(1).max(20).optional(),
        materialsProvided: z.array(z.string().trim().min(1).max(240)).min(1).max(20).optional(),
        badgeLabels: z.array(z.string().trim().min(1).max(120)).max(8).optional(),
        eventAddress: z.string().trim().max(300).optional(),
        latitude: optionalLatitude,
        longitude: optionalLongitude,
        locationImages: z.array(imageUrl).max(10).optional(),
        earlyBirdEnabled: z.boolean().optional(),
        earlyBirdDiscountType: z.enum(["percentage", "fixed"]).optional(),
        earlyBirdDiscountValue: z.coerce.number().int().min(0).max(100000).optional(),
        earlyBirdDaysAfterListing: z.coerce.number().int().min(0).max(365).optional(),
    })
    .refine((value) => Object.keys(value).length > 0, {
        message: "Provide at least one field to update.",
    });

export type WorkshopUpdateInput = z.infer<typeof workshopUpdateSchema>;

export const bookingHoldSchema = z.object({
    workshopId: z.string().trim().min(1).max(120),
    guests: z.coerce.number().int().min(1).max(20),
});

export type BookingHoldInput = z.infer<typeof bookingHoldSchema>;

export const bookingCheckoutSchema = z
    .object({
        holdId: z.string().uuid(),
        workshopId: z.string().trim().min(1).max(120),
        firstName: z.string().trim().min(1).max(120),
        lastName: z.string().trim().min(1).max(120),
        email: z.string().trim().email().max(320),
        phone: z.string().trim().min(10, "Phone number must be at least 10 digits").max(32),
        notes: z.string().trim().max(2000).optional().default(""),
        razorpayOrderId: z.string().trim().min(1).max(80).optional(),
        razorpayPaymentId: z.string().trim().min(1).max(80).optional(),
        razorpaySignature: z.string().trim().min(1).max(256).optional(),
        couponCode: z.string().trim().min(1).max(50).optional(),
    })
    .superRefine((value, ctx) => {
        const hasOrderId = Boolean(value.razorpayOrderId);
        const hasPaymentId = Boolean(value.razorpayPaymentId);
        const hasSignature = Boolean(value.razorpaySignature);
        const providedCount = Number(hasOrderId) + Number(hasPaymentId) + Number(hasSignature);

        if (providedCount !== 0 && providedCount !== 3) {
            ctx.addIssue({
                code: "custom",
                message:
                    "Provide all Razorpay fields (razorpayOrderId, razorpayPaymentId, razorpaySignature) together.",
                path: ["razorpayOrderId"],
            });
        }
    });

export type BookingCheckoutInput = z.infer<typeof bookingCheckoutSchema>;

export const workshopNotificationSchema = z.object({
    mode: z.enum(["similar", "creator"]),
});

export type WorkshopNotificationInput = z.infer<typeof workshopNotificationSchema>;

export const workshopFeedbackSchema = z.object({
    rating: z.coerce.number().int().min(1).max(5).optional().default(5),
    comment: z.string().trim().min(3).max(2000),
    photos: z.array(imageUrl).optional().default([]),
    videoUrl: videoUrlOrEmpty.optional(),
});

export type WorkshopFeedbackInput = z.infer<typeof workshopFeedbackSchema>;

export const profileUpdateSchema = z
    .object({
        fullName: z.string().trim().min(2).max(120).optional(),
        avatarUrl: imageUrlOrEmpty.optional(),
        dateOfBirth: z
            .string()
            .trim()
            .optional()
            .refine(
                (value) => value === undefined || value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value),
                {
                    message: "Date of birth must be in YYYY-MM-DD format.",
                }
            ),
        phoneNumber: z
            .string()
            .trim()
            .max(32)
            .optional()
            .refine((value) => value === undefined || value === "" || value.length >= 10, {
                message: "Phone number must be at least 10 digits.",
            }),
    })
    .refine(
        (value) =>
            typeof value.fullName === "string" ||
            typeof value.avatarUrl === "string" ||
            typeof value.dateOfBirth === "string" ||
            typeof value.phoneNumber === "string",
        {
            message: "Provide at least one field to update.",
        }
    );

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

export const adminFeedbackUpdateSchema = z
    .object({
        rating: z.coerce.number().int().min(1).max(5).optional(),
        comment: z.string().trim().min(3).max(2000).optional(),
    })
    .refine((value) => Object.keys(value).length > 0, {
        message: "Provide at least one field to update.",
    });

export type AdminFeedbackUpdateInput = z.infer<typeof adminFeedbackUpdateSchema>;

export const workshopQuerySchema = z.object({
    q: z.string().trim().max(120).optional().default(""),
    category: z.string().trim().max(80).optional().default(""),
    city: z.string().trim().max(80).optional().default(""),
    dateFrom: z.string().trim().max(20).optional().default(""),
    dateTo: z.string().trim().max(20).optional().default(""),
    minPrice: z.coerce.number().int().min(0).max(1000000).optional(),
    maxPrice: z.coerce.number().int().min(0).max(1000000).optional(),
    sort: z
        .enum(["date_asc", "date_desc", "price_asc", "price_desc", "rating_desc"])
        .default("date_asc"),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(24).default(8),
});

export type WorkshopQueryInput = z.infer<typeof workshopQuerySchema>;

export const adminRegistrationsQuerySchema = z.object({
    q: z.string().trim().max(120).optional().default(""),
    status: z.string().trim().max(32).optional().default("all"),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(12),
});

export type AdminRegistrationsQueryInput = z.infer<typeof adminRegistrationsQuerySchema>;

export const adminFeedbackQuerySchema = z.object({
    q: z.string().trim().max(120).optional().default(""),
    workshopId: z.string().trim().max(120).optional().default(""),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(12),
});

export type AdminFeedbackQueryInput = z.infer<typeof adminFeedbackQuerySchema>;

export const supportChatRequestSchema = z.object({
    message: z.string().trim().min(1).max(1000),
    contextWorkshopId: z
        .string()
        .trim()
        .max(120)
        .nullable()
        .optional()
        .transform((val) => val || ""),
    userDisplayName: z
        .string()
        .trim()
        .max(120)
        .nullable()
        .optional()
        .transform((val) => val || ""),
});

export type SupportChatRequestInput = z.infer<typeof supportChatRequestSchema>;

export const supportTicketCreateSchema = z.object({
    subject: z.string().trim().min(3).max(180),
    description: z.string().trim().min(10).max(4000),
    email: z.string().trim().email().max(320),
    workshopId: z.string().trim().max(120).optional().default(""),
});

export type SupportTicketCreateInput = z.infer<typeof supportTicketCreateSchema>;

export const supportTicketStatusSchema = z.object({
    status: z.enum(["open", "in_progress", "resolved"]),
});

export const supportTicketReplySchema = z.object({
    message: z.string().trim().min(1).max(4000),
});

export type SupportTicketStatusInput = z.infer<typeof supportTicketStatusSchema>;
export type SupportTicketReplyInput = z.infer<typeof supportTicketReplySchema>;

export const chatbotStageSchema = z.enum(["idle", "asking_name", "asking_phone", "completed"]);

export const chatbotLeadDraftSchema = z.object({
    name: z.string().trim().max(120).optional().default(""),
    phone: z.string().trim().max(32).optional().default(""),
    query: z.string().trim().max(1000).optional().default(""),
});

export const chatbotRequestSchema = z.object({
    message: z.string().trim().min(1).max(1000),
    stage: chatbotStageSchema.optional().default("idle"),
    lead: chatbotLeadDraftSchema.optional().default({
        name: "",
        phone: "",
        query: "",
    }),
    clientId: z.string().uuid().optional(),
    clientApiKey: z.string().trim().min(8).max(120).optional(),
    contextWorkshopId: z
        .string()
        .trim()
        .max(120)
        .nullable()
        .optional()
        .transform((val) => val || ""),
});

export type ChatbotRequestInput = z.infer<typeof chatbotRequestSchema>;

export const chatbotClientUpdateSchema = z
    .object({
        name: z.string().trim().min(2).max(120).optional(),
        bookingUrl: urlOrEmpty.optional(),
        rotateApiKey: z.boolean().optional().default(false),
    })
    .refine(
        (value) =>
            value.rotateApiKey === true ||
            typeof value.name !== "undefined" ||
            typeof value.bookingUrl !== "undefined",
        {
            message: "Provide at least one chatbot client field to update.",
        }
    );

export type ChatbotClientUpdateInput = z.infer<typeof chatbotClientUpdateSchema>;

export const faqEntrySchema = z.object({
    question: z.string().trim().min(3).max(240),
    answer: z.string().trim().min(3).max(4000),
});

export type FaqEntryInput = z.infer<typeof faqEntrySchema>;

export const faqEntryUpdateSchema = z
    .object({
        question: z.string().trim().min(3).max(240).optional(),
        answer: z.string().trim().min(3).max(4000).optional(),
    })
    .refine((value) => Object.keys(value).length > 0, {
        message: "Provide at least one FAQ field to update.",
    });

export type FaqEntryUpdateInput = z.infer<typeof faqEntryUpdateSchema>;

export const careersApplicationSchema = z.object({
    fullName: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(320),
    phone: z.string().trim().min(7).max(32),
    location: z.string().trim().min(2).max(120),
    role: z.string().trim().min(2).max(80),
    portfolioUrl: urlOrEmpty,
    coverLetter: z.string().trim().min(20).max(4000),
});

export type CareersApplicationInput = z.infer<typeof careersApplicationSchema>;

export const communityCreateSchema = z
    .object({
        title: z.string().trim().min(2).max(120),
        summary: z.string().trim().min(10).max(240),
        description: z.string().trim().min(20).max(4000),
        category: z.string().trim().min(2).max(80),
        city: z.string().trim().min(2).max(120),
        hostName: z.string().trim().min(2).max(120),
        hostEmail: z.string().trim().email().max(320),
        hostPhone: z.string().trim().min(7).max(32),
        meetingFormat: z.string().trim().min(2).max(40),
        meetupFrequency: z.string().trim().min(2).max(120),
        coverImage: imageUrlOrEmpty.optional(),
        instagramUrl: urlOrEmpty,
        websiteUrl: urlOrEmpty,
        whatsappUrl: urlOrEmpty,
    })
    .superRefine((value, ctx) => {
        const hasAtLeastOneLink = Boolean(
            value.instagramUrl || value.websiteUrl || value.whatsappUrl
        );

        if (hasAtLeastOneLink) {
            return;
        }

        const message = "Add at least one Instagram, Website, or WhatsApp community link.";

        ctx.addIssue({
            code: "custom",
            message,
            path: ["instagramUrl"],
        });
        ctx.addIssue({
            code: "custom",
            message,
            path: ["websiteUrl"],
        });
        ctx.addIssue({
            code: "custom",
            message,
            path: ["whatsappUrl"],
        });
    });

export type CommunityCreateInput = z.infer<typeof communityCreateSchema>;

export const communityJoinSchema = z.object({
    fullName: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(320),
    phone: z.string().trim().min(7).max(32),
    note: z.string().trim().max(1000).optional().default(""),
});

export type CommunityJoinInput = z.infer<typeof communityJoinSchema>;

export const communityPhotoCreateSchema = z.object({
    imageUrl,
    altText: z.string().trim().max(180).optional().default(""),
    sortOrder: z.coerce.number().int().min(0).max(1000).optional().default(0),
    isActive: z.boolean().optional().default(true),
});

export type CommunityPhotoCreateInput = z.infer<typeof communityPhotoCreateSchema>;

export const communityPhotoUpdateSchema = z
    .object({
        imageUrl: imageUrl.optional(),
        altText: z.string().trim().max(180).optional(),
        sortOrder: z.coerce.number().int().min(0).max(1000).optional(),
        isActive: z.boolean().optional(),
    })
    .refine((value) => Object.keys(value).length > 0, {
        message: "Provide at least one photo field to update.",
    });

export type CommunityPhotoUpdateInput = z.infer<typeof communityPhotoUpdateSchema>;
