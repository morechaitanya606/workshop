import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase-server";
import { workshopQuerySchema } from "@/lib/validators";
import {
    mapWorkshopRowToWorkshop,
    queryMockWorkshops,
} from "@/lib/workshop-utils";

function getQueryObject(request: NextRequest) {
    const params = request.nextUrl.searchParams;
    return {
        q: params.get("q") ?? "",
        category: params.get("category") ?? "",
        city: params.get("city") ?? "",
        dateFrom: params.get("dateFrom") ?? "",
        dateTo: params.get("dateTo") ?? "",
        minPrice: params.get("minPrice") ?? undefined,
        maxPrice: params.get("maxPrice") ?? undefined,
        sort: params.get("sort") ?? "date_asc",
        page: params.get("page") ?? 1,
        pageSize: params.get("pageSize") ?? 8,
    };
}

function getSortConfig(sort: string) {
    if (sort === "date_desc") return { column: "date", ascending: false };
    if (sort === "price_asc") return { column: "price", ascending: true };
    if (sort === "price_desc") return { column: "price", ascending: false };
    if (sort === "rating_desc") return { column: "rating", ascending: false };
    return { column: "date", ascending: true };
}

export async function GET(request: NextRequest) {
    const parsed = workshopQuerySchema.safeParse(getQueryObject(request));
    if (!parsed.success) {
        return NextResponse.json(
            {
                error: "Invalid workshop search query.",
                details: parsed.error.flatten(),
            },
            { status: 400 }
        );
    }

    const query = parsed.data;
    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;

    if (isSupabaseServiceConfigured) {
        try {
            const serviceClient = createSupabaseServiceClient();
            const sortConfig = getSortConfig(query.sort);
            let dbQuery = serviceClient
                .from("workshops")
                .select("*", { count: "exact" });

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

            return NextResponse.json({
                data: (data || []).map((row) =>
                    mapWorkshopRowToWorkshop(row as Record<string, unknown>)
                ),
                total: count || 0,
                page: query.page,
                pageSize: query.pageSize,
                source: "supabase",
            });
        } catch (error) {
            const fallback = queryMockWorkshops(query);
            return NextResponse.json({
                ...fallback,
                warning:
                    "Falling back to mock workshops because Supabase query failed.",
                error: String(error),
            });
        }
    }

    const fallback = queryMockWorkshops(query);
    return NextResponse.json(fallback);
}
