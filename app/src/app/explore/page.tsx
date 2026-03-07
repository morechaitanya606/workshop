import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase-server";
import { workshopQuerySchema } from "@/lib/validators";
import { mapWorkshopRowToWorkshop, queryMockWorkshops } from "@/lib/workshop-utils";
import ExploreClient from "./ExploreClient";

export const metadata = {
    title: "Explore Workshops | Only Workshop",
    description: "Find your next creative adventure.",
};

function getSortConfig(sort: string) {
    if (sort === "date_desc") return { column: "date", ascending: false };
    if (sort === "price_asc") return { column: "price", ascending: true };
    if (sort === "price_desc") return { column: "price", ascending: false };
    if (sort === "rating_desc") return { column: "rating", ascending: false };
    return { column: "date", ascending: true };
}

async function getWorkshops(searchParams: { [key: string]: string | string[] | undefined }) {
    const rawQuery = {
        q: searchParams.q ?? "",
        category: searchParams.category ?? "",
        city: searchParams.city ?? "",
        dateFrom: searchParams.dateFrom ?? "",
        dateTo: searchParams.dateTo ?? "",
        minPrice: searchParams.minPrice ?? undefined,
        maxPrice: searchParams.maxPrice ?? undefined,
        sort: searchParams.sort ?? "date_asc",
        page: searchParams.page ?? 1,
        pageSize: searchParams.pageSize ?? 8,
    };

    const parsed = workshopQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
        return { data: [], total: 0, source: "mock" as const };
    }

    const query = parsed.data;
    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;

    if (isSupabaseServiceConfigured) {
        try {
            const serviceClient = createSupabaseServiceClient();
            const sortConfig = getSortConfig(query.sort);
            let dbQuery = serviceClient.from("workshops").select("*", { count: "exact" });

            if (query.q) {
                const q = query.q.replace(/[%]/g, "");
                dbQuery = dbQuery.or(`title.ilike.%${q}%,description.ilike.%${q}%,location.ilike.%${q}%,city.ilike.%${q}%`);
            }
            if (query.category) {
                dbQuery = dbQuery.eq("category", query.category);
            }
            if (query.city) {
                dbQuery = dbQuery.eq("city", query.city);
            }
            if (query.dateFrom) {
                dbQuery = dbQuery.gte("date", query.dateFrom);
            }
            if (query.dateTo) {
                dbQuery = dbQuery.lte("date", query.dateTo);
            }
            if (typeof query.minPrice === "number") {
                dbQuery = dbQuery.gte("price", query.minPrice);
            }
            if (typeof query.maxPrice === "number") {
                dbQuery = dbQuery.lte("price", query.maxPrice);
            }

            const { data, error, count } = await dbQuery
                .order(sortConfig.column, { ascending: sortConfig.ascending })
                .range(from, to);

            if (!error) {
                return {
                    data: (data || []).map((row) => mapWorkshopRowToWorkshop(row as Record<string, unknown>)),
                    total: count || 0,
                    source: "supabase" as const,
                };
            }
        } catch {
            // fallback
        }
    }

    return queryMockWorkshops(query);
}

export default async function ExplorePage({
    searchParams,
}: {
    searchParams: { [key: string]: string | string[] | undefined };
}) {
    const { data, total, source } = await getWorkshops(searchParams);

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
