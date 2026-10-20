import type { Metadata } from "next";
import { getAbsoluteUrl } from "@/lib/env";
import { DEFAULT_OG_IMAGES } from "@/lib/seo";
import { PAST_WORKSHOPS_PAGE_SIZE, loadPastWorkshops } from "@/lib/workshop-page-data";
import PastEventsPageClient from "./PastEventsPageClient";

const title = "Past Events & Photos | Only Workshops";
const description =
    "Browse photos and memories from past workshops and creative experiences hosted across Pune.";
const canonical = getAbsoluteUrl("/past-events");

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
    const { data, total, source } = await loadPastWorkshops(1, PAST_WORKSHOPS_PAGE_SIZE);

    return (
        <PastEventsPageClient
            initialWorkshops={data}
            initialTotal={total}
            pageSize={PAST_WORKSHOPS_PAGE_SIZE}
            source={source}
        />
    );
}
