import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { loadPublicCommunities } from "@/lib/community-page-data";
import { getAbsoluteUrl } from "@/lib/env";
import { getIstTodayIso } from "@/lib/ist-date";
import { loadExploreWorkshops } from "@/lib/workshop-page-data";
import ExploreClient from "./ExploreClient";

export const metadata: Metadata = {
    title: "Explore Workshops in Pune | Only Workshops",
    description:
        "Browse upcoming creative workshops in Pune by date, price and category: pottery, baking, cooking and more. Filter, compare and book your seat online.",
    alternates: {
        canonical: getAbsoluteUrl("/explore"),
    },
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
