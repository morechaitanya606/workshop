import type { SupabaseClient } from "@supabase/supabase-js";
import type { Workshop } from "@/lib/data";
import { mockWorkshops } from "@/lib/data";
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

function cleanLinks(value: unknown) {
    const links = typeof value === "object" && value ? value : {};
    return {
        instagram: cleanUrlValue((links as Record<string, unknown>).instagram),
        youtube: cleanUrlValue((links as Record<string, unknown>).youtube),
        website: cleanUrlValue((links as Record<string, unknown>).website),
    };
}

export function mapWorkshopRowToWorkshop(row: Record<string, unknown>): Workshop {
    const socialLinks = cleanLinks(row.social_links);
    const hostSocialLinks = cleanLinks(row.host_social_links);

    return {
        id: String(row.id),
        title: String(row.title || ""),
        description: String(row.description || ""),
        category: String(row.category || ""),
        price: Number(row.price || 0),
        location: String(row.location || ""),
        city: String(row.city || ""),
        duration: String(row.duration || ""),
        date: String(row.date || ""),
        time: normalizeTimeValue(String(row.time || "")),
        maxSeats: Number(row.max_seats || 0),
        seatsRemaining: Number(row.seats_remaining || 0),
        coverImage: normalizeWorkshopImageUrl(row.cover_image),
        galleryImages: Array.isArray(row.gallery_images)
            ? (row.gallery_images as unknown[])
                .map((img) => normalizeWorkshopImageUrl(img))
                .filter((img) => img.length > 0)
            : [],
        videoUrl: cleanUrlValue(row.video_url),
        rating: Number(row.rating || 4.8),
        reviewCount: Number(row.review_count || 0),
        hostName: String(row.host_name || ""),
        hostAvatar:
            normalizeWorkshopImageUrl(cleanUrlValue(row.host_avatar)) ||
            "/images/workshops/IMG-20260306-WA0006.webp",
        hostBio: String(row.host_bio || ""),
        hostExperience: cleanUrlValue(row.host_experience),
        hostSocialLinks,
        socialLinks,
        whatYouLearn: Array.isArray(row.what_you_learn)
            ? (row.what_you_learn as string[])
            : [],
        materialsProvided: Array.isArray(row.materials_provided)
            ? (row.materials_provided as string[])
            : [],
        isNew: Boolean(row.is_new),
        isBestseller: Boolean(row.is_bestseller),
    };
}

export function buildWorkshopInsertPayload(
    input: WorkshopCreateInput,
    createdBy: string
) {
    const normalizedTitle = input.title.trim();
    const slug = normalizedTitle
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
        .slice(0, 36);

    const id = `${slug || "workshop"}-${Date.now()}`;
    const coverImage = normalizeWorkshopImageUrlInput(input.coverImage);
    const galleryImages = input.galleryImages.map((item) =>
        normalizeWorkshopImageUrlInput(item)
    );
    const videoUrl = input.videoUrl
        ? normalizeWorkshopVideoUrlInput(input.videoUrl)
        : "";

    return {
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
        is_bestseller: false,
        is_new: true,
        created_by: createdBy,
    };
}

function matchesWorkshopQuery(workshop: Workshop, query: WorkshopQueryInput) {
    const q = query.q.toLowerCase().trim();
    const category = query.category.toLowerCase().trim();
    const city = query.city.toLowerCase().trim();

    const matchesText =
        !q ||
        workshop.title.toLowerCase().includes(q) ||
        workshop.description.toLowerCase().includes(q) ||
        workshop.location.toLowerCase().includes(q) ||
        workshop.city.toLowerCase().includes(q);
    const matchesCategory =
        !category || workshop.category.toLowerCase() === category;
    const matchesCity = !city || workshop.city.toLowerCase() === city;

    const price = workshop.price;
    const matchesMinPrice =
        typeof query.minPrice === "number" ? price >= query.minPrice : true;
    const matchesMaxPrice =
        typeof query.maxPrice === "number" ? price <= query.maxPrice : true;
    const matchesDateFrom = query.dateFrom ? workshop.date >= query.dateFrom : true;
    const matchesDateTo = query.dateTo ? workshop.date <= query.dateTo : true;

    return (
        matchesText &&
        matchesCategory &&
        matchesCity &&
        matchesMinPrice &&
        matchesMaxPrice &&
        matchesDateFrom &&
        matchesDateTo
    );
}

export function sortWorkshops(
    workshops: Workshop[],
    sort: WorkshopQueryInput["sort"]
) {
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
    const filtered = mockWorkshops.filter((item) => matchesWorkshopQuery(item, query));
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
    serviceClient: SupabaseClient,
    workshopId: string
) {
    const { data: existing } = await serviceClient
        .from("workshops")
        .select("id")
        .eq("id", workshopId)
        .maybeSingle();

    if (existing?.id) return true;

    const mockWorkshop = mockWorkshops.find((item) => item.id === workshopId);
    if (!mockWorkshop) {
        return false;
    }

    const insertPayload = {
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
        host_avatar: mockWorkshop.hostAvatar,
        host_bio: mockWorkshop.hostBio,
        host_experience: mockWorkshop.hostExperience || null,
        host_social_links: mockWorkshop.hostSocialLinks || {},
        what_you_learn: mockWorkshop.whatYouLearn,
        materials_provided: mockWorkshop.materialsProvided,
        is_bestseller: Boolean(mockWorkshop.isBestseller),
        is_new: Boolean(mockWorkshop.isNew),
    };

    const { error } = await serviceClient.from("workshops").upsert(insertPayload, {
        onConflict: "id",
    });

    return !error;
}
