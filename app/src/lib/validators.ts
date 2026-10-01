import { z } from "zod";
import {
    isSupportedWorkshopImageUrl,
    normalizeUrlInput,
    normalizeWorkshopImageUrlInput,
    normalizeWorkshopVideoUrlInput,
} from "@/lib/workshop-media";
import {
    MAX_WORKSHOP_SESSIONS,
    isValidIsoDate,
    normalizeSessionTime,
    validateSessionList,
} from "@/lib/workshop-sessions";

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

// Workshop dates are strict `YYYY-MM-DD`, times strict `HH:MM` (IST). A free-form "7:00 PM"
// made `getWorkshopDateTime` return null, which silently disabled the booking cutoff.
const sessionDate = z
    .string()
    .trim()
    .refine((value) => isValidIsoDate(value), "Enter a valid date (YYYY-MM-DD).");

const sessionTime = z
    .string()
    .trim()
    .refine((value) => normalizeSessionTime(value) !== null, "Enter a valid time (HH:MM).")
    .transform((value) => normalizeSessionTime(value) as string);

const emptyToUndefined = (value: unknown) =>
    value === "" || value === null || (typeof value === "number" && Number.isNaN(value))
        ? undefined
        : value;

export const workshopSessionSchema = z.object({
    date: sessionDate,
    time: sessionTime,
    maxSeats: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(500).optional()),
});

export type WorkshopSessionInput = z.infer<typeof workshopSessionSchema>;

const workshopCreateBaseSchema = z.object({
    title: z.string().trim().min(3).max(180),
    description: z.string().trim().min(20).max(5000),
    category: z.string().trim().min(2).max(80),
    price: z.coerce.number().int().positive().max(1000000),
    location: z.string().trim().min(2).max(180),
    city: z.string().trim().min(2).max(120),
    duration: z.string().trim().min(1).max(80),
    // Legacy single slot. Prefer `sessions`; when both are sent, `sessions` wins.
    date: z.preprocess(emptyToUndefined, sessionDate.optional()),
    time: z.preprocess(emptyToUndefined, sessionTime.optional()),
    // One entry per time slot; each becomes its own workshop row.
    sessions: z.array(workshopSessionSchema).max(MAX_WORKSHOP_SESSIONS).optional(),
    // Default capacity for every session that does not set its own.
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

type ResolvedSession = { date: string; time: string; maxSeats: number };

function resolveCreateSessions(value: {
    date?: string;
    time?: string;
    maxSeats?: number;
    sessions?: Array<{ date: string; time: string; maxSeats?: number }>;
}): ResolvedSession[] {
    const raw =
        Array.isArray(value.sessions) && value.sessions.length > 0
            ? value.sessions
            : value.date && value.time
              ? [{ date: value.date, time: value.time, maxSeats: undefined }]
              : [];

    return raw.map((session) => ({
        date: session.date,
        time: session.time,
        maxSeats: session.maxSeats ?? (value.maxSeats as number),
    }));
}

export const workshopCreateSchema = workshopCreateBaseSchema
    .superRefine((value, ctx) => {
        const usingSessions = Array.isArray(value.sessions);
        const sessions = resolveCreateSessions(value);

        for (const issue of validateSessionList(sessions)) {
            let path: Array<string | number>;
            if (usingSessions) {
                path = issue.index === null ? ["sessions"] : ["sessions", issue.index, issue.field];
            } else {
                path = issue.field === "time" ? ["time"] : ["date"];
            }
            ctx.addIssue({ code: "custom", message: issue.message, path });
        }
    })
    .transform((value) => {
        const sessions = resolveCreateSessions(value);
        // `date`/`time` mirror the first session so single-slot consumers keep working.
        return {
            ...value,
            sessions,
            date: sessions[0]?.date ?? "",
            time: sessions[0]?.time ?? "",
        };
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
        date: sessionDate.optional(),
        time: sessionTime.optional(),
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
    photos: z.array(imageUrl).max(10, "Attach at most 10 photos.").optional().default([]),
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
        // Moderation gate: admins publish or retract a review without deleting it.
        isPublished: z.boolean().optional(),
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
    page: z.coerce.number().int().min(1).max(10000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(12),
});

export type AdminRegistrationsQueryInput = z.infer<typeof adminRegistrationsQuerySchema>;

export const adminFeedbackQuerySchema = z.object({
    q: z.string().trim().max(120).optional().default(""),
    workshopId: z.string().trim().max(120).optional().default(""),
    page: z.coerce.number().int().min(1).max(10000).default(1),
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
    workshopId: z
        .string()
        .trim()
        .max(64)
        .optional()
        .default("")
        .refine(
            (value) =>
                value === "" ||
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value),
            "Invalid workshop id."
        ),
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

/* ------------------------------------------------------------------ */
/* Host applications                                                   */
/* ------------------------------------------------------------------ */

const hostApplicationDetailScalar = z.union([
    z.string().max(1000),
    z.number().finite(),
    z.boolean(),
    z.null(),
]);

/**
 * `details` is a free-form bag the two application forms fill in (expertise, location,
 * socialLinks, capacity ...). It used to be `z.any()`, which let one request persist
 * arbitrarily large / deeply nested JSON. Now: a flat map of scalars or one level of nested
 * scalar maps, capped by key count and serialised size.
 */
export const HOST_APPLICATION_DETAILS_MAX_JSON_LENGTH = 6000;

export const hostApplicationDetailsSchema = z
    .record(
        z.string().max(60),
        z.union([
            hostApplicationDetailScalar,
            z.record(z.string().max(60), hostApplicationDetailScalar),
        ])
    )
    .refine((value) => Object.keys(value).length <= 30, "Too many detail fields.")
    .refine(
        (value) => JSON.stringify(value).length <= HOST_APPLICATION_DETAILS_MAX_JSON_LENGTH,
        "Application details are too large."
    );

export const hostApplicationSchema = z.object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(320),
    bio: z.string().trim().min(20).max(4000),
    portfolioUrl: z.string().trim().url().max(500).optional().or(z.literal("")),
    applicationType: z.enum(["creator", "space"]).default("creator"),
    details: hostApplicationDetailsSchema.default({}),
});

export type HostApplicationInput = z.infer<typeof hostApplicationSchema>;

/* ------------------------------------------------------------------ */
/* Cursor pagination for admin/host list endpoints                     */
/* ------------------------------------------------------------------ */

/**
 * `limit` + `cursor` for lists ordered by `created_at DESC`. The cursor is the `created_at`
 * of the last row of the previous page (returned as `nextCursor`), normalised to ISO so
 * nothing but a timestamp ever reaches a PostgREST filter.
 */
// `Date.parse` is far too lenient on its own (V8 accepts "x,id.neq.0" as a date), so require
// an ISO-8601 shape first.
const ISO_TIMESTAMP_SHAPE =
    /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

function isIsoTimestamp(value: string) {
    return ISO_TIMESTAMP_SHAPE.test(value) && !Number.isNaN(Date.parse(value));
}

export const cursorPageQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z
        .string()
        .trim()
        .max(64)
        .optional()
        .transform((value) => value || undefined)
        .refine(
            (value) => value === undefined || isIsoTimestamp(value),
            "Cursor must be a timestamp."
        )
        .transform((value) => (value === undefined ? undefined : new Date(value).toISOString())),
});

export type CursorPageQueryInput = z.infer<typeof cursorPageQuerySchema>;

/**
 * The `nextCursor` to hand back for a page whose last row has `createdAt`. Always UTC ISO
 * (`...Z`): Postgres returns `+00:00`, and a raw `+` in a query string decodes to a space.
 * Millisecond precision is a deliberate trade -- rows created inside one millisecond of the
 * page boundary are the only ones that could be skipped.
 */
export function toPageCursor(createdAt: string | null | undefined) {
    if (!createdAt) return null;
    const time = Date.parse(createdAt);
    return Number.isNaN(time) ? null : new Date(time).toISOString();
}

/* ------------------------------------------------------------------ */
/* Coupons                                                             */
/* ------------------------------------------------------------------ */

const couponCode = z
    .string()
    .trim()
    .min(3)
    .max(32)
    .regex(/^[A-Za-z0-9_-]+$/, "Use letters, numbers, dashes and underscores only.")
    .transform((value) => value.toUpperCase());

const optionalTimestamp = z
    .union([z.string().trim().max(64), z.null()])
    .optional()
    .refine(
        (value) => value === undefined || value === null || value === "" || isIsoTimestamp(value),
        "Must be a valid date."
    )
    .transform((value) => {
        if (value === undefined) return undefined;
        if (value === null || value === "") return null;
        return new Date(value).toISOString();
    });

const couponBaseFields = {
    discount_type: z.enum(["percentage", "fixed"]),
    discount_value: z.coerce.number().finite().positive().max(1_000_000),
    min_order_amount: z.coerce.number().finite().min(0).max(10_000_000).nullable().optional(),
    max_uses: z.coerce.number().int().min(1).max(1_000_000).nullable().optional(),
    valid_from: optionalTimestamp,
    valid_until: optionalTimestamp,
    applicable_categories: z.array(z.string().trim().min(1).max(80)).max(50).nullable().optional(),
    // Plain strings: the column is moving from uuid[] to text[], and the DB is the authority
    // on what an id looks like.
    applicable_workshop_ids: z
        .array(z.string().trim().min(1).max(64))
        .max(200)
        .nullable()
        .optional(),
    is_active: z.boolean().optional(),
};

function getCouponRuleIssues(value: {
    discount_type?: "percentage" | "fixed";
    discount_value?: number;
    valid_from?: string | null;
    valid_until?: string | null;
}) {
    const issues: Array<{ message: string; path: string[] }> = [];

    if (
        value.discount_type === "percentage" &&
        typeof value.discount_value === "number" &&
        value.discount_value > 100
    ) {
        issues.push({
            message: "A percentage discount cannot exceed 100.",
            path: ["discount_value"],
        });
    }

    if (
        value.valid_from &&
        value.valid_until &&
        new Date(value.valid_until).getTime() <= new Date(value.valid_from).getTime()
    ) {
        issues.push({ message: "valid_until must be after valid_from.", path: ["valid_until"] });
    }

    return issues;
}

export const couponCreateSchema = z
    .object({ code: couponCode, ...couponBaseFields })
    .superRefine((value, ctx) => {
        for (const issue of getCouponRuleIssues(value)) {
            ctx.addIssue({ code: "custom", ...issue });
        }
    });

export type CouponCreateInput = z.infer<typeof couponCreateSchema>;

export const couponUpdateSchema = z
    .object({
        discount_type: couponBaseFields.discount_type.optional(),
        discount_value: couponBaseFields.discount_value.optional(),
        min_order_amount: couponBaseFields.min_order_amount,
        max_uses: couponBaseFields.max_uses,
        valid_from: couponBaseFields.valid_from,
        valid_until: couponBaseFields.valid_until,
        applicable_categories: couponBaseFields.applicable_categories,
        applicable_workshop_ids: couponBaseFields.applicable_workshop_ids,
        is_active: couponBaseFields.is_active,
    })
    .superRefine((value, ctx) => {
        for (const issue of getCouponRuleIssues(value)) {
            ctx.addIssue({ code: "custom", ...issue });
        }
    })
    .refine((value) => Object.values(value).some((field) => field !== undefined), {
        message: "Provide at least one coupon field to update.",
    });

export type CouponUpdateInput = z.infer<typeof couponUpdateSchema>;

export const couponValidateSchema = z.object({
    code: z.string().trim().min(1).max(64),
    workshopId: z.string().trim().max(64).nullable().optional(),
    subtotal: z.coerce.number().finite().min(0).max(100_000_000).nullable().optional(),
});

export type CouponValidateInput = z.infer<typeof couponValidateSchema>;

/* ------------------------------------------------------------------ */
/* Support ticket listing                                              */
/* ------------------------------------------------------------------ */

export const supportTicketListQuerySchema = cursorPageQuerySchema;
