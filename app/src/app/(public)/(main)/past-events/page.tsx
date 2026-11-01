import type { Metadata } from "next";
import { getAbsoluteUrl } from "@/lib/env";
import { serializeJsonLd } from "@/lib/json-ld";
import { DEFAULT_OG_IMAGES, breadcrumbJsonLd } from "@/lib/seo";
import { withOneRetry } from "@/lib/cache-success-only";
import {
    PAST_WORKSHOPS_PAGE_SIZE,
    failRenderOnDataError,
    loadPastWorkshops,
} from "@/lib/workshop-page-data";
import { topicLinksFor } from "@/lib/seo-topics";
import PastEventsPageClient from "./PastEventsPageClient";

const title = "Past Workshops in Pune: Photos & Highlights | Only Workshops";
const description =
    "Photos and highlights from past hands-on workshops in Pune, from baking and sourdough to pottery and terrariums. See what each session was like.";
const canonical = getAbsoluteUrl("/past-events");
// Mirrors the visible breadcrumb in PastEventsPageClient.
const breadcrumb = breadcrumbJsonLd([
    { name: "Home", url: getAbsoluteUrl("/") },
    { name: "Workshops in Pune", url: getAbsoluteUrl("/workshops/pune") },
    { name: "Past workshops", url: canonical },
]);

export const metadata: Metadata = {
    title,
    description,
    alternates: {
        canonical,
    },
    // Own social preview (WhatsApp, Instagram links) instead of the generic site one.
    openGraph: { title, description, url: canonical, type: "website", images: DEFAULT_OG_IMAGES },
    twitter: { card: "summary_large_image", title, description },
};

export const revalidate = 60;

export default async function PastEventsPage() {
    // The page is cached whole for a minute: retry once, then keep the last good page rather
    // than cache "could not load" (the "Load more" action reads once, like any button press).
    const { data, total, source } = await withOneRetry(
        () => loadPastWorkshops(1, PAST_WORKSHOPS_PAGE_SIZE),
        (attempt) => attempt.source === "error"
    );
    failRenderOnDataError(source, "/past-events");

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumb) }}
            />
            <PastEventsPageClient
                initialWorkshops={data}
                initialTopicLinks={topicLinksFor(data)}
                initialTotal={total}
                pageSize={PAST_WORKSHOPS_PAGE_SIZE}
                source={source}
            />
        </>
    );
}
