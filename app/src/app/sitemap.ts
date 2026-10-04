import type { MetadataRoute } from "next";
import { getAppUrl } from "@/lib/env";
import { SEO_CITIES, cityPagePath } from "@/lib/seo";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase-server";
import { isMissingApprovalStatusColumnError } from "@/lib/workshop-approval-compat";
import { getIstTodayIso } from "@/lib/ist-date";
import { resolveSpecialPageSettings } from "@/lib/special-page";
import { getPlatformSettings } from "@/lib/workshop-page-data";

// Without this the sitemap is rendered once at build time and never reflects new workshops.
export const revalidate = 3600;

const STATIC_PATHS = [
    "/",
    "/explore",
    "/about",
    "/blog",
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
    "/press",
    "/past-events",
    "/sitemap",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const siteUrl = getAppUrl().replace(/\/$/, "");
    const now = new Date();
    // Static pages carry no per-page timestamp, so they are stamped with the build/revalidate time
    // rather than inventing a fresh date on every crawl for the dynamic ones below.
    const staticLastModified = now;

    const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.map((path) => ({
        url: `${siteUrl}${path}`,
        lastModified: staticLastModified,
        changeFrequency: path === "/" || path === "/explore" ? "daily" : "weekly",
        priority: path === "/" ? 1 : path === "/explore" ? 0.9 : 0.6,
    }));

    for (const city of SEO_CITIES) {
        staticEntries.push({
            url: `${siteUrl}${cityPagePath(city)}`,
            lastModified: staticLastModified,
            changeFrequency: "daily",
            priority: 0.9,
        });
    }

    // The special event page is only listed while it is enabled and not past its visible_until
    // date (IST); afterwards it should drop out instead of advertising an ended event.
    const specialPage = resolveSpecialPageSettings((await getPlatformSettings()).special_page);
    if (specialPage.enabled && getIstTodayIso(now) <= specialPage.visibleUntil) {
        staticEntries.push({
            url: `${siteUrl}${specialPage.path}`,
            lastModified: staticLastModified,
            changeFrequency: "daily",
            priority: 0.95,
        });
    }

    const workshopRows = new Map<string, string | null>();
    const communityRows = new Map<string, string | null>();

    if (isSupabaseServiceConfigured) {
        try {
            const serviceClient = createSupabaseServiceClient();
            let [{ data: workshopData, error: workshopError }, { data: communityData }] =
                await Promise.all([
                    serviceClient
                        .from("workshops")
                        .select("id, updated_at")
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
                    .select("id, updated_at")
                    .order("date", { ascending: false })
                    .limit(1000);

                workshopData = fallback.data;
            }

            for (const row of workshopData || []) {
                if (row.id) workshopRows.set(row.id, row.updated_at ?? null);
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

    const workshopEntries: MetadataRoute.Sitemap = Array.from(workshopRows).map(
        ([workshopId, updatedAt]) => ({
            url: `${siteUrl}/workshop/${workshopId}`,
            lastModified: toLastModified(updatedAt),
            changeFrequency: "weekly",
            priority: 0.8,
        })
    );

    const communityEntries: MetadataRoute.Sitemap = Array.from(communityRows).map(
        ([slug, updatedAt]) => ({
            url: `${siteUrl}/communities/${slug}`,
            lastModified: toLastModified(updatedAt),
            changeFrequency: "weekly",
            priority: 0.7,
        })
    );

    return [...staticEntries, ...workshopEntries, ...communityEntries];
}
