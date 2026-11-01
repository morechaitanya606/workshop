import { areaOf, areasOf, joinList, topicGroups } from "@/lib/city-faqs";
import type { Workshop } from "@/lib/data";
import { displayVenue, postalCodeOf, workshopArea, type SeoCity } from "@/lib/seo";
import { topicPagePath } from "@/lib/seo-topics";

/*
 * Facts for the /about page, built only from live workshop rows (the cached city list), so the
 * page never carries a hand-typed number that goes stale. It reaches the topic catalogue through
 * city-faqs, so, like lib/seo-topics.ts, it must never be imported by a "use client" module.
 */

/**
 * fetchCityWorkshops (lib/workshop-page-data.ts) reads at most this many rows, newest first, so
 * older past rows can be cut. Keep it equal to the `.limit(1000)` there.
 */
export const CITY_ROW_LIMIT = 1000;

const MAX_PLACES = 6;

const MONTHS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];

type AboutRow = Pick<Workshop, "id" | "title" | "category" | "date"> &
    Partial<Pick<Workshop, "galleryImages" | "location" | "eventAddress">>;

export type AboutTopicLink = {
    slug: string;
    href: string;
    /** Descriptive anchor text: "Pottery classes". The section heading already names the city. */
    label: string;
    sessions: number;
    upcoming: number;
};

export type AboutStats = {
    upcoming: number;
    past: number;
    /** The row limit was reached: `past` is then a floor and the first month is unknown. */
    capped: boolean;
    /** "April 2026": month of the earliest past session in the data; null when unknown. */
    firstMonth: string | null;
    /** Activity pages that pass the thin-content rule, as the city hub links them. */
    topics: AboutTopicLink[];
    /** Pune areas the rows' own addresses state, most frequent first. */
    areas: string[];
    /** Venue names as hosts typed them, with the area when the address states one. */
    venues: string[];
};

/** "2026-04-03" -> "April 2026"; null for anything that is not an ISO date. */
export function monthLabel(isoDate: string | null | undefined) {
    const match = isoDate?.match(/^(\d{4})-(\d{2})-\d{2}/);
    const month = match ? MONTHS[Number(match[2]) - 1] : undefined;
    return match && month ? `${month} ${match[1]}` : null;
}

/** Placeholders hosts type before a venue is fixed; never a venue to name. */
const NOT_A_VENUE = /^(?:tba|tbc|tbd|to be (?:announced|confirmed|decided)|online|pune)$/i;

/** A link pasted without its "https://" ("maps.app.goo.gl/…"), which displayVenue lets through. */
const LOOKS_LIKE_LINK = /\/|\bwww\.|\bgoo\.gl\b|\.(?:com|in|org|net|co)\b/i;

/** Words an address puts around an area: "Baner Road, Pune, Maharashtra", "Hinjawadi Phase 1". */
const ADDRESS_WORD = /^(?:road|rd|marg|path|lane|street|st|phase|pune|maharashtra|india)$/i;

/**
 * The letters a place text has besides its Pune areas and address words: "Studio Creo, Baner" ->
 * "studiocreo", "Karve Nagar, Pune" -> "". Areas are found word by word with workshopArea itself,
 * so every spelling it knows ("Yerwada", "Kalyani-Nagar", "Sinhgad Road") is removed.
 */
function nameLetters(text: string) {
    const words = text.split(/[\s,]+/).filter(Boolean);
    if (workshopArea({ location: text })) {
        // Shortest spans first, so "Studio Baner" loses only "Baner"; area names run to three words.
        for (let size = 1; size <= 3; size += 1) {
            for (let start = 0; start + size <= words.length; ) {
                const span = words.slice(start, start + size).join(" ");
                if (workshopArea({ location: span })) words.splice(start, size);
                else start += 1;
            }
        }
    }
    return words
        .filter((word) => !ADDRESS_WORD.test(word.replace(/[^a-z]/gi, "")))
        .join("")
        .toLowerCase()
        .replace(/[^a-z]/g, "");
}

/**
 * A venue name fit for a sentence: no pasted link, PIN code, street address or placeholder, and
 * not just an area ("Baner, Pune" and "Baner Road" say where, not which venue).
 */
function venueNameOf(row: AboutRow) {
    const venue = displayVenue(row).replace(/\s+/g, " ");
    if (!venue || NOT_A_VENUE.test(venue) || LOOKS_LIKE_LINK.test(venue)) return "";
    if (postalCodeOf(venue)) return "";
    if (venue.length > 60 || venue.split(",").length > 2) return "";
    return nameLetters(venue).length >= 3 ? venue : "";
}

/**
 * "Studio Creo in Koregaon Park": the venue's name, then the area the row's address (or the venue
 * text) states. A venue typed with its area after a comma ("Si Nonnas Sourdough Pizza, Kharadi")
 * keeps only the name part, so a comma-joined list of venues never reads the area as a venue.
 */
function venuePlace(row: AboutRow, venue: string) {
    const parts = venue
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
    const name = parts.find((part) => nameLetters(part).length >= 3) ?? parts[0] ?? venue;
    if (workshopArea({ location: name })) return { name, label: name };
    const area = areaOf(row);
    return { name, label: area ? `${name} in ${area}` : name };
}

/** "Butterish Kitchen & Studio" and "Butterish Kitchen Studio" give the same key. */
function placeKey(name: string) {
    return name.toLowerCase().replace(/\band\b|[^a-z0-9]/g, "");
}

/** Same rule as the topic pages: equal keys, or one starts the other and is not a bare word. */
function samePlace(a: string, b: string) {
    const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
    return shorter === longer || (shorter.length >= 6 && longer.startsWith(shorter));
}

/**
 * Distinct venues, most used first, each counted once however hosts spelled it ("Butterish" /
 * "Butterish Kitchen & Studio") and shown with its fullest label ("Studio Creo in Koregaon Park").
 */
export function venuesOf(rows: readonly AboutRow[]) {
    const kept: { key: string; label: string; count: number }[] = [];
    for (const row of rows) {
        const venue = venueNameOf(row);
        if (!venue) continue;
        const { name, label } = venuePlace(row, venue);
        const key = placeKey(name);
        if (!key) continue;
        const same = kept.find((entry) => samePlace(entry.key, key));
        if (!same) {
            kept.push({ key, label, count: 1 });
            continue;
        }
        same.count += 1;
        if (label.length > same.label.length) same.label = label;
    }
    return kept.sort((a, b) => b.count - a.count).map((entry) => entry.label);
}

/** Everything the about page says about one city; null when the city has no sessions at all. */
export function buildAboutStats(
    city: Pick<SeoCity, "slug" | "name">,
    upcoming: readonly AboutRow[],
    past: readonly AboutRow[]
): AboutStats | null {
    if (!upcoming.length && !past.length) return null;

    const capped = upcoming.length + past.length >= CITY_ROW_LIMIT;
    const earliest = past.reduce<string | null>(
        (min, row) => (row.date && (!min || row.date < min) ? row.date : min),
        null
    );
    const rows = [...upcoming, ...past];

    return {
        upcoming: upcoming.length,
        past: past.length,
        capped,
        firstMonth: capped ? null : monthLabel(earliest),
        topics: topicGroups(upcoming, past)
            .filter((group) => group.indexable)
            .map(({ topic, counts }) => ({
                slug: topic.slug,
                href: topicPagePath(city, topic),
                label: topic.linkLabel,
                sessions: counts.total,
                upcoming: counts.upcoming,
            })),
        areas: areasOf(rows).slice(0, MAX_PLACES),
        venues: venuesOf(rows).slice(0, MAX_PLACES),
    };
}

function count(value: number, one: string, many: string) {
    return `${value.toLocaleString("en-IN")} ${value === 1 ? one : many}`;
}

/**
 * "Since April 2026, we have hosted 23 workshop sessions in Pune, and 4 more are on the calendar."
 * Every session is its own row (lib/workshop-sessions.ts), so the counts are sessions, not dates.
 * Tense and wording follow the data, so the sentence is true however few rows exist.
 */
export function hostedSentence(stats: AboutStats, cityName: string) {
    const upcoming = stats.upcoming;
    if (!stats.past) {
        return upcoming
            ? `${count(upcoming, "workshop session is", "workshop sessions are")} on the calendar in ${cityName}.`
            : "";
    }

    const sessions = `${stats.capped ? "at least " : ""}${count(stats.past, "workshop session", "workshop sessions")}`;
    const hosted = stats.firstMonth
        ? `Since ${stats.firstMonth}, we have hosted ${sessions} in ${cityName}`
        : `We have hosted ${sessions} in ${cityName} so far`;
    return upcoming
        ? `${hosted}, and ${count(upcoming, "more is", "more are")} on the calendar.`
        : `${hosted}.`;
}

/** "4 sessions hosted, 2 upcoming" for one activity page link; parts with nothing are left out. */
export function topicCountText(topic: Pick<AboutTopicLink, "sessions" | "upcoming">) {
    const hosted = topic.sessions - topic.upcoming;
    if (hosted <= 0) return count(topic.upcoming, "upcoming session", "upcoming sessions");
    const sessions = count(hosted, "session hosted", "sessions hosted");
    return topic.upcoming
        ? `${sessions}, ${topic.upcoming.toLocaleString("en-IN")} upcoming`
        : sessions;
}

/**
 * Where sessions happen, from the rows' own addresses and venue names; "" when none says. Venues
 * come from upcoming and past rows alike, hence "Venues include", not "have included".
 */
export function whereSentence(stats: Pick<AboutStats, "areas" | "venues">, cityName: string) {
    if (!stats.areas.length && !stats.venues.length) return "";
    const around = `Sessions are hosted at partner studios, cafés and kitchens around ${cityName}`;
    return [
        stats.areas.length ? `${around}, in areas such as ${joinList(stats.areas)}.` : `${around}.`,
        stats.venues.length ? `Venues include ${joinList(stats.venues)}.` : "",
    ]
        .filter(Boolean)
        .join(" ");
}
