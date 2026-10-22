import type { Workshop } from "@/lib/data";
import { CONTACT_PHONE_NUMBERS } from "@/lib/contact";
import { formatCurrency } from "@/lib/utils";
import { isWebUrl } from "@/lib/workshop-media";
// Type only: the topic catalogue itself stays out of client bundles that import this file.
import type { SeoTopic } from "@/lib/seo-topics";

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

/** Google shows about this many characters of a <title> before cutting it. */
const MAX_TITLE_LENGTH = 60;

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
        metaTitle: "Workshops in Pune: Baking, Pottery, Chocolate & More",
        metaDescription:
            "Hands-on workshops in Pune: baking, sourdough, chocolate making, macarons, pottery, terrariums, ice baths and more, led by local hosts. Book online.",
        intro: [
            "Only Workshops brings hands-on workshops and creative experiences to Pune: sessions where a local chef, maker or guide teaches you a skill in a few hours. Workshops so far have ranged from baking, sourdough bread and pizza to chocolate making, French macarons and charcuterie boards, alongside crafts such as pottery and terrarium making and wellness experiences such as a guided ice plunge.",
            "Sessions have been hosted at partner studios, cafés and kitchens across the city, from Baner and Kharadi to Koregaon Park and Camp. Every workshop page shows the venue, what you will learn and how many seats are left, and booking takes a couple of minutes online.",
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

/**
 * Pune neighbourhoods as addresses usually spell them. Used only to repeat, in visible text, an
 * area that a workshop's own address already states; never to guess one from coordinates.
 */
export const KNOWN_PUNE_AREAS = [
    "Baner",
    "Aundh",
    "Balewadi",
    "Pashan",
    "Bavdhan",
    "Kothrud",
    "Karvenagar",
    "Erandwane",
    "Deccan",
    "FC Road",
    "Shivajinagar",
    "Camp",
    "Pune Cantonment",
    "Koregaon Park",
    "Kalyani Nagar",
    "Viman Nagar",
    "Yerawada",
    "Kharadi",
    "Wagholi",
    "Mundhwa",
    "Hadapsar",
    "Magarpatta",
    "Kondhwa",
    "NIBM",
    "Bibwewadi",
    "Wakad",
    "Hinjewadi",
    "Pimple Saudagar",
    "Sinhagad Road",
    "Pirangut",
] as const;

/** Other spellings seen in Pune addresses. Spaces in a name also match a hyphen or nothing. */
const AREA_ALIASES: Partial<Record<(typeof KNOWN_PUNE_AREAS)[number], string[]>> = {
    Karvenagar: ["Karve Nagar"],
    Shivajinagar: ["Shivaji Nagar"],
    Erandwane: ["Erandawane"],
    "FC Road": ["F.C. Road", "Fergusson College Road"],
    Yerawada: ["Yerwada"],
    Hinjewadi: ["Hinjawadi"],
    "Sinhagad Road": ["Sinhgad Road"],
};

function areaNamePattern(name: string) {
    return name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "[\\s-]*");
}

const AREA_PATTERNS = KNOWN_PUNE_AREAS.map((area) => ({
    area,
    pattern: new RegExp(
        `\\b(?:${[area, ...(AREA_ALIASES[area] ?? [])].map(areaNamePattern).join("|")})\\b`,
        "i"
    ),
}));

/** "Magarpatta Rd" is a road that runs through other areas; "near Aundh" is a landmark. */
const ROAD_AFTER_AREA = /^[\s.-]*(?:rd|road|marg|path)\b/i;
const LANDMARK_BEFORE_AREA = /\b(?:near|opp|opposite|behind|beside)[\s.]*$/i;
/** "Camp" is also an ordinary word ("Boot Camp Studio"): count it only as a whole address part. */
const CAMP_ADDRESS_PART = /^(?:pune\s+)?camp(?:\s+area)?$/i;

/**
 * Addresses run from the venue to the city, so the venue's own area is usually the last one
 * named; an area followed by "Rd" or preceded by "near" only counts when nothing better is there.
 */
function findArea(text: string) {
    let best: { area: string; penalty: number } | null = null;
    for (const segment of text.split(/[,\n]/)) {
        const part = segment.trim();
        for (const { area, pattern } of AREA_PATTERNS) {
            const match = pattern.exec(part);
            if (!match || (area === "Camp" && !CAMP_ADDRESS_PART.test(part))) continue;
            const penalty =
                Number(ROAD_AFTER_AREA.test(part.slice(match.index + match[0].length))) +
                Number(LANDMARK_BEFORE_AREA.test(part.slice(0, match.index)));
            // `<=`: on a tie the later part of the address wins.
            if (!best || penalty <= best.penalty) best = { area, penalty };
        }
    }
    return best?.area ?? null;
}

/**
 * The Pune area a workshop's address names ("Baner", "Koregaon Park"), read from the event
 * address and then the venue; null when neither states one or both are pasted links. It only
 * repeats what the page already shows.
 */
export function workshopArea(workshop: Partial<Pick<Workshop, "eventAddress" | "location">>) {
    for (const text of [workshop.eventAddress, workshop.location]) {
        const clean = text?.trim();
        if (!clean || isWebUrl(clean)) continue;
        const area = findArea(clean);
        if (area) return area;
    }
    return null;
}

/** Indian PIN code in an address ("…Pune, Maharashtra 411069" -> "411069"). Pune's start with 41. */
export function postalCodeOf(text: string | null | undefined) {
    const clean = text?.trim();
    if (!clean || isWebUrl(clean)) return null;
    const match = clean.match(/\b(4\d{2})\s?(\d{3})\b/);
    return match ? `${match[1]}${match[2]}` : null;
}

/** The venue as it may be printed: empty when `location` holds a pasted link instead of a name. */
export function displayVenue(workshop: Partial<Pick<Workshop, "location">>) {
    const venue = workshop.location?.trim() ?? "";
    return isWebUrl(venue) ? "" : venue;
}

/** Joins place names with ", ", skipping any the text before them already contains. */
function joinPlaceParts(context: string, parts: (string | null | undefined)[]) {
    const kept: string[] = [];
    for (const part of parts) {
        const clean = part?.trim();
        if (!clean) continue;
        const seen = `${context} ${kept.join(" ")}`.toLowerCase();
        if (!seen.includes(clean.toLowerCase())) kept.push(clean);
    }
    return kept.join(", ");
}

/** "Baner" -> "Baner, Pune"; "Pune Cantonment" stays as it is; no area -> "Pune". */
export function areaWithCity(area: string | null | undefined, city = "Pune") {
    return joinPlaceParts("", [area, city]);
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

/** The first sentence of host copy, for snippets ("Step into the cold… Experience!"). */
export function firstSentence(text: string | null | undefined) {
    const clean = text?.replace(/\s+/g, " ").trim() ?? "";
    const match = clean.match(/^.+?[.!?](?=\s|$)/);
    return match ? match[0] : clean;
}

type SeoTitleFields = Pick<Workshop, "title" | "city"> &
    Partial<Pick<Workshop, "eventAddress" | "location">>;

/** "Pottery Making Experience" -> "Pottery Making Experience in Baner, Pune" (area when known). */
export function workshopOgTitle(workshop: SeoTitleFields) {
    const place = joinPlaceParts(workshop.title, [workshopArea(workshop), workshop.city]);
    return place ? `${workshop.title} in ${place}` : workshop.title;
}

/**
 * "Pottery Making Experience" -> "Pottery Making Experience in Baner, Pune | Only Workshops".
 * To stay within 60 characters it drops the site name first, then the area.
 */
export function workshopSeoTitle(workshop: SeoTitleFields) {
    const { title } = workshop;
    const places = [
        joinPlaceParts(title, [workshopArea(workshop), workshop.city]),
        joinPlaceParts(title, [workshop.city]),
    ];
    const candidates = [...new Set(places)].flatMap((place) => {
        const base = place ? `${title} in ${place}` : title;
        return [`${base} | ${SITE_NAME}`, base];
    });
    return (
        candidates.find((candidate) => candidate.length <= MAX_TITLE_LENGTH) ??
        candidates[candidates.length - 1]
    );
}

const WORKSHOP_DATE_FORMAT = new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
});

/** `2026-10-24` -> "Sat, 24 Oct 2026" (the IST calendar date, with the year). */
export function formatWorkshopDate(date: string | null | undefined) {
    const day = date?.trim().slice(0, 10) ?? "";
    const ms = /^\d{4}-\d{2}-\d{2}$/.test(day) ? Date.parse(`${day}T12:00:00${IST_OFFSET}`) : NaN;
    if (!Number.isFinite(ms)) return "";
    // Built from parts: ICU versions disagree on the commas in the en-IN pattern.
    const parts = Object.fromEntries(
        WORKSHOP_DATE_FORMAT.formatToParts(new Date(ms)).map((part) => [part.type, part.value])
    );
    return `${parts.weekday}, ${parts.day} ${parts.month} ${parts.year}`;
}

/** `09:00:00` -> "9:00 am", `15:30` -> "3:30 pm"; "" when there is no time. */
export function formatWorkshopTime(time: string | null | undefined) {
    const match = time?.match(/^(\d{1,2}):(\d{2})/);
    if (!match) return "";
    const hours = Number(match[1]);
    if (hours > 23) return "";
    return `${hours % 12 || 12}:${match[2]} ${hours < 12 ? "am" : "pm"}`;
}

type SeoDescriptionFields = Pick<
    Workshop,
    "id" | "title" | "category" | "city" | "date" | "time" | "price" | "description"
> &
    Partial<Pick<Workshop, "eventAddress" | "location" | "galleryImages">>;

/** A venue name for a sentence; a full street address pasted into `location` is left out. */
function sentenceVenue(workshop: SeoDescriptionFields) {
    const venue = displayVenue(workshop);
    return venue && !postalCodeOf(venue) && venue.split(",").length <= 2 ? venue : "";
}

/**
 * Meta description that says what, where and when, instead of the first lines of host copy.
 * Upcoming: "Ice Plunge Experience in Pune on Sat, 24 Oct 2026, 9:00 am at Designers Share
 * Studio. ₹1,920 per person incl. GST. Step into the cold…". Past: venue, area and date, then
 * a pointer to more sessions of the same topic (the page cannot know one is scheduled).
 */
export function workshopSeoDescription(
    workshop: SeoDescriptionFields,
    todayIso: string,
    topic: Pick<SeoTopic, "name"> | null = null
) {
    const { title } = workshop;
    const city = workshop.city?.trim() ?? "";
    const area = workshopArea(workshop);
    const venue = sentenceVenue(workshop);
    const date = formatWorkshopDate(workshop.date);

    if (workshop.date >= todayIso) {
        const place = joinPlaceParts(title, [area, city]);
        const time = formatWorkshopTime(workshop.time);
        const when = date ? ` on ${date}${time ? `, ${time}` : ""}` : "";
        const lead = `${title}${place ? ` in ${place}` : ""}${when}${venue ? ` at ${venue}` : ""}.`;
        const price =
            workshop.price > 0 ? ` ${formatCurrency(workshop.price)} per person incl. GST.` : "";
        return trimForDescription(`${lead}${price} ${firstSentence(workshop.description)}`);
    }

    const place = joinPlaceParts(`${title} ${venue}`, [area, city]);
    const lead = venue
        ? `${title} at ${venue}${place ? `, ${place}` : ""}`
        : `${title}${place ? ` in ${place}` : ""}`;
    const upcoming = `${topic ? `more ${topic.name.toLowerCase()} workshops` : "upcoming workshops"}${
        city ? ` in ${city}` : ""
    }`;
    const next = workshop.galleryImages?.length
        ? `See photos from the session and find ${upcoming}.`
        : `Find ${upcoming}.`;
    const summary = `${lead}${date ? ` (${date})` : ""}. ${next}`;
    // Host copy only when its whole first sentence fits: the date and next step matter more.
    const withCopy = `${summary} ${firstSentence(workshop.description)}`.trim();
    return trimForDescription(withCopy.length <= 155 ? withCopy : summary);
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

/** An instant as IST wall-clock time with the fixed offset. */
function toIstIso(ms: number) {
    const ist = new Date(ms + 330 * 60_000).toISOString();
    return `${ist.slice(0, 19)}${IST_OFFSET}`;
}

function addMinutesIst(date: string, time: string | null | undefined, minutes: number) {
    return toIstIso(Date.parse(istDateTime(date, time)) + minutes * 60_000);
}

/** "Chef Archit & Chef Avanti" -> ["Chef Archit", "Chef Avanti"]. */
export function splitHostNames(hostName: string | null | undefined) {
    return (hostName ?? "")
        .split(/\s*(?:&|,|\band\b)\s*/i)
        .map((name) => name.trim())
        .filter(Boolean);
}

/**
 * Cover first, then gallery photos: absolute, without blanks or duplicates, at most `limit`.
 * Several images (and not only a portrait cover) let Google pick a crop for each surface.
 */
export function workshopImageUrls(
    workshop: Pick<Workshop, "coverImage"> & Partial<Pick<Workshop, "galleryImages">>,
    toAbsolute: (path: string) => string = (path) => path,
    limit = 4
) {
    const sources = [workshop.coverImage, ...(workshop.galleryImages ?? [])]
        .map((source) => source?.trim())
        .filter((source): source is string => Boolean(source));
    return [...new Set(sources.map(toAbsolute))].slice(0, limit);
}

export type EventUrls = {
    canonicalUrl: string;
    siteUrl: string;
    /** Absolute image URLs, best first: see workshopImageUrls. */
    imageUrls?: string[];
    /** @deprecated Pass `imageUrls`; still accepted so older callers keep working. */
    imageUrl?: string;
};

/** schema.org Event for a workshop page (Google's event rich result fields). */
export function workshopEventJsonLd(workshop: Workshop, urls: EventUrls) {
    const durationMinutes = parseDurationMinutes(workshop.duration);
    // A pasted Maps link is not an address. Leaving streetAddress out costs a Rich Results
    // warning; repeating the venue name there would be a wrong address.
    const eventAddress = workshop.eventAddress?.trim();
    const streetAddress = eventAddress && !isWebUrl(eventAddress) ? eventAddress : "";
    const venue = displayVenue(workshop);
    const postalCode = postalCodeOf(streetAddress) ?? postalCodeOf(venue);
    const city = getSeoCityByName(workshop.city);
    const hasGeo =
        typeof workshop.latitude === "number" &&
        typeof workshop.longitude === "number" &&
        Number.isFinite(workshop.latitude) &&
        Number.isFinite(workshop.longitude);
    const images = [
        ...new Set([...(urls.imageUrls ?? []), ...(urls.imageUrl ? [urls.imageUrl] : [])]),
    ].filter(Boolean);
    const createdAt = workshop.createdAt ? Date.parse(workshop.createdAt) : NaN;
    const performers = splitHostNames(workshop.hostName).map((name) => ({
        "@type": "Person",
        name,
    }));
    // Same @id as the Organization in siteJsonLd, so Google joins the two.
    const siteRoot = `${urls.siteUrl.replace(/\/$/, "")}/`;

    return {
        "@context": "https://schema.org",
        "@type": "Event",
        "@id": `${urls.canonicalUrl}#event`,
        name: workshop.title,
        description: trimForDescription(workshop.description, 300),
        url: urls.canonicalUrl,
        startDate: istDateTime(workshop.date, workshop.time),
        ...(durationMinutes
            ? { endDate: addMinutesIst(workshop.date, workshop.time, durationMinutes) }
            : {}),
        eventStatus: "https://schema.org/EventScheduled",
        eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        location: {
            "@type": "Place",
            name: venue || `${workshop.title} venue`,
            address: {
                "@type": "PostalAddress",
                ...(streetAddress ? { streetAddress } : {}),
                addressLocality: workshop.city,
                ...(postalCode ? { postalCode } : {}),
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
        ...(images.length ? { image: images } : {}),
        organizer: {
            "@type": "Organization",
            "@id": `${siteRoot}#organization`,
            name: SITE_NAME,
            url: siteRoot,
        },
        // One Person per host when the name lists several ("Chef Archit & Chef Avanti").
        ...(performers.length > 1
            ? { performer: performers }
            : performers.length === 1
              ? { performer: performers[0] }
              : {}),
        offers: {
            "@type": "Offer",
            price: workshop.price,
            priceCurrency: "INR",
            availability:
                workshop.seatsRemaining > 0
                    ? "https://schema.org/InStock"
                    : "https://schema.org/SoldOut",
            url: urls.canonicalUrl,
            ...(Number.isFinite(createdAt) ? { validFrom: toIstIso(createdAt) } : {}),
        },
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
                telephone: CONTACT_PHONE_NUMBERS[0].value,
                description:
                    "Hands-on creative workshops and weekend experiences in Pune, hosted by local makers.",
                // City only: workshops run at partner venues, so there is no street to give.
                address: {
                    "@type": "PostalAddress",
                    addressLocality: "Pune",
                    addressRegion: "Maharashtra",
                    addressCountry: "IN",
                },
                areaServed: { "@type": "City", name: "Pune" },
                sameAs: [INSTAGRAM_URL],
                contactPoint: {
                    "@type": "ContactPoint",
                    contactType: "customer support",
                    email: CONTACT_EMAIL,
                    telephone: CONTACT_PHONE_NUMBERS[0].value,
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
