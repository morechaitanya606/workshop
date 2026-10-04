import type { Workshop } from "@/lib/data";

/**
 * Next replaces (does not merge) a child's `openGraph` object over the parent's, so a page that
 * sets its own `openGraph.title` silently loses the root layout's `images`. Spread this into any
 * page-level `openGraph` that does not have an image of its own.
 */
export const DEFAULT_OG_IMAGES = [
    {
        url: "/images/og-default.jpg",
        width: 1200,
        height: 630,
        alt: "Only Workshops social preview",
    },
];

/*
 * Search-engine helpers shared by page metadata and JSON-LD. Pure functions (no env, no
 * server-only imports) so client components can use the city lookup too.
 */

export const SITE_NAME = "Only Workshops";
export const INSTAGRAM_URL = "https://www.instagram.com/only_workshops";
export const CONTACT_EMAIL = "reachout@onlyworkshops.com";

/** India Standard Time has no DST, so every workshop date/time is +05:30. */
const IST_OFFSET = "+05:30";

export type SeoCity = {
    slug: string;
    name: string;
    region: string;
    /** <title>, kept under ~60 characters so Google does not cut it. */
    metaTitle: string;
    /** Meta description, ~150 characters: the snippet Google shows when it agrees. */
    metaDescription: string;
    /** Opening paragraphs. Must stay true for the city -- no counts that go stale. */
    intro: string[];
};

/**
 * Cities with a /workshops/<slug> landing page. Add one only once workshops are actually
 * hosted there: a page with nothing to list is thin content that hurts rather than helps.
 */
export const SEO_CITIES: readonly SeoCity[] = [
    {
        slug: "pune",
        name: "Pune",
        region: "Maharashtra",
        metaTitle: "Workshops in Pune: Pottery, Baking & More | Only Workshops",
        metaDescription:
            "Hands-on workshops and creative events in Pune: pottery, sourdough pizza, kimchi, baking and more, hosted by local makers. Book your seat online.",
        intro: [
            "Only Workshops brings hands-on creative workshops to Pune: sessions where a local maker teaches you a craft and you leave with something you made yourself. From pottery on the wheel to sourdough pizza, kimchi and baking, workshops are hosted at studios, cafés and kitchens across the city, from Baner to Kharadi and Koregaon Park.",
            "Every workshop page shows the venue, what you will learn and how many seats are left, and booking takes a couple of minutes online.",
        ],
    },
];

export function getSeoCityBySlug(slug: string) {
    return SEO_CITIES.find((city) => city.slug === slug.toLowerCase()) ?? null;
}

export function getSeoCityByName(name: string | null | undefined) {
    const normalized = name?.trim().toLowerCase();
    if (!normalized) return null;
    return SEO_CITIES.find((city) => city.name.toLowerCase() === normalized) ?? null;
}

export function cityPagePath(city: SeoCity) {
    return `/workshops/${city.slug}`;
}

/** Collapses whitespace and cuts at a word boundary, so snippets never end mid-word. */
export function trimForDescription(text: string, maxLength = 155) {
    const clean = text.replace(/\s+/g, " ").trim();
    if (clean.length <= maxLength) return clean;
    const cut = clean.slice(0, maxLength - 1);
    const lastSpace = cut.lastIndexOf(" ");
    const base = lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut;
    return `${base.replace(/[\s,.;:–—-]+$/, "")}…`;
}

/** "Pottery Making Experience" -> "Pottery Making Experience in Pune | Only Workshops". */
export function workshopSeoTitle(workshop: Pick<Workshop, "title" | "city">) {
    const city = workshop.city?.trim();
    const mentionsCity = city && workshop.title.toLowerCase().includes(city.toLowerCase());
    const base = city && !mentionsCity ? `${workshop.title} in ${city}` : workshop.title;
    return `${base} | ${SITE_NAME}`;
}

/**
 * Free-text durations as hosts type them ("2 hrs", "3 hours", "2hrs", "180 minutes",
 * "1.5 hours", "2 hrs 30 mins") in minutes, or null when it cannot be read.
 */
export function parseDurationMinutes(duration: string | null | undefined) {
    if (!duration) return null;
    const text = duration.toLowerCase();
    const hours = text.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/);
    const minutes = text.match(/(\d+)\s*(?:m|min|mins|minute|minutes)\b/);
    const total = (hours ? Number(hours[1]) * 60 : 0) + (minutes ? Number(minutes[1]) : 0);
    return total > 0 && total <= 24 * 60 ? Math.round(total) : null;
}

function normalizeTime(time: string | null | undefined) {
    const match = time?.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!match) return "10:00:00";
    return `${match[1].padStart(2, "0")}:${match[2]}:${match[3] ?? "00"}`;
}

/** `2026-06-21` + `11:15` -> `2026-06-21T11:15:00+05:30`. */
export function istDateTime(date: string, time: string | null | undefined) {
    return `${date}T${normalizeTime(time)}${IST_OFFSET}`;
}

function addMinutesIst(date: string, time: string | null | undefined, minutes: number) {
    const end = new Date(Date.parse(istDateTime(date, time)) + minutes * 60_000);
    // Shift into IST, then print the wall-clock fields with the fixed offset.
    const ist = new Date(end.getTime() + 330 * 60_000).toISOString();
    return `${ist.slice(0, 19)}${IST_OFFSET}`;
}

type EventUrls = { canonicalUrl: string; imageUrl: string; siteUrl: string };

/** schema.org Event for a workshop page (Google's event rich result fields). */
export function workshopEventJsonLd(workshop: Workshop, urls: EventUrls) {
    const durationMinutes = parseDurationMinutes(workshop.duration);
    const streetAddress = workshop.eventAddress?.trim() || workshop.location;
    const city = getSeoCityByName(workshop.city);
    const hasGeo =
        typeof workshop.latitude === "number" &&
        typeof workshop.longitude === "number" &&
        Number.isFinite(workshop.latitude) &&
        Number.isFinite(workshop.longitude);

    return {
        "@context": "https://schema.org",
        "@type": "Event",
        name: workshop.title,
        description: trimForDescription(workshop.description, 300),
        startDate: istDateTime(workshop.date, workshop.time),
        ...(durationMinutes
            ? { endDate: addMinutesIst(workshop.date, workshop.time, durationMinutes) }
            : {}),
        eventStatus: "https://schema.org/EventScheduled",
        eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        location: {
            "@type": "Place",
            name: workshop.location,
            address: {
                "@type": "PostalAddress",
                streetAddress,
                addressLocality: workshop.city,
                ...(city ? { addressRegion: city.region } : {}),
                addressCountry: "IN",
            },
            ...(hasGeo
                ? {
                      geo: {
                          "@type": "GeoCoordinates",
                          latitude: workshop.latitude,
                          longitude: workshop.longitude,
                      },
                  }
                : {}),
        },
        image: [urls.imageUrl],
        organizer: {
            "@type": "Organization",
            name: SITE_NAME,
            url: urls.siteUrl,
        },
        ...(workshop.hostName ? { performer: { "@type": "Person", name: workshop.hostName } } : {}),
        offers: {
            "@type": "Offer",
            price: workshop.price,
            priceCurrency: "INR",
            availability:
                workshop.seatsRemaining > 0
                    ? "https://schema.org/InStock"
                    : "https://schema.org/SoldOut",
            url: urls.canonicalUrl,
        },
        ...(workshop.rating > 0 && workshop.reviewCount > 0
            ? {
                  aggregateRating: {
                      "@type": "AggregateRating",
                      ratingValue: workshop.rating,
                      reviewCount: workshop.reviewCount,
                  },
              }
            : {}),
    };
}

export type BreadcrumbItem = { name: string; url: string };

export function breadcrumbJsonLd(items: BreadcrumbItem[]) {
    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: items.map((item, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: item.name,
            item: item.url,
        })),
    };
}

/**
 * Organization + WebSite for the homepage. WebSite.name/alternateName is what Google uses
 * for the site name shown above the result; Organization supplies the logo and profiles.
 */
export function siteJsonLd(siteUrl: string) {
    const url = `${siteUrl.replace(/\/$/, "")}/`;
    return {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "Organization",
                "@id": `${url}#organization`,
                name: SITE_NAME,
                alternateName: "OnlyWorkshops",
                url,
                logo: `${url}images/icon.png`,
                email: CONTACT_EMAIL,
                description:
                    "Hands-on creative workshops and weekend experiences in Pune, hosted by local makers.",
                areaServed: { "@type": "City", name: "Pune" },
                sameAs: [INSTAGRAM_URL],
                contactPoint: {
                    "@type": "ContactPoint",
                    contactType: "customer support",
                    email: CONTACT_EMAIL,
                    areaServed: "IN",
                    availableLanguage: ["English"],
                },
            },
            {
                "@type": "WebSite",
                "@id": `${url}#website`,
                name: SITE_NAME,
                alternateName: ["OnlyWorkshops", "onlyworkshops.com"],
                url,
                inLanguage: "en-IN",
                publisher: { "@id": `${url}#organization` },
            },
        ],
    };
}
