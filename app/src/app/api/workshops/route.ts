import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { handleApiError, parseQuery } from "@/lib/api-route";
import { workshopQuerySchema } from "@/lib/validators";
import { mapWorkshopRowToWorkshop, queryMockWorkshops } from "@/lib/workshop-utils";
import { createSupabaseAnonServerClient, isSupabasePublicConfigured } from "@/lib/supabase-server";

const WORKSHOP_LIST_CACHE_HEADERS = {
    "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
};

function getSortConfig(sort: string) {
    if (sort === "date_desc") return { column: "date", ascending: false };
    if (sort === "price_asc") return { column: "price", ascending: true };
    if (sort === "price_desc") return { column: "price", ascending: false };
    if (sort === "rating_desc") return { column: "rating", ascending: false };
    return { column: "date", ascending: true };
}

export async function GET(request: NextRequest) {
    const parsed = parseQuery(request, workshopQuerySchema, "Invalid workshop search query.");
    if (!parsed.ok) {
        return parsed.response;
    }

    const query = parsed.data;
    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;
    const allowMockFallback = process.env.NODE_ENV !== "production";

    if (!isSupabasePublicConfigured) {
        if (!allowMockFallback) {
            return NextResponse.json(
                { error: "Supabase public env vars are missing on the server." },
                { status: 500 }
            );
        }
        const fallback = queryMockWorkshops(query);
        return NextResponse.json(fallback, { headers: WORKSHOP_LIST_CACHE_HEADERS });
    }

    try {
        const supabase = createSupabaseAnonServerClient();
        const sortConfig = getSortConfig(query.sort);
        let dbQuery = supabase.from("workshops").select("*", { count: "exact" });

        if (query.q) {
            const q = query.q.replace(/[%]/g, "");
            dbQuery = dbQuery.or(
                `title.ilike.%${q}%,description.ilike.%${q}%,location.ilike.%${q}%,city.ilike.%${q}%`
            );
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

        if (error) {
            throw error;
        }

        return NextResponse.json(
            {
                data: (data || []).map((row) => mapWorkshopRowToWorkshop(row)),
                total: count || 0,
                page: query.page,
                pageSize: query.pageSize,
                source: "supabase_anon",
            },
            {
                headers: WORKSHOP_LIST_CACHE_HEADERS,
            }
        );
    } catch (error) {
        if (allowMockFallback) {
            const fallback = queryMockWorkshops(query);
            return NextResponse.json(
                {
                    ...fallback,
                    warning: "Falling back to mock workshops because Supabase query failed.",
                    error: String(error),
                },
                {
                    headers: WORKSHOP_LIST_CACHE_HEADERS,
                }
            );
        }
        return handleApiError("Failed to load workshops.", error);
    }
}
