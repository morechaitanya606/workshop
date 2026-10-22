import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { loadPublicCommunities } from "@/lib/community-page-data";
import { getAbsoluteUrl } from "@/lib/env";
import { DEFAULT_OG_IMAGES } from "@/lib/seo";
import { getIstTodayIso } from "@/lib/ist-date";
import { loadExploreWorkshops } from "@/lib/workshop-page-data";
import ExploreClient from "./ExploreClient";

// Dates and prices are what this page has that the evergreen /workshops/pune hub does not, so
// the title leads with them instead of competing for "workshops in Pune".
const title = "Upcoming Workshop Dates & Prices in Pune | Only Workshops";
const description =
    "Browse upcoming creative workshops in Pune by date, price and category: pottery, baking, cooking and more. Filter, compare and book your seat online.";
const canonical = getAbsoluteUrl("/explore");

export const metadata: Metadata = {
    title,
    description,
    alternates: {
        canonical,
    },
    // Own social preview (WhatsApp, Instagram links) instead of the generic site one.
    openGraph: { title, description, url: canonical, type: "website", images: DEFAULT_OG_IMAGES },
    twitter: { card: "summary_large_image", title, description },
};

export default async function ExplorePage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const resolvedSearchParams = await searchParams;
    const todayIso = getIstTodayIso();
    const [{ data, total, source }, { data: featuredCommunities }] = await Promise.all([
        loadExploreWorkshops(resolvedSearchParams),
        loadPublicCommunities(3),
    ]);

    return (
        <Suspense
            fallback={
                <div className="flex min-h-[60vh] items-center justify-center bg-cream">
                    <Loader2 className="w-8 h-8 animate-spin text-terracotta" />
                </div>
            }
        >
            <ExploreClient
                workshops={data}
                featuredCommunities={featuredCommunities}
                total={total}
                source={source}
                todayIso={todayIso}
            />
        </Suspense>
    );
}
