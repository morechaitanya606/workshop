/**
 * Vercel Speed Insights without the `@vercel/speed-insights` package.
 *
 * The package lists Svelte/Nuxt/Vue as optional peers; npm 10 still resolves them and refuses
 * the install next to vitest's vite 7, and a lockfile forced past that is rejected by `npm ci`
 * (that is why Vercel's own PR #40 failed CI). The Next.js component only injects Vercel's
 * first-party script and keeps `data-route` on the route pattern, which is all this does.
 */

export const SPEED_INSIGHTS_SCRIPT_SRC = "/_vercel/speed-insights/script.js";

function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function segmentMatcher(value: string) {
    return new RegExp(`/${escapeRegExp(value)}(?=[/?#]|$)`);
}

/**
 * `/workshop/abc-123` + `{ id: "abc-123" }` -> `/workshop/[id]`, so the dashboard groups every
 * workshop page under one route instead of one row per URL. Same rules as the package: single
 * params first, then catch-all params as `[...name]`.
 */
export function speedInsightsRoute(
    pathname: string,
    params: Record<string, string | string[] | undefined> | null
) {
    if (!params) return pathname;

    let route = pathname;
    const entries = Object.entries(params);
    for (const [key, value] of entries) {
        if (typeof value === "string" && value) {
            route = route.replace(segmentMatcher(value), `/[${key}]`);
        }
    }
    for (const [key, value] of entries) {
        if (Array.isArray(value) && value.length) {
            route = route.replace(segmentMatcher(value.join("/")), `/[...${key}]`);
        }
    }
    return route;
}
