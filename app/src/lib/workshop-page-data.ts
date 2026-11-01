import "server-only";

import { unstable_cache } from "next/cache";
import { NotCached, readThroughCache, withOneRetry } from "@/lib/cache-success-only";

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
import { cardOfferFor, type CardOffer, type PublicOffer } from "@/lib/offers";
import { loadPublicOffers } from "@/lib/offers-server";
import { buildIlikeOrFilter } from "@/lib/search-sanitize";
import { isBookingClosed } from "@/lib/workshop-availability";
import { loadClosedWorkshopIds } from "@/lib/workshop-availability-server";

export type WorkshopPageSource = "supabase" | "error";

/** process.env.NEXT_PHASE while `next build` prerenders pages (PHASE_PRODUCTION_BUILD). */
const PRODUCTION_BUILD_PHASE = "phase-production-build";

/** Thrown by failRenderOnDataError: the page render is abandoned on purpose. */
export class WorkshopDataUnavailableError extends Error {
    constructor(page: string) {
        super(`Workshop data could not be read for ${page}; keeping the last good page.`);
        this.name = "WorkshopDataUnavailableError";
    }
}

/**
 * Whole pages are cached as well as their data (ISR: the homepage and /past-events for 60 s,
 * city and topic pages for 300 s), so a page rendered after a failed read ("Unable to load live
 * workshops", empty lists) was served to everyone for that window, and its Refresh button read
 * the cached failure back. When a read has still failed after its retry, the page throws
 * instead: Next keeps serving the last good page and renders again on the next request
 * (error.tsx is shown only when nothing is cached yet).
 * Not while `next build` prerenders (a database moment must not fail a deploy: that render
 * shows the error state as before), and not without a database configured (local
 * development), where the failure is permanent and the error state is the useful answer.
 * Nor under `next dev`: there is no last good page to keep, so abandoning the render only
 * turned a slow first compile into a 500 instead of the page's own error state with Refresh.
 */
export function failRenderOnDataError(source: WorkshopPageSource, page: string) {
    if (source !== "error" || !isSupabaseServiceConfigured) return;
    if (process.env.NEXT_PHASE === PRODUCTION_BUILD_PHASE) return;
    if (process.env.NODE_ENV === "development") return;
    throw new WorkshopDataUnavailableError(page);
}

/** What cards need besides the workshop: the live coupon offers and the closed bookings. */
export type CardPricing = {
    /** loadPublicOffers(): coupon offers only; Early Bird comes from each workshop's own row. */
    offers: PublicOffer[];
    closedWorkshopIds: ReadonlySet<string>;
};

/**
 * Offers and closed bookings for a page of cards. Both reads are cached and never throw; a
 * failure means no offers and nothing closed, which is today's look, and is never cached.
 * Start it alongside the workshop read: neither depends on the other.
 */
export async function loadCardPricing(): Promise<CardPricing> {
    const [offers, closedWorkshopIds] = await Promise.all([
        loadPublicOffers().catch((): PublicOffer[] => []),
        loadClosedWorkshopIds().catch(() => new Set<string>()),
    ]);
    return { offers, closedWorkshopIds };
}

/** Serializable props for WorkshopCard lists (server component -> client component). */
export type WorkshopCardExtras = {
    /** CardOffer by workshop id, only for upcoming, bookable workshops with a real discount. */
    cardOffers: Record<string, CardOffer>;
    /** The ids among these workshops whose bookings the admin closed. */
    closedWorkshopIds: string[];
};

/**
 * Card offers and closed flags for these workshops, priced at `now` with the same quote as
 * checkout (cardOfferFor). A closed or past workshop gets no offer. Pure.
 */
export function workshopCardExtras(
    workshops: readonly Workshop[],
    pricing: CardPricing,
    todayIso: string,
    now: number = Date.now()
): WorkshopCardExtras {
    const cardOffers: Record<string, CardOffer> = {};
    const closedWorkshopIds: string[] = [];
    for (const workshop of workshops) {
        if (isBookingClosed(workshop.id, pricing.closedWorkshopIds)) {
            if (!closedWorkshopIds.includes(workshop.id)) closedWorkshopIds.push(workshop.id);
            continue;
        }
        if (workshop.date < todayIso || Object.hasOwn(cardOffers, workshop.id)) continue;
        const offer = cardOfferFor(workshop, pricing.offers, now);
        if (offer) cardOffers[workshop.id] = offer;
    }
    return { cardOffers, closedWorkshopIds };
}

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

/**
 * The homepage rails. Retried once (most failures are one-off timeouts); the page itself is
 * cached whole, so a result that still failed makes it keep its last good copy
 * (failRenderOnDataError).
 */
export async function loadHomeWorkshops(): Promise<HomeWorkshopsResult> {
    return withOneRetry(fetchHomeWorkshops, (attempt) => attempt.source === "error");
}

async function fetchHomeWorkshops(): Promise<HomeWorkshopsResult> {
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

    // A failed query is retried once and never cached (see lib/cache-success-only.ts).
    return readThroughCache(
        unstable_cache(
            async () => {
                const result = await withOneRetry(
                    () => fetchExploreWorkshops(query, normalizedCategory),
                    (attempt) => attempt.source === "error"
                );
                if (result.source === "error") throw new NotCached(result);
                return result;
            },
            ["explore-workshops", cacheKey],
            { revalidate: 60, tags: [WORKSHOPS_LIST_TAG] }
        )
    );
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

export type CityWorkshopsResult = {
    upcoming: Workshop[];
    past: Workshop[];
    source: WorkshopPageSource;
};

/** Approved workshops in one city for its /workshops/<city> landing page. */
async function fetchCityWorkshops(cityName: string): Promise<CityWorkshopsResult> {
    if (!isSupabaseServiceConfigured) {
        return { upcoming: [], past: [], source: "error" };
    }

    try {
        const serviceClient = createSupabaseServiceClient({ requestTimeoutMs: 5000 });
        const today = getIstTodayIso();
        const run = (includeApprovalFilter: boolean) => {
            let dbQuery = serviceClient.from("workshops").select("*").ilike("city", cityName);
            if (includeApprovalFilter) {
                dbQuery = dbQuery.eq("approval_status", "approved");
            }
            // Newest first, like the sitemap: with an oldest-first limit the upcoming sessions
            // were the rows that fell off once the city had more than the limit.
            return dbQuery.order("date", { ascending: false }).limit(1000);
        };

        let { data, error } = await run(true);
        if (error && isMissingApprovalStatusColumnError(error)) {
            ({ data, error } = await run(false));
        }

        if (!error) {
            const workshops = (data || []).map((row) => mapWorkshopRowToWorkshop(row));
            return {
                upcoming: workshops.filter((workshop) => workshop.date >= today).reverse(),
                past: workshops.filter((workshop) => workshop.date < today),
                source: "supabase",
            };
        }

        Sentry.captureException(error, { tags: { layer: "web", route: "city_page" } });
    } catch (error) {
        Sentry.captureException(error, { tags: { layer: "web", route: "city_page" } });
    }

    return { upcoming: [], past: [], source: "error" };
}

export async function loadCityWorkshops(cityName: string): Promise<CityWorkshopsResult> {
    // A failed query is retried once and never cached: a cached empty list would also have made
    // the topic pages answer noindex for the whole window.
    return readThroughCache(
        unstable_cache(
            async () => {
                const result = await withOneRetry(
                    () => fetchCityWorkshops(cityName),
                    (attempt) => attempt.source === "error"
                );
                if (result.source === "error") throw new NotCached(result);
                return result;
            },
            ["city-workshops", cityName],
            { revalidate: 300, tags: [WORKSHOPS_LIST_TAG] }
        )
    );
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
            // Same limit as the other page reads: a stalled query must not hold the render.
            const serviceClient = createSupabaseServiceClient({ requestTimeoutMs: 5000 });
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
