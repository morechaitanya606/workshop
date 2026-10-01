import "server-only";

import { unstable_cache } from "next/cache";

import * as Sentry from "@sentry/nextjs";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase-server";
import { workshopQuerySchema } from "@/lib/validators";
import { mapWorkshopRowToWorkshop } from "@/lib/workshop-utils";
import { isMissingApprovalStatusColumnError } from "@/lib/workshop-approval-compat";
import {
    normalizeGroupFilterLabel,
    PAST_EVENTS_CATEGORY_LABEL,
    resolveCategoryFilterValues,
} from "@/lib/data";
import type { Workshop } from "@/lib/data";
import type { SpecialPageSettings } from "@/lib/special-page";
import { WORKSHOPS_LIST_TAG } from "@/lib/cached-reads";
import { getIstTodayIso } from "@/lib/ist-date";
import { buildIlikeOrFilter } from "@/lib/search-sanitize";

export type WorkshopPageSource = "supabase" | "error";

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

    const searchFilter = buildIlikeOrFilter(["title", "description", "location", "city"], query.q);
    if (searchFilter) {
        dbQuery = dbQuery.or(searchFilter);
    }
    const isPastEventsCategory =
        normalizedCategory.toLowerCase() === PAST_EVENTS_CATEGORY_LABEL.toLowerCase();
    if (normalizedCategory && !isPastEventsCategory) {
        // A browse group can cover several stored category values, so match the whole set.
        const categoryValues = resolveCategoryFilterValues(normalizedCategory);
        if (categoryValues.length === 1) {
            dbQuery = dbQuery.eq("category", categoryValues[0]);
        } else if (categoryValues.length > 1) {
            dbQuery = dbQuery.in("category", categoryValues);
        }
    }
    const today = getIstTodayIso();
    dbQuery = isPastEventsCategory ? dbQuery.lt("date", today) : dbQuery.gte("date", today);
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
    if (isSupabaseServiceConfigured) {
        try {
            const serviceClient = createSupabaseServiceClient({ requestTimeoutMs: 5000 });
            const today = getIstTodayIso();

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

    return {
        data: [],
        source: "error",
    };
}

type ExploreQuery = ReturnType<typeof workshopQuerySchema.parse>;

async function fetchExploreWorkshops(
    query: ExploreQuery,
    normalizedCategory: string
): Promise<ExploreWorkshopsResult> {
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

            Sentry.captureException(error, {
                tags: {
                    layer: "web",
                    route: "explore_page",
                },
            });
        } catch (error) {
            Sentry.captureException(error, {
                tags: {
                    layer: "web",
                    route: "explore_page",
                },
            });
        }
    }

    return {
        data: [],
        total: 0,
        source: "error",
    };
}

/**
 * /explore is a dynamic segment (it awaits `searchParams`), so `export const revalidate`
 * cannot help it. Caching the data layer instead gives the same effect where it matters:
 * repeated identical filter tuples share one Postgres round trip for 60s. The key is built
 * from the POST-zod query, so `?sort=date_asc&page=1` and `?page=1` collapse to one entry.
 */
export async function loadExploreWorkshops(searchParams: {
    [key: string]: string | string[] | undefined;
}): Promise<ExploreWorkshopsResult> {
    // A repeated param (`?q=a&q=b`) arrives as an array; only the first value is meaningful.
    const param = (key: string) => {
        const value = searchParams[key];
        return Array.isArray(value) ? value[0] : value;
    };
    const rawQuery = {
        q: param("q") ?? "",
        category: param("category") ?? "",
        city: param("city") ?? "",
        dateFrom: param("dateFrom") ?? "",
        dateTo: param("dateTo") ?? "",
        minPrice: param("minPrice") ?? undefined,
        maxPrice: param("maxPrice") ?? undefined,
        sort: param("sort") ?? "date_asc",
        page: param("page") ?? 1,
        pageSize: param("pageSize") ?? 8,
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
    const normalizedCategory = normalizeGroupFilterLabel(query.category);
    const cacheKey = JSON.stringify({ ...query, category: normalizedCategory });

    return unstable_cache(
        () => fetchExploreWorkshops(query, normalizedCategory),
        ["explore-workshops", cacheKey],
        { revalidate: 60, tags: [WORKSHOPS_LIST_TAG] }
    )();
}

export type PastWorkshopsResult = {
    data: Workshop[];
    total: number;
    source: WorkshopPageSource;
};

export const PAST_WORKSHOPS_PAGE_SIZE = 12;

/**
 * Dedicated, paginated query for the past-events page. Reusing `loadHomeWorkshops` meant fetching
 * (and throwing away) a dozen upcoming rows and capping the archive at 8 events.
 */
export async function loadPastWorkshops(
    page = 1,
    pageSize = PAST_WORKSHOPS_PAGE_SIZE
): Promise<PastWorkshopsResult> {
    const safePage = Number.isFinite(page) ? Math.min(Math.max(Math.floor(page), 1), 200) : 1;
    const safeSize = Math.min(Math.max(Math.floor(pageSize), 1), 48);
    const from = (safePage - 1) * safeSize;
    const to = from + safeSize - 1;

    if (isSupabaseServiceConfigured) {
        try {
            const serviceClient = createSupabaseServiceClient({ requestTimeoutMs: 5000 });
            const today = getIstTodayIso();
            const run = (includeApprovalFilter: boolean) => {
                let dbQuery = serviceClient.from("workshops").select("*", { count: "exact" });
                if (includeApprovalFilter) {
                    dbQuery = dbQuery.eq("approval_status", "approved");
                }
                return dbQuery
                    .lt("date", today)
                    .order("date", { ascending: false })
                    .range(from, to);
            };

            let { data, error, count } = await run(true);
            if (error && isMissingApprovalStatusColumnError(error)) {
                ({ data, error, count } = await run(false));
            }

            if (!error) {
                return {
                    data: (data || []).map((row) => mapWorkshopRowToWorkshop(row)),
                    total: count || 0,
                    source: "supabase",
                };
            }

            Sentry.captureException(error, {
                tags: { layer: "web", route: "past_events_page" },
            });
        } catch (error) {
            Sentry.captureException(error, {
                tags: { layer: "web", route: "past_events_page" },
            });
        }
    }

    return { data: [], total: 0, source: "error" };
}

export type PlatformSettingsType = {
    service_fee?: number;
    hero_image_url?: string;
    early_bird_offer?: {
        enabled: boolean;
        discount_type: "percentage" | "fixed";
        discount_value: number;
        days_before: number;
    };
    special_page?: SpecialPageSettings;
};

export async function getPlatformSettings(): Promise<PlatformSettingsType> {
    if (isSupabaseServiceConfigured) {
        try {
            const serviceClient = createSupabaseServiceClient();
            const { data, error } = await serviceClient.from("platform_settings").select("*");

            if (!error && data) {
                const settings = data.reduce<Record<string, unknown>>((acc, row) => {
                    acc[row.setting_key] = row.setting_value;
                    return acc;
                }, {});
                return settings as PlatformSettingsType;
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
