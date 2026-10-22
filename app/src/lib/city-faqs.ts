import { BOOKING_HOLD_MINUTES } from "@/lib/booking-time";
import { CANCELLATION_POLICY } from "@/lib/cancellation-policy";
import type { Workshop } from "@/lib/data";
import {
    displayVenue,
    parseDurationMinutes,
    postalCodeOf,
    workshopArea,
    type SeoCity,
} from "@/lib/seo";
import {
    SEO_TOPICS,
    topicIsIndexable,
    workshopMatchesTopic,
    type SeoTopic,
} from "@/lib/seo-topics";
import { formatCurrency } from "@/lib/utils";

/*
 * Copy built from live workshop rows for the /workshops/<city> and /workshops/<city>/<topic>
 * landing pages. Answers come from data and shared policy constants, so they cannot drift, and
 * places are only ever ones the rows' own venue or address text already names.
 */

export type Faq = { question: string; answer: string; link?: { href: string; label: string } };

export function joinList(items: string[]) {
    if (items.length <= 1) return items[0] ?? "";
    return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function range(values: number[]) {
    const clean = values.filter((value) => Number.isFinite(value) && value > 0);
    return clean.length ? { min: Math.min(...clean), max: Math.max(...clean) } : null;
}

type TopicRow = Pick<Workshop, "id" | "title" | "category"> &
    Partial<Pick<Workshop, "galleryImages">>;

export type TopicGroup<T extends TopicRow> = {
    topic: SeoTopic;
    upcoming: T[];
    past: T[];
    counts: { upcoming: number; total: number; photos: number };
    /** The shared thin-content rule: when false the page is noindex and the city hub skips it. */
    indexable: boolean;
};

/** One topic's sessions, keeping the order (and the type) of the lists passed in. */
export function topicGroup<T extends TopicRow>(
    topic: SeoTopic,
    upcoming: readonly T[],
    past: readonly T[]
): TopicGroup<T> {
    const upcomingMatches = upcoming.filter((workshop) => workshopMatchesTopic(workshop, topic));
    const pastMatches = past.filter((workshop) => workshopMatchesTopic(workshop, topic));
    const counts = {
        upcoming: upcomingMatches.length,
        total: upcomingMatches.length + pastMatches.length,
        photos: pastMatches.reduce(
            (sum, workshop) => sum + (workshop.galleryImages?.length ?? 0),
            0
        ),
    };
    return {
        topic,
        upcoming: upcomingMatches,
        past: pastMatches,
        counts,
        indexable: topicIsIndexable(counts),
    };
}

/** Every SEO topic's group, in SEO_TOPICS order (specific activities before the hubs). */
export function topicGroups<T extends TopicRow>(upcoming: readonly T[], past: readonly T[]) {
    return SEO_TOPICS.map((topic) => topicGroup(topic, upcoming, past));
}

type PlaceFields = Partial<Pick<Workshop, "eventAddress" | "location">>;
type Place = { name: string; label: string };

/** "Butterish Kitchen & Studio" and "Butterish Kitchen Studio" give the same key. */
function placeKey(name: string) {
    return name.toLowerCase().replace(/\band\b|[^a-z0-9]/g, "");
}

/** Same place when the keys match, or one starts the other and is not a bare word like "cafe". */
function samePlace(a: string, b: string) {
    const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
    return shorter === longer || (shorter.length >= 6 && longer.startsWith(shorter));
}

/**
 * Distinct places, most frequent first (ties keep their order). Hosts type one venue several
 * ways, so a name that starts another ("Butterish" / "Butterish Kitchen Studio") counts once,
 * shown with the fuller label.
 */
function distinctPlaces(places: Place[]) {
    const kept: (Place & { key: string; count: number })[] = [];
    for (const place of places) {
        const key = placeKey(place.name);
        if (!key) continue;
        const same = kept.find((entry) => samePlace(entry.key, key));
        if (!same) {
            kept.push({ ...place, key, count: 1 });
            continue;
        }
        same.count += 1;
        if (place.label.length > same.label.length) same.label = place.label;
    }
    return kept.sort((a, b) => b.count - a.count).map((entry) => entry.label);
}

/** Pune areas the rows' addresses state ("Baner", "Koregaon Park"), most frequent first. */
export function areasOf(workshops: readonly PlaceFields[]) {
    return distinctPlaces(
        workshops
            .map((workshop) => workshopArea(workshop))
            .filter((area): area is string => Boolean(area))
            .map((area) => ({ name: area, label: area }))
    );
}

/** A venue name fit for a sentence: no pasted link, PIN code or full street address. */
function venueName(workshop: PlaceFields) {
    const venue = displayVenue(workshop);
    return venue && !postalCodeOf(venue) && venue.split(",").length <= 2 ? venue : "";
}

/** "Studio Creo in Koregaon Park"; just the venue when its name already says the area. */
function venuePlace(workshop: PlaceFields): Place | null {
    const venue = venueName(workshop);
    if (!venue) return null;
    const area = workshopArea(workshop);
    const label = area && !workshopArea({ location: venue }) ? `${venue} in ${area}` : venue;
    return { name: venue.split(",")[0], label };
}

function areaPlace(workshop: PlaceFields): Place | null {
    const area = workshopArea(workshop);
    return area ? { name: area, label: area } : null;
}

const MAX_PLACES = 6;

/**
 * `all` when every row's place is known and listed, else the "including" wording, so a list
 * never reads as complete when it is not.
 */
function placeSentence(
    rows: readonly PlaceFields[],
    placeOf: (row: PlaceFields) => Place | null,
    [all, some]: [string, string]
) {
    const found = rows.map(placeOf);
    const places = distinctPlaces(found.filter((place): place is Place => Boolean(place)));
    if (!places.length) return "";
    const complete = places.length <= MAX_PLACES && found.every(Boolean);
    return `${complete ? all : some} ${joinList(places.slice(0, MAX_PLACES))}.`;
}

/**
 * "Upcoming sessions are in Baner. Past sessions were hosted in Karvenagar and Camp." Built only
 * from areas the rows' own addresses state; "" when none does.
 */
export function topicAreaSentence(upcoming: readonly PlaceFields[], past: readonly PlaceFields[]) {
    return [
        placeSentence(upcoming, areaPlace, [
            "Upcoming sessions are in",
            "Upcoming sessions include dates in",
        ]),
        placeSentence(past, areaPlace, [
            "Past sessions were hosted in",
            "Past sessions were hosted in areas including",
        ]),
    ]
        .filter(Boolean)
        .join(" ");
}

/** 150 -> "2.5"; rounded to the half hour, since hosts type durations loosely. */
function hoursText(minutes: number) {
    const hours = Math.round((minutes / 60) * 2) / 2;
    return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

function durationText(minutes: number) {
    if (minutes < 60) return `${minutes} minutes`;
    const hours = hoursText(minutes);
    return hours === "1" ? "1 hour" : `${hours} hours`;
}

/** "for about 3 hours" / "from about 2 to 5 hours". */
function durationRangeText({ min, max }: { min: number; max: number }) {
    if (durationText(min) === durationText(max)) return `for about ${durationText(max)}`;
    if (min >= 60) return `from about ${hoursText(min)} to ${hoursText(max)} hours`;
    return `from about ${durationText(min)} to ${durationText(max)}`;
}

function withArticle(phrase: string) {
    return `${/^[aeiou]/i.test(phrase) ? "an" : "a"} ${phrase}`;
}

type FaqWorkshop = TopicRow &
    Pick<Workshop, "price" | "maxSeats" | "duration"> &
    Partial<Pick<Workshop, "eventAddress" | "location">>;

export type LandingFaqInput = {
    city: Pick<SeoCity, "name">;
    upcoming: readonly FaqWorkshop[];
    past: readonly FaqWorkshop[];
    whatsappUrl?: string;
    /** Set on an activity page: the questions are about this topic and its own Q&As are added. */
    topic?: SeoTopic | null;
};

/**
 * FAQ for a city or activity landing page. Tense follows the data: "have ranged" once a session
 * has happened, "range" while there are only upcoming dates.
 */
export function buildLandingFaqs({
    city,
    upcoming,
    past,
    whatsappUrl,
    topic = null,
}: LandingFaqInput): Faq[] {
    const workshops = [...upcoming, ...past];
    const hasPast = past.length > 0;
    const activity = topic?.name.toLowerCase() ?? "";
    const sessions = topic ? "Sessions" : "Workshops";
    const faqs: Faq[] = [];

    if (!topic) {
        // Hubs (topics that gather others) would only repeat the specific names.
        const kinds = SEO_TOPICS.filter(
            (candidate) =>
                !candidate.includeTopics?.length &&
                workshops.some((workshop) => workshopMatchesTopic(workshop, candidate))
        ).map((candidate) => candidate.name.toLowerCase());
        // Fallback for rows no topic matches: the coarse categories, as before topics existed.
        const categories = [
            ...new Set(
                workshops
                    .map((workshop) => workshop.category?.trim().toLowerCase())
                    .filter((category): category is string => Boolean(category))
            ),
        ];
        if (kinds.length || categories.length) {
            faqs.push({
                question: `What kind of workshops can I do in ${city.name}?`,
                answer: kinds.length
                    ? `Hands-on sessions led by local hosts, such as ${joinList(kinds)} workshops.`
                    : `Hands-on ${joinList(categories)} workshops led by local hosts.`,
            });
        }
    }

    const addressNote = "The exact venue and address are on each workshop's page.";
    if (topic) {
        const venues = [
            placeSentence(upcoming, venuePlace, [
                "Upcoming sessions are at",
                "Upcoming sessions are at venues including",
            ]),
            placeSentence(past, venuePlace, [
                "Past sessions were hosted at",
                "Past sessions were hosted at venues including",
            ]),
        ]
            .filter(Boolean)
            .join(" ");
        const places = venues || topicAreaSentence(upcoming, past);
        faqs.push({
            question: `Where do ${activity} workshops in ${city.name} take place?`,
            answer: places ? `${places} ${addressNote}` : `Around ${city.name}. ${addressNote}`,
        });
    } else {
        const areas = areasOf(workshops).slice(0, MAX_PLACES);
        faqs.push({
            question: `Where do the workshops in ${city.name} take place?`,
            answer: areas.length
                ? `At partner studios, cafés and kitchens around ${city.name}, in areas such as ${joinList(areas)}. ${addressNote}`
                : `At partner studios, cafés and kitchens around ${city.name}. ${addressNote}`,
        });
    }

    const prices = range(workshops.map((workshop) => workshop.price));
    if (prices) {
        const amount =
            prices.min === prices.max
                ? `${hasPast ? "have been" : "are"} ${formatCurrency(prices.min)}`
                : `${hasPast ? "have ranged" : "range"} from ${formatCurrency(prices.min)} to ${formatCurrency(prices.max)}`;
        faqs.push({
            question: topic
                ? `How much does ${withArticle(activity)} workshop in ${city.name} cost?`
                : `How much does a workshop in ${city.name} cost?`,
            answer: `${sessions} ${amount} per person, incl. GST. Each workshop page shows the full price before you pay.`,
        });
    }

    const durations = range(
        workshops.map((workshop) => parseDurationMinutes(workshop.duration) ?? 0)
    );
    if (durations) {
        faqs.push({
            question: topic
                ? `How long does ${withArticle(activity)} workshop last?`
                : `How long does a workshop in ${city.name} last?`,
            answer: `${sessions} ${hasPast ? "have run" : "run"} ${durationRangeText(durations)}. Each workshop page shows the start time and length.`,
        });
    }

    const seats = range(workshops.map((workshop) => workshop.maxSeats));
    if (seats) {
        const room =
            seats.min === seats.max
                ? `room for up to ${seats.max} people`
                : `room for ${seats.min} to ${seats.max} people, depending on the workshop`;
        faqs.push({
            question: "How big are the groups?",
            answer: `${sessions} ${hasPast ? "have had" : "have"} ${room}. Each workshop page shows how many seats are left.`,
        });
    }

    faqs.push(...(topic?.faqs ?? []));

    faqs.push({
        question: "How do I book a seat?",
        answer: `Pick a workshop and the number of seats, then pay online with UPI, cards or net banking. Your seats are held for ${BOOKING_HOLD_MINUTES} minutes while you pay, and your confirmation arrives by email.`,
    });

    faqs.push({
        question: "Can I cancel my booking?",
        answer: `${CANCELLATION_POLICY.earlyBirdSummary} ${CANCELLATION_POLICY.noCancellationSummary} ${CANCELLATION_POLICY.hostCancellationSummary}`,
        link: { href: "/cancellations", label: "Read the full cancellation policy" },
    });

    faqs.push({
        question: topic
            ? `How do I hear about new ${activity} dates?`
            : `How do I hear about new workshops in ${city.name}?`,
        answer: whatsappUrl
            ? "Join our WhatsApp community or follow @only_workshops on Instagram, where new dates are shared."
            : "Follow @only_workshops on Instagram, where new dates are shared.",
    });

    return faqs;
}

/** FAQPage JSON-LD mirroring the visible questions (the link labels are page-only). */
export function faqPageJsonLd(faqs: Faq[]) {
    return {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqs.map((faq) => ({
            "@type": "Question",
            name: faq.question,
            acceptedAnswer: { "@type": "Answer", text: faq.answer },
        })),
    };
}
