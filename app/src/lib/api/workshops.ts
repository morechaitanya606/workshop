import type { Workshop } from "@/lib/data";
import { apiRequest } from "./client";

export type GetWorkshopResponse = {
    workshop: Workshop;
    source: "supabase" | "mock";
};

export type FaqItem = {
    id: string;
    question: string;
    answer: string;
    created_at?: string;
    updated_at?: string;
};

export function getWorkshopById(workshopId: string) {
    return apiRequest<GetWorkshopResponse>(`/api/workshops/${workshopId}`, {
        cache: "no-store",
    });
}

export type FaqsResponse = {
    faqs: FaqItem[];
};

export function getFaqs() {
    return apiRequest<FaqsResponse>("/api/faqs", {
        cache: "no-store",
    });
}

export type WorkshopNotificationResponse = {
    subscriptions: {
        similar: boolean;
        creator: boolean;
    };
    message?: string;
};

export function getWorkshopNotifications(workshopId: string, accessToken: string) {
    return apiRequest<WorkshopNotificationResponse>(`/api/workshops/${workshopId}/notifications`, {
        accessToken,
        cache: "no-store",
    });
}

export function updateWorkshopNotifications(
    workshopId: string,
    accessToken: string,
    mode: "similar" | "creator"
) {
    return apiRequest<WorkshopNotificationResponse>(`/api/workshops/${workshopId}/notifications`, {
        method: "POST",
        accessToken,
        body: { mode },
    });
}

export type WorkshopFeedbackResponse = {
    feedback: {
        rating: number | null;
        comment: string;
        photos: string[];
        video_url: string | null;
        created_at: string;
        updated_at: string;
    } | null;
    canLeaveFeedback?: boolean;
    message?: string;
};

export type BulkWorkshopFeedbackResponse = {
    feedback: Record<
        string,
        {
            rating: number | null;
            comment: string;
            photos: string[];
            video_url: string | null;
            created_at: string;
            updated_at: string;
        }
    >;
    message?: string;
};

export type WorkshopPublicFeedbackResponse = {
    feedback: Array<{
        id: string;
        rating: number | null;
        comment: string;
        photos: string[];
        createdAt: string;
        userDisplayName: string;
        avatarUrl?: string | null;
    }>;
};

export function getWorkshopFeedback(workshopId: string, accessToken: string) {
    return apiRequest<WorkshopFeedbackResponse>(`/api/workshops/${workshopId}/feedback`, {
        accessToken,
        cache: "no-store",
    });
}

export function getBulkWorkshopFeedback(workshopIds: string[], accessToken: string) {
    return apiRequest<BulkWorkshopFeedbackResponse>(`/api/workshops/feedback/bulk`, {
        method: "POST",
        accessToken,
        body: { workshopIds },
        cache: "no-store",
    });
}

export function getWorkshopPublicFeedback(
    workshopId: string,
    params?: {
        limit?: number;
    }
) {
    const searchParams = new URLSearchParams();
    if (params?.limit) {
        searchParams.set("limit", String(params.limit));
    }
    const suffix = searchParams.toString() ? `?${searchParams.toString()}` : "";
    return apiRequest<WorkshopPublicFeedbackResponse>(
        `/api/workshops/${workshopId}/public-feedback${suffix}`,
        {
            cache: "no-store",
        }
    );
}

export function submitWorkshopFeedback(
    workshopId: string,
    accessToken: string,
    payload: {
        comment: string;
        rating?: number;
        photos?: string[];
        videoUrl?: string;
    }
) {
    return apiRequest<WorkshopFeedbackResponse>(`/api/workshops/${workshopId}/feedback`, {
        method: "POST",
        accessToken,
        body: payload,
    });
}
