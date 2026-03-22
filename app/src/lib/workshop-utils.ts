import type { Workshop } from "@/lib/data";
import { mockWorkshops, PAST_EVENTS_CATEGORY_LABEL } from "@/lib/data";
import type { TablesInsert, Tables, Json } from "@/lib/database.types";
import type { SupabaseServerClient } from "@/lib/supabase-server";
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

export function mapWorkshopRowToWorkshop(row: any): Workshop {
    const socialLinks = cleanLinks(row.social_links);
    const hostSocialLinks = cleanLinks(row.host_social_links);

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
        galleryImages: row.gallery_images
            .map((img: string) => normalizeWorkshopImageUrl(img))
            .filter((img: string) => img.length > 0),
        videoUrl: cleanUrlValue(row.video_url),
        rating: 4.8,
        reviewCount: 0,
        hostName: String(row.host_name),
        hostAvatar:
            normalizeWorkshopImageUrl(cleanUrlValue(row.host_avatar)) ||
            "/images/workshops/IMG-20260306-WA0006.webp",
        hostBio: String(row.host_bio),
        hostExperience: cleanUrlValue(row.host_experience),
        hostSocialLinks,
        socialLinks,
        whatYouLearn: row.what_you_learn,
        materialsProvided: row.materials_provided,
        badgeLabels: Array.isArray(row.badge_labels)
            ? row.badge_labels.filter((label: unknown) => typeof label === "string" && label.trim())
            : [],
        isNew: row.is_new,
        isBestseller: row.is_bestseller,
        eventAddress: (row as any).event_address || undefined,
        latitude: (row as any).latitude !== null ? Number((row as any).latitude) : undefined,
        longitude: (row as any).longitude !== null ? Number((row as any).longitude) : undefined,
        locationImages: Array.isArray((row as any).location_images)
            ? (row as any).location_images
                  .map((img: any) => normalizeWorkshopImageUrl(String(img)))
                  .filter((img: any) => img.length > 0)
            : [],
        earlyBirdEnabled: Boolean(row.early_bird_enabled),
        earlyBirdDiscountType: row.early_bird_discount_type || "percentage",
        earlyBirdDiscountValue: Number(row.early_bird_discount_value || 0),
        earlyBirdDaysAfterListing: Number(row.early_bird_days_after_listing || 0),
        createdAt: row.created_at || undefined,
    };
}

export function buildWorkshopInsertPayload(
    input: WorkshopCreateInput,
    createdBy: string
): TablesInsert<"workshops"> {
    const normalizedTitle = input.title.trim();
    const slug = normalizedTitle
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
        .slice(0, 36);

    const id = `${slug || "workshop"}-${Date.now()}`;
    const coverImage = normalizeWorkshopImageUrlInput(input.coverImage);
    const galleryImages = input.galleryImages.map((item: any) =>
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
        ...(true ? {} : { badge_labels: input.badgeLabels }),
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
    };

    return payload;
}

function matchesWorkshopQuery(workshop: Workshop, query: WorkshopQueryInput) {
    const q = query.q.toLowerCase().trim();
    const category = query.category.toLowerCase().trim();
    const city = query.city.toLowerCase().trim();
    const isPastEventsCategory = category === PAST_EVENTS_CATEGORY_LABEL.toLowerCase();
    const today = new Date().toISOString().slice(0, 10);

    const matchesText =
        !q ||
        workshop.title.toLowerCase().includes(q) ||
        workshop.description.toLowerCase().includes(q) ||
        workshop.location.toLowerCase().includes(q) ||
        workshop.city.toLowerCase().includes(q);
    const matchesCategory =
        !category || isPastEventsCategory || workshop.category.toLowerCase() === category;
    const matchesCity = !city || workshop.city.toLowerCase() === city;

    const price = workshop.price;
    const matchesMinPrice = typeof query.minPrice === "number" ? price >= query.minPrice : true;
    const matchesMaxPrice = typeof query.maxPrice === "number" ? price <= query.maxPrice : true;
    const matchesDateFrom = query.dateFrom ? workshop.date >= query.dateFrom : true;
    const matchesDateTo = query.dateTo ? workshop.date <= query.dateTo : true;

    const hasDateFilter = Boolean(query.dateFrom || query.dateTo);
    const matchesDefaultUpcoming = isPastEventsCategory || hasDateFilter || workshop.date >= today;
    const matchesPastEvents = !isPastEventsCategory || workshop.date < today;

    return (
        matchesText &&
        matchesCategory &&
        matchesCity &&
        matchesMinPrice &&
        matchesMaxPrice &&
        matchesDateFrom &&
        matchesDateTo &&
        matchesDefaultUpcoming &&
        matchesPastEvents
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

export function queryMockWorkshops(query: WorkshopQueryInput) {
    const filtered = mockWorkshops.filter((item: any) => matchesWorkshopQuery(item, query));
    const sorted = sortWorkshops(filtered, query.sort);
    const total = sorted.length;
    const start = (query.page - 1) * query.pageSize;
    const end = start + query.pageSize;

    return {
        data: sorted.slice(start, end),
        total,
        page: query.page,
        pageSize: query.pageSize,
        source: "mock" as const,
    };
}

export async function ensureWorkshopSeededFromMock(
    serviceClient: SupabaseServerClient,
    workshopId: string
) {
    const { data: existing } = await serviceClient
        .from("workshops")
        .select("id")
        .eq("id", workshopId)
        .maybeSingle();

    if (existing?.id) return true;

    const mockWorkshop = mockWorkshops.find((item: any) => item.id === workshopId);
    if (!mockWorkshop) {
        return false;
    }

    const insertPayload: TablesInsert<"workshops"> = {
        id: mockWorkshop.id,
        title: mockWorkshop.title,
        description: mockWorkshop.description,
        category: mockWorkshop.category,
        price: mockWorkshop.price,
        location: mockWorkshop.location,
        city: mockWorkshop.city,
        duration: mockWorkshop.duration,
        date: mockWorkshop.date,
        time: mockWorkshop.time,
        max_seats: mockWorkshop.maxSeats,
        seats_remaining: mockWorkshop.seatsRemaining,
        cover_image: mockWorkshop.coverImage,
        gallery_images: mockWorkshop.galleryImages,
        video_url: mockWorkshop.videoUrl || null,
        social_links: mockWorkshop.socialLinks || {},
        host_name: mockWorkshop.hostName,
        host_avatar: mockWorkshop.hostAvatar || null,
        host_bio: mockWorkshop.hostBio,
        host_experience: mockWorkshop.hostExperience || null,
        host_social_links: mockWorkshop.hostSocialLinks || {},
        what_you_learn: mockWorkshop.whatYouLearn,
        materials_provided: mockWorkshop.materialsProvided,
        ...(true ? {} : { badge_labels: mockWorkshop?.badgeLabels ?? null }),
        is_bestseller: Boolean(mockWorkshop.isBestseller),
        is_new: Boolean(mockWorkshop.isNew),
        ...(true ? {} : { event_address: mockWorkshop?.eventAddress || null }),
        ...(true
            ? {}
            : {
                  latitude:
                      mockWorkshop?.latitude !== undefined ? Number(mockWorkshop?.latitude) : null,
              }),
        ...(true
            ? {}
            : {
                  longitude:
                      mockWorkshop?.longitude !== undefined
                          ? Number(mockWorkshop?.longitude)
                          : null,
              }),
        ...(true ? {} : { location_images: mockWorkshop?.locationImages || [] }),
    };

    const { error } = await serviceClient.from("workshops").upsert(insertPayload, {
        onConflict: "id",
    });

    return !error;
}
