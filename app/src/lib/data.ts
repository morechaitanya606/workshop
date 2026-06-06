export interface Workshop {
    id: string;
    title: string;
    description: string;
    category: string;
    price: number;
    location: string;
    city: string;
    duration: string;
    date: string;
    time: string;
    maxSeats: number;
    seatsRemaining: number;
    coverImage: string;
    galleryImages: string[];
    videoUrl?: string;
    rating: number;
    reviewCount: number;
    hostName: string;
    hostAvatar: string;
    hostBio: string;
    hostExperience?: string;
    hostSocialLinks?: {
        instagram?: string;
        youtube?: string;
        website?: string;
    };
    socialLinks?: {
        instagram?: string;
        youtube?: string;
        website?: string;
    };
    whatYouLearn: string[];
    materialsProvided: string[];
    badgeLabels?: string[];
    feedbackHighlight?: string;
    feedbackAuthor?: string;
    isNew?: boolean;
    isBestseller?: boolean;
    eventAddress?: string;
    latitude?: number;
    longitude?: number;
    locationImages?: string[];
    earlyBirdEnabled?: boolean;
    earlyBirdDiscountType?: string;
    earlyBirdDiscountValue?: number;
    earlyBirdDaysAfterListing?: number;
    createdAt?: string;
    approvalStatus?: "pending" | "approved" | "rejected";
}

export const PAST_EVENTS_CATEGORY_ID = "past-events";
export const PAST_EVENTS_CATEGORY_LABEL = "Past Events";

type WorkshopCategory = {
    id: string;
    label: string;
    icon?: string;
};

export const categories: WorkshopCategory[] = [
    { id: "trending", label: "Trending", icon: "🔥" },
    { id: PAST_EVENTS_CATEGORY_ID, label: PAST_EVENTS_CATEGORY_LABEL },
    { id: "arts-crafts", label: "Arts & Crafts", icon: "✂️" },
    { id: "food-drink", label: "Food & Drink", icon: "🍳" },
    { id: "pottery", label: "Pottery", icon: "🏺" },
    { id: "painting", label: "Painting", icon: "🎨" },
    { id: "music", label: "Music", icon: "🎵" },
    { id: "wellness", label: "Wellness", icon: "🧘" },
    { id: "photography", label: "Photography", icon: "📷" },
];

const categoryLookup = new Map<string, WorkshopCategory>();

for (const category of categories) {
    categoryLookup.set(category.id.toLowerCase(), category);
    categoryLookup.set(category.label.toLowerCase(), category);
}

export function findCategory(value: string | null | undefined) {
    const trimmedValue = value?.trim();
    if (!trimmedValue) {
        return undefined;
    }

    return categoryLookup.get(trimmedValue.toLowerCase());
}

export function normalizeCategoryLabel(value: string | null | undefined) {
    const trimmedValue = value?.trim() ?? "";
    if (!trimmedValue) {
        return "";
    }

    return findCategory(trimmedValue)?.label ?? trimmedValue;
}

export function normalizeFilterCategoryLabel(value: string | null | undefined) {
    const category = findCategory(value);
    if (category?.id === "trending") {
        return "";
    }

    return normalizeCategoryLabel(value);
}

export function normalizeCategoryId(value: string | null | undefined) {
    const trimmedValue = value?.trim() ?? "";
    if (!trimmedValue) {
        return "";
    }

    return findCategory(trimmedValue)?.id ?? trimmedValue;
}
