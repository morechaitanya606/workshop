import "server-only";

import * as Sentry from "@sentry/core";
import { unstable_noStore as noStore } from "next/cache";
import { warnDevFallback } from "@/lib/dev-warnings";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase-server";
import { workshopQuerySchema } from "@/lib/validators";
import { mapWorkshopRowToWorkshop, queryMockWorkshops } from "@/lib/workshop-utils";
import { isMissingApprovalStatusColumnError } from "@/lib/workshop-approval-compat";
import { normalizeFilterCategoryLabel, PAST_EVENTS_CATEGORY_LABEL } from "@/lib/data";
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

function buildHomeWorkshopQuery(
    serviceClient: ReturnType<typeof createSupabaseServiceClient>,
    options: {
        comparison: "gte" | "lt";
        date: string;
        limit: number;
        ascending: boolean;
        includeApprovalFilter?: boolean;
    }
) {
    let query = serviceClient.from("workshops").select("*");

    if (options.includeApprovalFilter !== false) {
        query = query.eq("approval_status", "approved");
    }

    query =
        options.comparison === "gte"
            ? query.gte("date", options.date)
            : query.lt("date", options.date);

    return query.order("date", { ascending: options.ascending }).limit(options.limit);
}

function buildExploreWorkshopQuery(
    serviceClient: ReturnType<typeof createSupabaseServiceClient>,
    query: ReturnType<typeof workshopQuerySchema.parse>,
    normalizedCategory: string,
    from: number,
    to: number,
    includeApprovalFilter = true
) {
    const sortConfig = getSortConfig(query.sort);
    let dbQuery = serviceClient.from("workshops").select("*", { count: "exact" });

    if (includeApprovalFilter) {
        dbQuery = dbQuery.eq("approval_status", "approved");
    }

    if (query.q) {
        const q = query.q.replace(/[%]/g, "");
        dbQuery = dbQuery.or(
            `title.ilike.%${q}%,description.ilike.%${q}%,location.ilike.%${q}%,city.ilike.%${q}%`
        );
    }
    const isPastEventsCategory =
        normalizedCategory.toLowerCase() === PAST_EVENTS_CATEGORY_LABEL.toLowerCase();
    if (normalizedCategory && !isPastEventsCategory) {
        dbQuery = dbQuery.eq("category", normalizedCategory);
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

    return dbQuery.order(sortConfig.column, { ascending: sortConfig.ascending }).range(from, to);
}

export async function loadHomeWorkshops(): Promise<HomeWorkshopsResult> {
    const allowMockFallback = process.env.NODE_ENV !== "production";
    let fallbackReason = "Supabase service is unavailable.";

    if (isSupabaseServiceConfigured) {
        try {
            const serviceClient = createSupabaseServiceClient({ requestTimeoutMs: 5000 });
            const today = new Date().toISOString().slice(0, 10);

            let [upcomingRes, pastRes] = await Promise.all([
                buildHomeWorkshopQuery(serviceClient, {
                    comparison: "gte",
                    date: today,
                    limit: 12,
                    ascending: true,
                }),
                buildHomeWorkshopQuery(serviceClient, {
                    comparison: "lt",
                    date: today,
                    limit: 8,
                    ascending: false,
                }),
            ]);

            let error = upcomingRes.error || pastRes.error;
            let upcomingData = upcomingRes.data || [];
            let pastData = pastRes.data || [];

            if (error && isMissingApprovalStatusColumnError(error)) {
                [upcomingRes, pastRes] = await Promise.all([
                    buildHomeWorkshopQuery(serviceClient, {
                        comparison: "gte",
                        date: today,
                        limit: 12,
                        ascending: true,
                        includeApprovalFilter: false,
                    }),
                    buildHomeWorkshopQuery(serviceClient, {
                        comparison: "lt",
                        date: today,
                        limit: 8,
                        ascending: false,
                        includeApprovalFilter: false,
                    }),
                ]);

                error = upcomingRes.error || pastRes.error;
                upcomingData = upcomingRes.data || [];
                pastData = pastRes.data || [];
            }

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
    const normalizedCategory = normalizeFilterCategoryLabel(query.category);
    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;

    if (isSupabaseServiceConfigured) {
        try {
            const serviceClient = createSupabaseServiceClient({ requestTimeoutMs: 5000 });
            let { data, error, count } = await buildExploreWorkshopQuery(
                serviceClient,
                query,
                normalizedCategory,
                from,
                to
            );

            if (error && isMissingApprovalStatusColumnError(error)) {
                ({ data, error, count } = await buildExploreWorkshopQuery(
                    serviceClient,
                    query,
                    normalizedCategory,
                    from,
                    to,
                    false
                ));
            }

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
        return queryMockWorkshops({
            ...query,
            category: normalizedCategory,
        });
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
