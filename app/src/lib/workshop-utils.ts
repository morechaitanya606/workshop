import type { Workshop } from "@/lib/data";
import type { Tables, TablesInsert, Json } from "@/lib/database.types";
import type { WorkshopCreateInput, WorkshopQueryInput } from "@/lib/validators";
import {
    normalizeWorkshopImageUrlInput,
    normalizeWorkshopVideoUrlInput,
} from "@/lib/workshop-media";

const LOCAL_WORKSHOP_IMAGE_PREFIX = "/images/workshops/";
const LEGACY_LOCAL_IMAGE_EXT_RE = /\.(?:jpe?g|png)(\?.*)?$/i;

function normalizeTimeValue(timeValue: string | null | undefined) {
    if (!timeValue) return "";
    const [h, m] = String(timeValue).split(":");
    if (!h || !m) return String(timeValue);
    return `${h}:${m}`;
}

function normalizeWorkshopImageUrl(value: unknown) {
    if (typeof value !== "string") return "";
    const trimmed = value.trim();
    if (!trimmed) return "";

    if (
        trimmed.startsWith(LOCAL_WORKSHOP_IMAGE_PREFIX) &&
        LEGACY_LOCAL_IMAGE_EXT_RE.test(trimmed)
    ) {
        return trimmed.replace(LEGACY_LOCAL_IMAGE_EXT_RE, ".webp$1");
    }

    return trimmed;
}

function cleanUrlValue(value: unknown) {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function cleanStringList(value: unknown) {
    if (!Array.isArray(value)) return [];

    return value.filter(
        (item): item is string => typeof item === "string" && item.trim().length > 0
    );
}

function cleanNumberValue(value: unknown) {
    if (value === null || value === undefined || value === "") return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}

type WorkshopLinks = {
    instagram?: string | null;
    youtube?: string | null;
    website?: string | null;
};

function isWorkshopLinks(value: Json | null | undefined): value is WorkshopLinks {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanLinks(value: Json | null | undefined) {
    const links = isWorkshopLinks(value) ? value : {};

    return {
        instagram: cleanUrlValue(links.instagram),
        youtube: cleanUrlValue(links.youtube),
        website: cleanUrlValue(links.website),
    };
}

export function mapWorkshopRowToWorkshop(row: Tables<"workshops">): Workshop {
    const socialLinks = cleanLinks(row.social_links);
    const hostSocialLinks = cleanLinks(row.host_social_links);
    const galleryImages = cleanStringList(row.gallery_images)
        .map((img) => normalizeWorkshopImageUrl(img))
        .filter((img) => img.length > 0);
    const locationImages = cleanStringList(row.location_images)
        .map((img) => normalizeWorkshopImageUrl(img))
        .filter((img) => img.length > 0);

    return {
        id: String(row.id),
        title: String(row.title),
        description: String(row.description),
        category: String(row.category),
        price: Number(row.price),
        location: String(row.location),
        city: String(row.city),
        duration: String(row.duration),
        date: String(row.date),
        time: normalizeTimeValue(String(row.time)),
        maxSeats: Number(row.max_seats),
        seatsRemaining: Number(row.seats_remaining),
        coverImage: normalizeWorkshopImageUrl(row.cover_image),
        galleryImages,
        videoUrl: cleanUrlValue(row.video_url),
        rating: Number(row.rating ?? 0),
        reviewCount: Number(row.review_count ?? 0),
        hostName: String(row.host_name),
        hostAvatar:
            normalizeWorkshopImageUrl(cleanUrlValue(row.host_avatar)) ||
            "/images/icon.png",
        hostBio: String(row.host_bio),
        hostExperience: cleanUrlValue(row.host_experience),
        hostSocialLinks,
        socialLinks,
        whatYouLearn: cleanStringList(row.what_you_learn),
        materialsProvided: cleanStringList(row.materials_provided),
        badgeLabels: Array.isArray(row.badge_labels)
            ? row.badge_labels.filter((label: unknown) => typeof label === "string" && label.trim())
            : [],
        isNew: row.is_new,
        isBestseller: row.is_bestseller,
        eventAddress: row.event_address || undefined,
        latitude: cleanNumberValue(row.latitude),
        longitude: cleanNumberValue(row.longitude),
        locationImages,
        earlyBirdEnabled: Boolean(row.early_bird_enabled),
        earlyBirdDiscountType: row.early_bird_discount_type || "percentage",
        earlyBirdDiscountValue: Number(row.early_bird_discount_value || 0),
        earlyBirdDaysAfterListing: Number(row.early_bird_days_after_listing || 0),
        createdAt: row.created_at || undefined,
        approvalStatus: row.approval_status || "approved",
    };
}

type BuildWorkshopInsertOptions = {
    approvalStatus?: "pending" | "approved" | "rejected";
};

export function buildWorkshopInsertPayload(
    input: WorkshopCreateInput,
    createdBy: string,
    options: BuildWorkshopInsertOptions = {}
): TablesInsert<"workshops"> {
    const normalizedTitle = input.title.trim();
    const slug = normalizedTitle
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
        .slice(0, 36);

    const id = `${slug || "workshop"}-${Date.now()}`;
    const coverImage = normalizeWorkshopImageUrlInput(input.coverImage);
    const galleryImages = input.galleryImages.map((item: string) =>
        normalizeWorkshopImageUrlInput(item)
    );
    const videoUrl = input.videoUrl ? normalizeWorkshopVideoUrlInput(input.videoUrl) : "";

    const payload: TablesInsert<"workshops"> = {
        id,
        title: input.title,
        description: input.description,
        category: input.category,
        price: input.price,
        location: input.location,
        city: input.city,
        duration: input.duration,
        date: input.date,
        time: input.time,
        max_seats: input.maxSeats,
        seats_remaining: input.maxSeats,
        cover_image: coverImage,
        gallery_images: galleryImages,
        video_url: videoUrl || null,
        social_links: input.socialLinks,
        host_name: input.hostName,
        host_avatar: coverImage,
        host_bio: input.hostBio,
        host_experience: input.hostExperience || null,
        host_social_links: input.hostSocialLinks,
        what_you_learn: input.whatYouLearn,
        materials_provided: input.materialsProvided,
        badge_labels: input.badgeLabels,
        is_bestseller: false,
        is_new: true,
        created_by: createdBy,
        host_user_id: createdBy,
        event_address: input.eventAddress || null,
        latitude: input.latitude !== undefined ? Number(input.latitude) : null,
        longitude: input.longitude !== undefined ? Number(input.longitude) : null,
        location_images: input.locationImages
            ? input.locationImages.map((item: string) => normalizeWorkshopImageUrlInput(item))
            : [],
        early_bird_enabled: input.earlyBirdEnabled ?? false,
        early_bird_discount_type: input.earlyBirdDiscountType ?? "percentage",
        early_bird_discount_value: input.earlyBirdDiscountValue ?? 0,
        early_bird_days_after_listing: input.earlyBirdDaysAfterListing ?? 0,
        approval_status: options.approvalStatus ?? "approved",
    };

    return payload;
}

export function sortWorkshops(workshops: Workshop[], sort: WorkshopQueryInput["sort"]) {
    const items = [...workshops];
    items.sort((a, b) => {
        if (sort === "date_desc") return b.date.localeCompare(a.date);
        if (sort === "price_asc") return a.price - b.price;
        if (sort === "price_desc") return b.price - a.price;
        if (sort === "rating_desc") return b.rating - a.rating;
        return a.date.localeCompare(b.date);
    });
    return items;
}
