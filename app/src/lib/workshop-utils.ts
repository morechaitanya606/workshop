import type { Workshop } from "@/lib/data";
import type { Tables, TablesInsert, Json } from "@/lib/database.types";
import type { WorkshopCreateInput, WorkshopQueryInput } from "@/lib/validators";
import {
    isSupportedWorkshopImageUrl,
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

    return normalizeWorkshopImageUrlInput(trimmed);
}

function cleanSupportedWorkshopImageUrl(value: unknown) {
    const normalized = normalizeWorkshopImageUrl(value);
    return isSupportedWorkshopImageUrl(normalized) ? normalized : "";
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
        .map((img) => cleanSupportedWorkshopImageUrl(img))
        .filter((img) => img.length > 0);
    const locationImages = cleanStringList(row.location_images)
        .map((img) => cleanSupportedWorkshopImageUrl(img))
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
        coverImage: cleanSupportedWorkshopImageUrl(row.cover_image),
        galleryImages,
        videoUrl: cleanUrlValue(row.video_url),
        rating: Number(row.rating ?? 0),
        reviewCount: Number(row.review_count ?? 0),
        hostName: String(row.host_name),
        hostAvatar:
            cleanSupportedWorkshopImageUrl(cleanUrlValue(row.host_avatar)) || "/images/icon.png",
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

function slugifyTitle(title: string) {
    return (
        title
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "")
            .slice(0, 36) || "workshop"
    );
}

/**
 * One workshop row per session. A single session keeps the historical `<slug>-<timestamp>` id;
 * several sessions add the slot's date and time so every id in the batch is unique and readable.
 */
function buildSessionWorkshopId(
    slug: string,
    timestamp: number,
    session: { date: string; time: string },
    multiple: boolean
) {
    if (!multiple) return `${slug}-${timestamp}`;
    const datePart = session.date.replace(/-/g, "");
    const timePart = session.time.replace(/:/g, "").slice(0, 4);
    return `${slug}-${timestamp}-${datePart}-${timePart}`;
}

/**
 * Builds the rows for a create request: one per session, identical details, own date, time and
 * capacity. Insert them with a single `.insert(rows)` so the whole batch is atomic.
 */
export function buildWorkshopInsertPayloads(
    input: WorkshopCreateInput,
    createdBy: string,
    options: BuildWorkshopInsertOptions = {},
    timestamp: number = Date.now()
): TablesInsert<"workshops">[] {
    const slug = slugifyTitle(input.title);
    const sessions =
        Array.isArray(input.sessions) && input.sessions.length > 0
            ? input.sessions
            : [{ date: input.date, time: input.time, maxSeats: input.maxSeats }];
    const multiple = sessions.length > 1;
    const usedIds = new Set<string>();

    return sessions.map((session, index) => {
        let id = buildSessionWorkshopId(slug, timestamp, session, multiple);
        if (usedIds.has(id)) id = `${id}-${index + 1}`;
        usedIds.add(id);

        const maxSeats = session.maxSeats ?? input.maxSeats;
        return buildWorkshopRow(input, createdBy, options, {
            id,
            date: session.date,
            time: session.time,
            maxSeats,
        });
    });
}

export function buildWorkshopInsertPayload(
    input: WorkshopCreateInput,
    createdBy: string,
    options: BuildWorkshopInsertOptions = {}
): TablesInsert<"workshops"> {
    return buildWorkshopInsertPayloads(input, createdBy, options)[0];
}

function buildWorkshopRow(
    input: WorkshopCreateInput,
    createdBy: string,
    options: BuildWorkshopInsertOptions,
    slot: { id: string; date: string; time: string; maxSeats: number }
): TablesInsert<"workshops"> {
    const { id } = slot;
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
        date: slot.date,
        time: slot.time,
        max_seats: slot.maxSeats,
        seats_remaining: slot.maxSeats,
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

/** Form fields (all strings, as the create forms hold them) that "start from existing" fills. */
export type WorkshopFormPrefill = {
    title: string;
    description: string;
    category: string;
    price: string;
    location: string;
    city: string;
    duration: string;
    maxSeats: string;
    coverImage: string;
    galleryImages: string;
    videoUrl: string;
    instagramLink: string;
    youtubeLink: string;
    websiteLink: string;
    hostName: string;
    hostBio: string;
    hostExperience: string;
    hostInstagram: string;
    hostYoutube: string;
    hostWebsite: string;
    whatYouLearn: string;
    materialsProvided: string;
    badgeLabels: string;
    eventAddress: string;
    latitude: string;
    longitude: string;
    locationImages: string;
    earlyBirdEnabled: string;
    earlyBirdDiscountType: string;
    earlyBirdDiscountValue: string;
    earlyBirdDaysAfterListing: string;
};

const joinLines = (items: string[] | undefined) => (items ?? []).join("\n");

/**
 * Maps an existing workshop to create-form values so it can be reused as a template.
 *
 * Deliberately NOT copied: date, time, sessions, seats remaining, rating, review count,
 * approval status, bestseller/new flags, id and timestamps. `maxSeats` is the workshop's capacity
 * (not a counter), so it is copied as the default seat count for the new sessions.
 */
export function mapWorkshopToFormPrefill(workshop: Workshop): WorkshopFormPrefill {
    return {
        title: workshop.title ?? "",
        description: workshop.description ?? "",
        category: workshop.category ?? "",
        price: workshop.price ? String(workshop.price) : "",
        location: workshop.location ?? "",
        city: workshop.city ?? "",
        duration: workshop.duration ?? "",
        maxSeats: workshop.maxSeats ? String(workshop.maxSeats) : "",
        coverImage: workshop.coverImage ?? "",
        galleryImages: joinLines(workshop.galleryImages),
        videoUrl: workshop.videoUrl ?? "",
        instagramLink: workshop.socialLinks?.instagram ?? "",
        youtubeLink: workshop.socialLinks?.youtube ?? "",
        websiteLink: workshop.socialLinks?.website ?? "",
        hostName: workshop.hostName ?? "",
        hostBio: workshop.hostBio ?? "",
        hostExperience: workshop.hostExperience ?? "",
        hostInstagram: workshop.hostSocialLinks?.instagram ?? "",
        hostYoutube: workshop.hostSocialLinks?.youtube ?? "",
        hostWebsite: workshop.hostSocialLinks?.website ?? "",
        whatYouLearn: joinLines(workshop.whatYouLearn),
        materialsProvided: joinLines(workshop.materialsProvided),
        badgeLabels: joinLines(workshop.badgeLabels),
        eventAddress: workshop.eventAddress ?? "",
        latitude: typeof workshop.latitude === "number" ? String(workshop.latitude) : "",
        longitude: typeof workshop.longitude === "number" ? String(workshop.longitude) : "",
        locationImages: joinLines(workshop.locationImages),
        earlyBirdEnabled: workshop.earlyBirdEnabled ? "true" : "false",
        earlyBirdDiscountType: workshop.earlyBirdDiscountType === "fixed" ? "fixed" : "percentage",
        earlyBirdDiscountValue: workshop.earlyBirdDiscountValue
            ? String(workshop.earlyBirdDiscountValue)
            : "",
        earlyBirdDaysAfterListing: workshop.earlyBirdDaysAfterListing
            ? String(workshop.earlyBirdDaysAfterListing)
            : "",
    };
}

/**
 * The create forms hold a category `<select>` (a known label or `__other__`) plus a free-text
 * field. Given a copied category, returns the state for both.
 */
export function getCategorySelectionState(category: string, knownLabels: string[]) {
    const trimmed = category.trim();
    if (!trimmed) return { selection: "", custom: "" };
    if (knownLabels.includes(trimmed)) return { selection: trimmed, custom: "" };
    return { selection: "__other__", custom: trimmed };
}

export type ReusableWorkshop = Workshop & {
    /** How many sessions (rows) share this workshop's title, city and venue. */
    sessionCount: number;
};

/**
 * A workshop run in several sessions exists as several rows with identical details. For the
 * "start from an existing workshop" list we only want one entry per workshop: the most recently
 * created row (a later copy is more likely to hold corrected details), most recent first.
 */
export function dedupeWorkshopsForReuse(workshops: Workshop[]): ReusableWorkshop[] {
    const stamp = (workshop: Workshop) => workshop.createdAt || workshop.date || "";
    const groups = new Map<string, { latest: Workshop; count: number }>();

    for (const workshop of workshops) {
        const key = [workshop.title, workshop.city, workshop.location]
            .map((part) =>
                String(part ?? "")
                    .trim()
                    .toLowerCase()
            )
            .join("|");
        const group = groups.get(key);
        if (!group) {
            groups.set(key, { latest: workshop, count: 1 });
            continue;
        }
        group.count += 1;
        if (stamp(workshop) > stamp(group.latest)) group.latest = workshop;
    }

    return [...groups.values()]
        .map(({ latest, count }) => ({ ...latest, sessionCount: count }))
        .sort((a, b) => stamp(b).localeCompare(stamp(a)));
}

/** Earliest session first (date, then time). Does not mutate the input. */
export function sortWorkshopsBySession(workshops: Workshop[]) {
    return [...workshops].sort(
        (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)
    );
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
