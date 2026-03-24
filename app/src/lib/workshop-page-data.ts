import "server-only";

import * as Sentry from "@sentry/core";
import { unstable_noStore as noStore } from "next/cache";
import { warnDevFallback } from "@/lib/dev-warnings";
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
    let fallbackReason = "Supabase service is unavailable.";

    if (isSupabaseServiceConfigured) {
        try {
            const serviceClient = createSupabaseServiceClient({ requestTimeoutMs: 5000 });
            const today = new Date().toISOString().slice(0, 10);

            const [upcomingRes, pastRes] = await Promise.all([
                serviceClient
                    .from("workshops")
                    .select("*")
                    .gte("date", today)
                    .order("date", { ascending: true })
                    .limit(12),
                serviceClient
                    .from("workshops")
                    .select("*")
                    .lt("date", today)
                    .order("date", { ascending: false })
                    .limit(8),
            ]);

            const error = upcomingRes.error || pastRes.error;
            const upcomingData = upcomingRes.data || [];
            const pastData = pastRes.data || [];

            if (!error) {
                const allData = [...upcomingData, ...pastData];
                return {
                    data: allData.map((row) => mapWorkshopRowToWorkshop(row)),
                    source: "supabase",
                };
            }

            if (error) {
                fallbackReason = error.message || "Supabase returned an error for home workshops.";
                Sentry.captureException(error, {
                    tags: {
                        layer: "web",
                        route: "home_page",
                    },
                });
            }
        } catch (error) {
            fallbackReason =
                error instanceof Error
                    ? error.message
                    : "Unexpected error while loading home workshops.";
            Sentry.captureException(error, {
                tags: {
                    layer: "web",
                    route: "home_page",
                },
            });
        }
    }

    if (!allowMockFallback) {
        noStore();
        return {
            data: [],
            source: "error",
        };
    }

    warnDevFallback("home_page", `Using mock workshops because ${fallbackReason}`);

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
    let fallbackReason = "Supabase service is unavailable.";
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
            const serviceClient = createSupabaseServiceClient({ requestTimeoutMs: 5000 });
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
            if (query.category && !isPastEventsCategory) {
                dbQuery = dbQuery.eq("category", query.category);
            }
            if (isPastEventsCategory) {
                const today = new Date().toISOString().slice(0, 10);
                dbQuery = dbQuery.lt("date", today);
            }
            if (!isPastEventsCategory) {
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

            fallbackReason = error.message || "Supabase returned an error for explore workshops.";
            Sentry.captureException(error, {
                tags: {
                    layer: "web",
                    route: "explore_page",
                },
            });
        } catch (error) {
            fallbackReason =
                error instanceof Error
                    ? error.message
                    : "Unexpected error while loading explore workshops.";
            Sentry.captureException(error, {
                tags: {
                    layer: "web",
                    route: "explore_page",
                },
            });
            // Fall through to fallback behavior.
        }
    }

    if (allowMockFallback) {
        warnDevFallback("explore_page", `Using mock workshops because ${fallbackReason}`);
        return queryMockWorkshops(query);
    }

    noStore();
    return {
        data: [],
        total: 0,
        source: "error",
    };
}

export type PlatformSettingsType = {
    service_fee?: number;
    early_bird_offer?: {
        enabled: boolean;
        discount_type: "percentage" | "fixed";
        discount_value: number;
        days_before: number;
    };
};

export async function getPlatformSettings(): Promise<PlatformSettingsType> {
    if (isSupabaseServiceConfigured) {
        try {
            const serviceClient = createSupabaseServiceClient();
            const { data, error } = await serviceClient.from("platform_settings").select("*");

            if (!error && data) {
                const settings = data.reduce((acc, row) => {
                    acc[row.setting_key] = row.setting_value;
                    return acc;
                }, {} as any);
                return settings;
            }
            if (error) {
                Sentry.captureException(error, {
                    tags: {
                        layer: "web",
                        route: "platform_settings",
                    },
                });
            }
        } catch (error) {
            Sentry.captureException(error, {
                tags: {
                    layer: "web",
                    route: "platform_settings",
                },
            });
        }
    }

    return {};
}
