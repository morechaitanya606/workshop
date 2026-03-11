import { mockWorkshops } from "@/lib/data";

export const SAMPLE_FEEDBACK_WORKSHOP_ID = "past-1";

export type FallbackFeedbackRecord = {
    userId: string;
    workshopId: string;
    rating: number | null;
    comment: string;
    photos: string[];
    videoUrl: string | null;
    createdAt: string;
    updatedAt: string;
};

export type FallbackWorkshopInfo = {
    id: string;
    title: string;
    date: string;
    time: string | null;
    city: string;
    location: string;
};

type FallbackSaveInput = {
    rating: number | null;
    comment: string;
    photos?: string[];
    videoUrl?: string | null;
};

const DEFAULT_COMMENT =
    "The candle making flow was clear, hands-on, and easy to follow. I left with a fragrance blend I actually love.";
const DEFAULT_CREATED_AT = "2026-02-19T10:30:00.000Z";

const feedbackStore = new Map<string, FallbackFeedbackRecord>();

function feedbackKey(userId: string, workshopId: string) {
    return `${userId}:${workshopId}`;
}

function normalizeText(value: string) {
    return value.replace(/\s+/g, " ").trim();
}

function buildDefaultRecord(userId: string, workshopId: string): FallbackFeedbackRecord | null {
    if (workshopId !== SAMPLE_FEEDBACK_WORKSHOP_ID) {
        return null;
    }

    return {
        userId,
        workshopId,
        rating: 5,
        comment: DEFAULT_COMMENT,
        photos: [],
        videoUrl: null,
        createdAt: DEFAULT_CREATED_AT,
        updatedAt: DEFAULT_CREATED_AT,
    };
}

export function getFallbackPublicFeedback(workshopId: string) {
    const seeded = buildDefaultRecord("public", workshopId);
    return seeded ? [seeded] : [];
}

export function isMissingFeedbackTableError(error: unknown) {
    if (!error || typeof error !== "object") {
        return false;
    }

    const code = String((error as { code?: string }).code || "").toUpperCase();
    const message = String((error as { message?: string }).message || "").toLowerCase();

    return (
        code === "42P01" ||
        code === "PGRST205" ||
        message.includes("public.workshop_feedback") ||
        message.includes("workshop_feedback")
    );
}

export function getFallbackWorkshopInfo(workshopId: string): FallbackWorkshopInfo | null {
    const workshop = mockWorkshops.find((item) => item.id === workshopId);
    if (!workshop) {
        return null;
    }

    return {
        id: workshop.id,
        title: workshop.title,
        date: workshop.date,
        time: workshop.time || null,
        city: workshop.city,
        location: workshop.location,
    };
}

export function getFallbackFeedback(userId: string, workshopId: string) {
    const key = feedbackKey(userId, workshopId);
    const existing = feedbackStore.get(key);
    if (existing) {
        return existing;
    }

    const seeded = buildDefaultRecord(userId, workshopId);
    if (!seeded) {
        return null;
    }

    feedbackStore.set(key, seeded);
    return seeded;
}

export function saveFallbackFeedback(
    userId: string,
    workshopId: string,
    input: FallbackSaveInput
): FallbackFeedbackRecord {
    const key = feedbackKey(userId, workshopId);
    const now = new Date().toISOString();
    const existing = feedbackStore.get(key);

    const nextRecord: FallbackFeedbackRecord = {
        userId,
        workshopId,
        rating: input.rating,
        comment: normalizeText(input.comment),
        photos: Array.isArray(input.photos) ? input.photos.map((item) => String(item)) : [],
        videoUrl:
            typeof input.videoUrl === "string" && input.videoUrl.trim()
                ? input.videoUrl.trim()
                : null,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
    };

    feedbackStore.set(key, nextRecord);
    return nextRecord;
}

export function matchesFallbackFeedbackFilters(
    record: FallbackFeedbackRecord,
    q: string,
    workshopId: string
) {
    if (workshopId && record.workshopId !== workshopId) {
        return false;
    }

    const normalizedQ = normalizeText(q).toLowerCase();
    if (!normalizedQ) {
        return true;
    }

    const workshop = getFallbackWorkshopInfo(record.workshopId);
    const haystack = [
        record.comment,
        record.workshopId,
        workshop?.title || "",
        workshop?.city || "",
        workshop?.location || "",
    ]
        .join(" ")
        .toLowerCase();

    return haystack.includes(normalizedQ);
}

export function toFallbackWorkshopFeedbackResponse(record: FallbackFeedbackRecord) {
    return {
        rating: record.rating,
        comment: record.comment,
        photos: record.photos,
        video_url: record.videoUrl,
        created_at: record.createdAt,
        updated_at: record.updatedAt,
    };
}
