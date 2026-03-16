import "server-only";

import * as Sentry from "@sentry/core";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase-server";
import { workshopQuerySchema } from "@/lib/validators";
import { mapWorkshopRowToWorkshop, queryMockWorkshops } from "@/lib/workshop-utils";
import { PAST_EVENTS_CATEGORY_LABEL } from "@/lib/data";
import type { Workshop } from "@/lib/data";

export type WorkshopPageSource = "supabase" | "mock" | "error";

export type HomeWorkshopsResult = {
    data: Workshop[];
    source: WorkshopPageSource;
};

export type ExploreWorkshopsResult = {
    data: Workshop[];
    total: number;
    source: WorkshopPageSource;
};

function getSortConfig(sort: string) {
    if (sort === "date_desc") return { column: "date", ascending: false };
    if (sort === "price_asc") return { column: "price", ascending: true };
    if (sort === "price_desc") return { column: "price", ascending: false };
    if (sort === "rating_desc") return { column: "rating", ascending: false };
    return { column: "date", ascending: true };
}

export async function loadHomeWorkshops(): Promise<HomeWorkshopsResult> {
    const allowMockFallback = process.env.NODE_ENV !== "production";

    if (isSupabaseServiceConfigured) {
        try {
            const serviceClient = createSupabaseServiceClient({ requestTimeoutMs: 1500 });
            const { data, error } = await serviceClient
                .from("workshops")
                .select("*")
                .order("date", { ascending: true })
                .limit(12);

            if (!error && data) {
                return {
                    data: data.map((row) => mapWorkshopRowToWorkshop(row)),
                    source: "supabase",
                };
            }

            if (error) {
                Sentry.captureException(error, {
                    tags: {
                        layer: "web",
                        route: "home_page",
                    },
                });
            }
        } catch (error) {
            Sentry.captureException(error, {
                tags: {
                    layer: "web",
                    route: "home_page",
                },
            });
        }
    }

    if (!allowMockFallback) {
        return {
            data: [],
            source: "error",
        };
    }

    return {
        data: queryMockWorkshops({
            q: "",
            category: "",
            city: "",
            dateFrom: "",
            dateTo: "",
            sort: "date_asc",
            page: 1,
            pageSize: 12,
        }).data,
        source: "mock",
    };
}

export async function loadExploreWorkshops(searchParams: {
    [key: string]: string | string[] | undefined;
}): Promise<ExploreWorkshopsResult> {
    const allowMockFallback = process.env.NODE_ENV !== "production";
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
        return {
            data: [],
            total: 0,
            source: "error",
        };
    }

    const query = parsed.data;
    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;

    if (isSupabaseServiceConfigured) {
        try {
            const serviceClient = createSupabaseServiceClient({ requestTimeoutMs: 1500 });
            const sortConfig = getSortConfig(query.sort);
            let dbQuery = serviceClient.from("workshops").select("*", { count: "exact" });

            if (query.q) {
                const q = query.q.replace(/[%]/g, "");
                dbQuery = dbQuery.or(
                    `title.ilike.%${q}%,description.ilike.%${q}%,location.ilike.%${q}%,city.ilike.%${q}%`
                );
            }
            const isPastEventsCategory =
                query.category.toLowerCase() === PAST_EVENTS_CATEGORY_LABEL.toLowerCase();
            const hasDateFilter = Boolean(query.dateFrom || query.dateTo);
            if (query.category && !isPastEventsCategory) {
                dbQuery = dbQuery.eq("category", query.category);
            }
            if (isPastEventsCategory) {
                const today = new Date().toISOString().slice(0, 10);
                dbQuery = dbQuery.lt("date", today);
            }
            if (!isPastEventsCategory && !hasDateFilter) {
                const today = new Date().toISOString().slice(0, 10);
                dbQuery = dbQuery.gte("date", today);
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
                    data: (data || []).map((row) => mapWorkshopRowToWorkshop(row)),
                    total: count || 0,
                    source: "supabase",
                };
            }
        } catch {
            // Fall through to fallback behavior.
        }
    }

    if (allowMockFallback) {
        return queryMockWorkshops(query);
    }

    return {
        data: [],
        total: 0,
        source: "error",
    };
}
