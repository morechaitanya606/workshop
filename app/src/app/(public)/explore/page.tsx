import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { loadPublicCommunities } from "@/lib/community-page-data";
import { getAbsoluteUrl } from "@/lib/env";
import { loadExploreWorkshops } from "@/lib/workshop-page-data";
import ExploreClient from "./ExploreClient";

export const metadata: Metadata = {
    title: "Explore Workshops | Only Workshops",
    description: "Find your next creative adventure.",
    alternates: {
        canonical: getAbsoluteUrl("/explore"),
    },
};

export default async function ExplorePage({
    searchParams,
}: {
    searchParams: { [key: string]: string | string[] | undefined };
}) {
    const todayIso = new Date().toISOString().slice(0, 10);
    const [{ data, total, source }, { data: featuredCommunities }] = await Promise.all([
        loadExploreWorkshops(searchParams),
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
