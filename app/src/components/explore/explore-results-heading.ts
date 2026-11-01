import { PAST_EVENTS_CATEGORY_LABEL } from "@/lib/data";

/**
 * Section title above the /explore results, so the card titles (h3) sit under an h2 rather than
 * straight under the page's h1. It says only what the query guarantees: upcoming sessions, or
 * finished ones for the "Past Events" category (see buildExploreWorkshopQuery). It names no city:
 * the h1 already says Pune, /explore is a utility page that should not compete with the
 * /workshops/pune hub for "workshops in Pune", and every filtered URL canonicalises to /explore.
 */
export function exploreResultsHeading({ category }: { category: string }) {
    const isPastEvents = category.trim().toLowerCase() === PAST_EVENTS_CATEGORY_LABEL.toLowerCase();
    return isPastEvents ? "Past workshops" : "Upcoming workshops";
}
