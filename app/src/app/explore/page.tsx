import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { loadExploreWorkshops } from "@/lib/workshop-page-data";
import ExploreClient from "./ExploreClient";

export const metadata = {
    title: "Explore Workshops | Only Workshops",
    description: "Find your next creative adventure.",
};

export default async function ExplorePage({
    searchParams,
}: {
    searchParams: { [key: string]: string | string[] | undefined };
}) {
    const { data, total, source } = await loadExploreWorkshops(searchParams);

    return (
        <Suspense
            fallback={
                <main className="min-h-screen flex items-center justify-center bg-cream">
                    <Loader2 className="w-8 h-8 animate-spin text-terracotta" />
                </main>
            }
        >
            <ExploreClient workshops={data} total={total} source={source} />
        </Suspense>
    );
}
