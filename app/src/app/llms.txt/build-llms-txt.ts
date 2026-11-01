import { CONTACT_PHONE_NUMBERS } from "@/lib/contact";
import type { Workshop } from "@/lib/data";
import type { CardOffer } from "@/lib/offers";
import {
    CONTACT_EMAIL,
    INSTAGRAM_URL,
    SITE_NAME,
    areaWithCity,
    cityPagePath,
    firstSentence,
    formatIstDateTime,
    formatWorkshopDate,
    formatWorkshopTime,
    workshopArea,
    type SeoCity,
} from "@/lib/seo";
import { topicPagePath, type SeoTopic } from "@/lib/seo-topics";
import { formatCurrency } from "@/lib/utils";

/*
 * /llms.txt (https://llmstxt.org): a Markdown map of the site for language models. Pure, so it
 * is unit tested; the route supplies live data. Every line is either existing site copy or read
 * from workshop rows, so it cannot claim more than the pages themselves do.
 */

/** Upcoming sessions listed in full; the rest are one link away on /explore. */
export const MAX_LISTED_WORKSHOPS = 40;

export type LlmsTxtWorkshop = Pick<Workshop, "id" | "title" | "date" | "time" | "price"> &
    Partial<Pick<Workshop, "eventAddress" | "location">> & {
        /** cardOfferFor(...) when the file was built (null: the list price applies). */
        offer?: CardOffer | null;
        /** The admin closed bookings: said so, with no offer. */
        bookingsClosed?: boolean;
    };

export type LlmsTxtCity = {
    city: SeoCity;
    /**
     * Activity pages that pass the thin-content rule and the upcoming sessions, or null when the
     * city's workshops could not be read: its live sections are then left out, never guessed.
     */
    live: {
        topics: Pick<SeoTopic, "slug" | "h1" | "intro">[];
        upcoming: LlmsTxtWorkshop[];
    } | null;
};

export type LlmsTxtInput = {
    /** Absolute URL for a site path (getAbsoluteUrl in the route). */
    absoluteUrl: (path: string) => string;
    cities: LlmsTxtCity[];
};

type PageLink = { path: string; title: string; note: string };

/** Notes follow each page's own meta description, so they promise nothing the page does not. */
const KEY_PAGES_AFTER_CITIES: PageLink[] = [
    {
        path: "/explore",
        title: "Explore upcoming workshops",
        note: "Upcoming workshop dates and prices in Pune, filtered by date, price and category.",
    },
    {
        path: "/past-events",
        title: "Past workshops",
        note: "Photos and highlights from workshops that have already taken place.",
    },
    {
        path: "/about",
        title: "About Only Workshops",
        note: "What Only Workshops does and how hosts are vetted.",
    },
    {
        path: "/help",
        title: "Help centre",
        note: "Help with bookings, account access, payments and hosting.",
    },
    {
        path: "/cancellations",
        title: "Cancellation & refund policy",
        note: "Cancellation, refund and rescheduling terms to read before booking.",
    },
    {
        path: "/contact",
        title: "Contact",
        note: "Phone and email for booking questions, hosting enquiries and partnerships.",
    },
];

const OPTIONAL_PAGES: PageLink[] = [
    {
        path: "/become-a-host",
        title: "Become a host",
        note: "Apply to host workshops on Only Workshops.",
    },
    {
        path: "/communities",
        title: "Communities",
        note: "Creative communities to join and stay connected with between workshops.",
    },
    {
        path: "/safety",
        title: "Safety",
        note: "Safety standards, reporting guidance and support for workshops.",
    },
    {
        path: "/legal/terms",
        title: "Terms of service",
        note: "Terms for bookings, accounts and use of the site.",
    },
    {
        path: "/legal/privacy",
        title: "Privacy policy",
        note: "How personal data is collected, used and protected.",
    },
];

/** One line of Markdown: no line breaks, and no brackets that would end a link's text early. */
function inline(text: string) {
    return text.replace(/\s+/g, " ").trim();
}

function linkText(text: string) {
    return inline(text).replace(/[\\[\]]/g, "\\$&");
}

function linkLine(title: string, url: string, note: string) {
    const cleanNote = inline(note);
    return `- [${linkText(title)}](${url})${cleanNote ? `: ${cleanNote}` : ""}`;
}

/**
 * The price sentence. The file is cached for up to an hour and read later still, so an offer
 * price always carries its end ("until <IST date and time>") and the regular price: the
 * sentence stays true after the offer ends. An offer whose end may not be advertised says it can
 * end at any time. A per-booking discount (a fixed coupon, once per booking) is never turned into
 * a per-person price.
 */
function priceNote(workshop: LlmsTxtWorkshop) {
    // No price is left out rather than called free, as in the workshop meta descriptions.
    const list = workshop.price > 0 ? formatCurrency(workshop.price) : "";
    if (workshop.bookingsClosed) {
        return `${list ? ` ${list} per person incl. GST.` : ""} Bookings closed.`;
    }
    if (!list) return "";

    const offer = workshop.offer;
    const real =
        offer &&
        offer.listPrice === workshop.price &&
        offer.offerPrice >= 0 &&
        offer.offerPrice < workshop.price;
    if (!real) return ` ${list} per person incl. GST.`;

    const until = offer.endsAt ? formatIstDateTime(offer.endsAt) : "";
    const label = inline(offer.label);
    if (offer.perBooking) {
        const ending = until ? ` until ${until}` : " (the offer can end at any time)";
        return ` ${list} per person incl. GST; ${offer.discountText}${ending}: ${label}.`;
    }
    const ending = until
        ? ` until ${until} (${label}; regular ${list})`
        : ` with the current offer (${label}; regular ${list}; the offer can end at any time)`;
    return ` ${formatCurrency(offer.offerPrice)} per person incl. GST${ending}.`;
}

/** "Sat, 24 Oct 2026, 9:00 am in Baner, Pune. ₹1,920 per person incl. GST." */
function workshopNote(workshop: LlmsTxtWorkshop, cityName: string) {
    const date = formatWorkshopDate(workshop.date);
    const time = formatWorkshopTime(workshop.time);
    const when = date ? `${date}${time ? `, ${time}` : ""} in ` : "In ";
    const place = areaWithCity(workshopArea(workshop), cityName);
    return `${when}${place}.${priceNote(workshop)}`;
}

function bySessionStart(a: LlmsTxtWorkshop, b: LlmsTxtWorkshop) {
    return a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? "");
}

/** A "## heading" block, or nothing when it has no lines. */
function section(heading: string, lines: string[]) {
    return lines.length ? [`## ${heading}`, "", ...lines].join("\n") : "";
}

export function buildLlmsTxt({ absoluteUrl, cities }: LlmsTxtInput) {
    const pageLine = (page: PageLink) => linkLine(page.title, absoluteUrl(page.path), page.note);
    const phones = CONTACT_PHONE_NUMBERS.map((phone) => phone.label).join(" or ");

    const keyPages = [
        linkLine(
            "Home",
            absoluteUrl("/"),
            "Upcoming workshops in Pune, how booking works and highlights from past sessions."
        ),
        ...cities.map(({ city }) =>
            linkLine(
                `Workshops in ${city.name}`,
                absoluteUrl(cityPagePath(city)),
                `Guide to workshops in ${city.name}: upcoming and recent sessions, activities, areas and common questions.`
            )
        ),
        ...KEY_PAGES_AFTER_CITIES.map(pageLine),
    ];

    const citySections = cities.flatMap(({ city, live }) => {
        if (!live) return [];

        const activities = live.topics.map((topic) =>
            linkLine(
                topic.h1,
                absoluteUrl(topicPagePath(city, topic)),
                firstSentence(topic.intro[0])
            )
        );

        const upcoming = [...live.upcoming].sort(bySessionStart);
        const listed = upcoming
            .slice(0, MAX_LISTED_WORKSHOPS)
            .map((workshop) =>
                linkLine(
                    workshop.title,
                    absoluteUrl(`/workshop/${encodeURIComponent(workshop.id)}`),
                    workshopNote(workshop, city.name)
                )
            );
        if (upcoming.length > listed.length) {
            listed.push(
                linkLine(
                    "More upcoming workshops",
                    absoluteUrl("/explore"),
                    "Every upcoming session, with dates and prices."
                )
            );
        }

        return [
            section(`Workshop activities in ${city.name}`, activities),
            section(`Upcoming workshops in ${city.name}`, listed),
        ];
    });

    const blocks = [
        `# ${SITE_NAME}`,
        // The Organization description from siteJsonLd, plus how booking works.
        "> Only Workshops is a website for finding and booking hands-on creative workshops and weekend experiences in Pune, India, hosted by local makers. Seats are booked online on each workshop's own page, which shows the date, venue and price.",
        // The city hubs' own evergreen intros: what has run so far and where.
        ...cities.flatMap(({ city }) => city.intro.map(inline)),
        `Contact: ${CONTACT_EMAIL}, ${phones}. Instagram: ${INSTAGRAM_URL}`,
        section("Key pages", keyPages),
        ...citySections,
        section("Optional", OPTIONAL_PAGES.map(pageLine)),
    ];

    return `${blocks.filter(Boolean).join("\n\n")}\n`;
}
