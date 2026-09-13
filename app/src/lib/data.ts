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

/**
 * Browse taxonomy shown on the explore page. These are deliberately broader than the
 * per-workshop `categories` above: each group fans out to the category values that are
 * actually stored on `workshops.category`, so a single pill can match several of them.
 *
 * A group with no `members` falls back to matching its own label, which means a brand new
 * group returns nothing until workshops are tagged with it. `Movement` is in that state today.
 */
export type CategoryGroup = {
    id: string;
    label: string;
    icon?: string;
    members: string[];
};

export const categoryGroups: CategoryGroup[] = [
    { id: "trending", label: "Trending", icon: "🔥", members: [] },
    { id: "culinary-arts", label: "Culinary Arts", icon: "🍳", members: ["Food & Drink"] },
    {
        id: "creative-pursuits",
        label: "Creative Pursuits",
        icon: "🎨",
        members: ["Arts & Crafts", "Pottery", "Painting", "Photography", "Music"],
    },
    { id: "wellness", label: "Wellness", icon: "🧘", members: ["Wellness"] },
    { id: "movement", label: "Movement", icon: "🤸", members: [] },
    { id: PAST_EVENTS_CATEGORY_ID, label: PAST_EVENTS_CATEGORY_LABEL, members: [] },
];

const categoryGroupLookup = new Map<string, CategoryGroup>();

for (const group of categoryGroups) {
    categoryGroupLookup.set(group.id.toLowerCase(), group);
    categoryGroupLookup.set(group.label.toLowerCase(), group);
}

export function findCategoryGroup(value: string | null | undefined) {
    const trimmedValue = value?.trim();
    if (!trimmedValue) {
        return undefined;
    }

    return categoryGroupLookup.get(trimmedValue.toLowerCase());
}

/**
 * Turn a group id (or label) into the label carried in the `category` query param.
 * `trending` means "no category filter" and normalizes to an empty string.
 */
export function normalizeGroupFilterLabel(value: string | null | undefined) {
    const group = findCategoryGroup(value);
    if (group) {
        return group.id === "trending" ? "" : group.label;
    }

    return normalizeFilterCategoryLabel(value);
}

/**
 * Expand a `category` filter value into the concrete `workshops.category` values to match.
 * An empty array means "do not filter by category".
 */
export function resolveCategoryFilterValues(value: string | null | undefined): string[] {
    const group = findCategoryGroup(value);
    if (group) {
        if (group.id === "trending" || group.id === PAST_EVENTS_CATEGORY_ID) {
            return [];
        }
        return group.members.length > 0 ? [...group.members] : [group.label];
    }

    const normalized = normalizeFilterCategoryLabel(value);
    return normalized ? [normalized] : [];
}

export function normalizeCategoryId(value: string | null | undefined) {
    const trimmedValue = value?.trim() ?? "";
    if (!trimmedValue) {
        return "";
    }

    return findCategory(trimmedValue)?.id ?? trimmedValue;
}
