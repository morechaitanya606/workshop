import { topicGroups } from "@/lib/city-faqs";
import type { Workshop } from "@/lib/data";
import { getAbsoluteUrl } from "@/lib/env";
import { getIstTodayIso } from "@/lib/ist-date";
import { SEO_CITIES } from "@/lib/seo";
import {
    loadCardPricing,
    loadCityWorkshops,
    workshopCardExtras,
    type CardPricing,
} from "@/lib/workshop-page-data";
import { buildLlmsTxt, type LlmsTxtCity, type LlmsTxtWorkshop } from "./build-llms-txt";

// Regenerated in the background so new workshops show up without a deploy: at most hourly, like
// the sitemap, but loadCityWorkshops' 5-minute cache shortens that to its own window.
export const revalidate = 3600;

/**
 * Each session with the price the site charges now (Early Bird and auto offers) and its closed
 * flag, priced like the cards. Without pricing, or if pricing fails, the list price as before.
 */
function withPrices(upcoming: Workshop[], pricing: CardPricing | null): LlmsTxtWorkshop[] {
    if (!pricing) return upcoming;
    try {
        const { cardOffers, closedWorkshopIds } = workshopCardExtras(
            upcoming,
            pricing,
            getIstTodayIso()
        );
        const closed = new Set(closedWorkshopIds);
        return upcoming.map((workshop) => ({
            ...workshop,
            offer: Object.hasOwn(cardOffers, workshop.id) ? cardOffers[workshop.id] : null,
            bookingsClosed: closed.has(workshop.id),
        }));
    } catch {
        return upcoming;
    }
}

/**
 * Activity pages are the ones the city hub links: the same thin-content rule (topicGroups ->
 * topicIsIndexable) that sets each topic page's robots tag and its sitemap entry. A failed read
 * leaves the city's live sections out instead of failing the whole file.
 */
async function loadCity(
    city: (typeof SEO_CITIES)[number],
    pricing: Promise<CardPricing | null>
): Promise<LlmsTxtCity> {
    try {
        const { upcoming, past, source } = await loadCityWorkshops(city.name);
        if (source === "error") return { city, live: null };
        return {
            city,
            live: {
                topics: topicGroups(upcoming, past)
                    .filter((group) => group.indexable)
                    .map((group) => group.topic),
                upcoming: withPrices(upcoming, await pricing),
            },
        };
    } catch {
        return { city, live: null };
    }
}

export async function GET() {
    // Offers and closed bookings are read once, alongside the workshops; never fatal.
    const pricing = Promise.resolve()
        .then(loadCardPricing)
        .then((value) => value ?? null)
        .catch(() => null);
    const cities = await Promise.all(SEO_CITIES.map((city) => loadCity(city, pricing)));
    const body = buildLlmsTxt({ absoluteUrl: (path) => getAbsoluteUrl(path), cities });

    return new Response(body, {
        headers: {
            "Content-Type": "text/plain; charset=utf-8",
            // For language models to fetch, not a page to rank: it repeats the pages it links.
            "X-Robots-Tag": "noindex",
        },
    });
}
