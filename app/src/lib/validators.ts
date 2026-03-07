import { z } from "zod";

const urlOrEmpty = z
    .string()
    .trim()
    .optional()
    .transform((value) => value || "")
    .refine(
        (value) => value === "" || /^https?:\/\/.+/i.test(value),
        "Must be a valid URL."
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
    coverImage: z.string().trim().url(),
    galleryImages: z.array(z.string().trim().url()).max(20).default([]),
    videoUrl: urlOrEmpty,
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
    whatYouLearn: z
        .array(z.string().trim().min(1).max(240))
        .min(1)
        .max(20),
    materialsProvided: z
        .array(z.string().trim().min(1).max(240))
        .min(1)
        .max(20),
});

export type WorkshopCreateInput = z.infer<typeof workshopCreateSchema>;

export const bookingHoldSchema = z.object({
    workshopId: z.string().trim().min(1).max(120),
    guests: z.coerce.number().int().min(1).max(20),
});

export type BookingHoldInput = z.infer<typeof bookingHoldSchema>;

export const bookingCheckoutSchema = z.object({
    holdId: z.string().uuid(),
    workshopId: z.string().trim().min(1).max(120),
    firstName: z.string().trim().min(1).max(120),
    lastName: z.string().trim().min(1).max(120),
    email: z.string().trim().email().max(320),
    phone: z.string().trim().max(32).optional().default(""),
    notes: z.string().trim().max(2000).optional().default(""),
    razorpayOrderId: z.string().trim().min(1).max(80).optional(),
    razorpayPaymentId: z.string().trim().min(1).max(80).optional(),
    razorpaySignature: z.string().trim().min(1).max(256).optional(),
}).superRefine((value, ctx) => {
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

export type WorkshopNotificationInput = z.infer<
    typeof workshopNotificationSchema
>;

export const workshopFeedbackSchema = z.object({
    rating: z.coerce.number().int().min(1).max(5),
    comment: z.string().trim().min(3).max(2000),
    photos: z.array(z.string().url()).optional().default([]),
    videoUrl: urlOrEmpty.optional(),
});

export type WorkshopFeedbackInput = z.infer<typeof workshopFeedbackSchema>;

export const workshopQuerySchema = z.object({
    q: z.string().trim().max(120).optional().default(""),
    category: z.string().trim().max(80).optional().default(""),
    city: z.string().trim().max(80).optional().default(""),
    dateFrom: z.string().trim().max(20).optional().default(""),
    dateTo: z.string().trim().max(20).optional().default(""),
    minPrice: z.coerce.number().int().min(0).max(1000000).optional(),
    maxPrice: z.coerce.number().int().min(0).max(1000000).optional(),
    sort: z
        .enum([
            "date_asc",
            "date_desc",
            "price_asc",
            "price_desc",
            "rating_desc",
        ])
        .default("date_asc"),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(24).default(8),
});

export type WorkshopQueryInput = z.infer<typeof workshopQuerySchema>;
