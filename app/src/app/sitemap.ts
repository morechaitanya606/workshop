import type { MetadataRoute } from "next";
import { getAppUrl } from "@/lib/env";
import { SEO_CITIES, cityPagePath } from "@/lib/seo";
import {
    SEO_TOPICS,
    topicIsIndexable,
    topicPagePath,
    workshopMatchesTopic,
} from "@/lib/seo-topics";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase-server";
import { isMissingApprovalStatusColumnError } from "@/lib/workshop-approval-compat";
import { getIstTodayIso } from "@/lib/ist-date";
import { resolveSpecialPageSettings } from "@/lib/special-page";
import { getPlatformSettings } from "@/lib/workshop-page-data";
import { isSupportedWorkshopImageUrl } from "@/lib/workshop-media";

// Without this the sitemap is rendered once at build time and never reflects new workshops.
export const revalidate = 3600;

// /blog and /press are left out while they are "coming soon" placeholders: thin pages in the
// sitemap only dilute how Google rates the site. Add them back once they have real content.
const STATIC_PATHS = [
    "/",
    "/explore",
    "/about",
    "/become-a-host",
    "/list-your-space",
    "/contact",
    "/careers",
    "/communities",
    "/help",
    "/safety",
    "/cancellations",
    "/legal/privacy",
    "/legal/terms",
    "/past-events",
    "/sitemap",
];

// Everything the topic entries need: the title/category match, the city, upcoming vs past, and
// the past photo count that topicIsIndexable uses.
const WORKSHOP_COLUMNS = "id, title, category, city, date, updated_at, gallery_images";

type SitemapWorkshop = {
    id: string;
    title: string;
    category: string;
    city: string;
    date: string;
    updatedAt: string | null;
    photos: number;
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const siteUrl = getAppUrl().replace(/\/$/, "");
    const now = new Date();
    const today = getIstTodayIso(now);
    // Static pages carry no real "last changed" date, so they get none. Stamping them with the
    // regeneration time (every hour) taught Google to ignore lastmod for the whole sitemap,
    // including the accurate workshop dates below.
    const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.map((path) => ({
        url: `${siteUrl}${path}`,
        changeFrequency: path === "/" || path === "/explore" ? "daily" : "weekly",
        priority: path === "/" ? 1 : path === "/explore" ? 0.9 : 0.6,
    }));

    // The special event page is only listed while it is enabled and not past its visible_until
    // date (IST); afterwards it should drop out instead of advertising an ended event.
    const specialPage = resolveSpecialPageSettings((await getPlatformSettings()).special_page);
    if (specialPage.enabled && today <= specialPage.visibleUntil) {
        staticEntries.push({
            url: `${siteUrl}${specialPage.path}`,
            changeFrequency: "daily",
            priority: 0.95,
        });
    }

    const workshopRows = new Map<string, SitemapWorkshop>();
    const communityRows = new Map<string, string | null>();

    if (isSupabaseServiceConfigured) {
        try {
            const serviceClient = createSupabaseServiceClient();
            let [{ data: workshopData, error: workshopError }, { data: communityData }] =
                await Promise.all([
                    serviceClient
                        .from("workshops")
                        .select(WORKSHOP_COLUMNS)
                        .eq("approval_status", "approved")
                        .order("date", { ascending: false })
                        .limit(1000),
                    serviceClient
                        .from("communities")
                        .select("slug, updated_at")
                        .order("created_at", { ascending: false }),
                ]);

            if (workshopError && isMissingApprovalStatusColumnError(workshopError)) {
                const fallback = await serviceClient
                    .from("workshops")
                    .select(WORKSHOP_COLUMNS)
                    .order("date", { ascending: false })
                    .limit(1000);

                workshopData = fallback.data;
            }

            for (const row of workshopData || []) {
                if (!row.id) continue;
                workshopRows.set(row.id, {
                    id: row.id,
                    title: row.title ?? "",
                    category: row.category ?? "",
                    city: row.city ?? "",
                    date: row.date ?? "",
                    updatedAt: row.updated_at ?? null,
                    // Counted the way the workshop mapper keeps them, so the sitemap and the
                    // topic page's robots tag agree on which topics are indexable.
                    photos: (row.gallery_images || []).filter((image) =>
                        isSupportedWorkshopImageUrl(image)
                    ).length,
                });
            }
            for (const row of communityData || []) {
                if (row.slug) communityRows.set(row.slug, row.updated_at ?? null);
            }
        } catch {
            // In production, keep sitemap limited to known public static routes.
        }
    }

    const toLastModified = (value: string | null) => {
        const date = value ? new Date(value) : null;
        return date && !Number.isNaN(date.getTime()) ? date : undefined;
    };

    // A listing page changes when one of its workshops does, so it carries the newest one's date.
    const newestUpdate = (rows: SitemapWorkshop[]) =>
        rows
            .map((row) => toLastModified(row.updatedAt))
            .filter((date): date is Date => Boolean(date))
            .reduce<Date | undefined>(
                (newest, date) => (!newest || date > newest ? date : newest),
                undefined
            );
    const allWorkshops = Array.from(workshopRows.values());

    const cityEntries: MetadataRoute.Sitemap = SEO_CITIES.map((city) => ({
        url: `${siteUrl}${cityPagePath(city)}`,
        lastModified: newestUpdate(allWorkshops),
        changeFrequency: "daily",
        priority: 0.9,
    }));

    // Topic pages are listed only while indexable (the same rule the page uses for its robots
    // tag), so the sitemap never advertises a URL that answers with noindex. The city match
    // mirrors loadCityWorkshops, which filters with a case-insensitive `ilike`.
    const topicEntries: MetadataRoute.Sitemap = [];
    for (const city of SEO_CITIES) {
        const cityWorkshops = allWorkshops.filter(
            (workshop) => workshop.city.toLowerCase() === city.name.toLowerCase()
        );

        for (const topic of SEO_TOPICS) {
            const members = cityWorkshops.filter((workshop) =>
                workshopMatchesTopic(workshop, topic)
            );
            const past = members.filter((workshop) => workshop.date < today);
            const indexable = topicIsIndexable({
                upcoming: members.length - past.length,
                total: members.length,
                photos: past.reduce((count, workshop) => count + workshop.photos, 0),
            });
            if (!indexable) continue;

            topicEntries.push({
                url: `${siteUrl}${topicPagePath(city, topic)}`,
                lastModified: newestUpdate(members),
                changeFrequency: "weekly",
                priority: 0.8,
            });
        }
    }

    // Priority is mostly ignored by Google; it just keeps the sitemap honest about which session
    // pages are still bookable.
    const workshopEntries: MetadataRoute.Sitemap = allWorkshops.map((workshop) => ({
        url: `${siteUrl}/workshop/${workshop.id}`,
        lastModified: toLastModified(workshop.updatedAt),
        changeFrequency: "weekly",
        priority: workshop.date >= today ? 0.8 : 0.5,
    }));

    const communityEntries: MetadataRoute.Sitemap = Array.from(communityRows).map(
        ([slug, updatedAt]) => ({
            url: `${siteUrl}/communities/${slug}`,
            lastModified: toLastModified(updatedAt),
            changeFrequency: "weekly",
            priority: 0.7,
        })
    );

    return [
        ...staticEntries,
        ...cityEntries,
        ...topicEntries,
        ...workshopEntries,
        ...communityEntries,
    ];
}
