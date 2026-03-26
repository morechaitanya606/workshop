import type { MetadataRoute } from "next";
import { getAppUrl } from "@/lib/env";
import { mockWorkshops } from "@/lib/data";
import { mockCommunities } from "@/lib/communities";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase-server";
import { isMissingApprovalStatusColumnError } from "@/lib/workshop-approval-compat";

const STATIC_PATHS = [
    "/",
    "/explore",
    "/about",
    "/contact",
    "/careers",
    "/communities",
    "/communities/new",
    "/help",
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
    const communitySlugs = new Set<string>(mockCommunities.map((item) => item.slug));
    if (isSupabaseServiceConfigured) {
        try {
            const serviceClient = createSupabaseServiceClient();
            let [{ data: workshopData, error: workshopError }, { data: communityData }] =
                await Promise.all([
                    serviceClient
                        .from("workshops")
                        .select("id")
                        .eq("approval_status", "approved")
                        .order("date", { ascending: false })
                        .limit(1000),
                    serviceClient.from("communities").select("slug").order("created_at", {
                        ascending: false,
                    }),
                ]);

            if (workshopError && isMissingApprovalStatusColumnError(workshopError)) {
                const fallback = await serviceClient
                    .from("workshops")
                    .select("id")
                    .order("date", { ascending: false })
                    .limit(1000);

                workshopData = fallback.data;
            }

            for (const row of workshopData || []) {
                if (row.id) workshopIds.add(row.id);
            }
            for (const row of communityData || []) {
                if (row.slug) communitySlugs.add(row.slug);
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

    const communityEntries: MetadataRoute.Sitemap = Array.from(communitySlugs).map((slug) => ({
        url: `${siteUrl}/communities/${slug}`,
        lastModified: now,
        changeFrequency: "weekly",
        priority: 0.7,
    }));

    return [...staticEntries, ...workshopEntries, ...communityEntries];
}
