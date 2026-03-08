import type { MetadataRoute } from "next";
import { getAppUrl } from "@/lib/env";
import { mockWorkshops } from "@/lib/data";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase-server";

const STATIC_PATHS = [
    "/",
    "/explore",
    "/about",
    "/blog",
    "/contact",
    "/careers",
    "/help",
    "/press",
    "/safety",
    "/cancellations",
    "/legal/privacy",
    "/legal/terms",
    "/sitemap",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const siteUrl = getAppUrl().replace(/\/$/, "");
    const now = new Date();

    const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.map((path) => ({
        url: `${siteUrl}${path}`,
        lastModified: now,
        changeFrequency: path === "/" || path === "/explore" ? "daily" : "weekly",
        priority: path === "/" ? 1 : path === "/explore" ? 0.9 : 0.6,
    }));

    const workshopIds = new Set<string>(mockWorkshops.map((item) => item.id));
    if (isSupabaseServiceConfigured) {
        try {
            const serviceClient = createSupabaseServiceClient();
            const { data } = await serviceClient
                .from("workshops")
                .select("id")
                .order("date", { ascending: false })
                .limit(1000);

            for (const row of data || []) {
                if (row.id) workshopIds.add(row.id);
            }
        } catch {
            // fall back to mock ids only
        }
    }

    const workshopEntries: MetadataRoute.Sitemap = Array.from(workshopIds).map((workshopId) => ({
        url: `${siteUrl}/workshop/${workshopId}`,
        lastModified: now,
        changeFrequency: "weekly",
        priority: 0.8,
    }));

    return [...staticEntries, ...workshopEntries];
}
