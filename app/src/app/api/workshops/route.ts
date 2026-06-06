import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { handleApiError, parseQuery } from "@/lib/api-route";
import { workshopQuerySchema } from "@/lib/validators";
import { mapWorkshopRowToWorkshop } from "@/lib/workshop-utils";
import { isMissingColumnError } from "@/lib/workshop-approval-compat";
import { normalizeFilterCategoryLabel } from "@/lib/data";
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

function buildWorkshopListQuery(
    supabase: ReturnType<typeof createSupabaseAnonServerClient>,
    query: ReturnType<typeof workshopQuerySchema.parse>,
    normalizedCategory: string,
    from: number,
    to: number,
    includeApprovalFilter = true
) {
    const sortConfig = getSortConfig(query.sort);
    let dbQuery = supabase.from("workshops").select("*", { count: "exact" });

    if (includeApprovalFilter) {
        dbQuery = dbQuery.eq("approval_status", "approved");
    }

    if (query.q) {
        const q = query.q.replace(/[%]/g, "");
        dbQuery = dbQuery.or(
            `title.ilike.%${q}%,description.ilike.%${q}%,location.ilike.%${q}%,city.ilike.%${q}%`
        );
    }
    if (normalizedCategory) {
        dbQuery = dbQuery.eq("category", normalizedCategory);
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

    return dbQuery.order(sortConfig.column, { ascending: sortConfig.ascending }).range(from, to);
}

export async function GET(request: NextRequest) {
    const parsed = parseQuery(request, workshopQuerySchema, "Invalid workshop search query.");
    if (!parsed.ok) {
        return parsed.response;
    }

    const query = parsed.data;
    const normalizedCategory = normalizeFilterCategoryLabel(query.category);
    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;

    if (!isSupabasePublicConfigured) {
        return NextResponse.json(
            { error: "Supabase public env vars are missing on the server." },
            { status: 500 }
        );
    }

    try {
        const supabase = createSupabaseAnonServerClient();
        let { data, error, count } = await buildWorkshopListQuery(
            supabase,
            query,
            normalizedCategory,
            from,
            to
        );

        if (error && isMissingColumnError(error)) {
            ({ data, error, count } = await buildWorkshopListQuery(
                supabase,
                query,
                normalizedCategory,
                from,
                to,
                false
            ));
        }

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
        return handleApiError("Failed to load workshops.", error);
    }
}
