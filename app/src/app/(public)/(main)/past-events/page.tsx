import type { Metadata } from "next";
import { getAbsoluteUrl } from "@/lib/env";
import { PAST_WORKSHOPS_PAGE_SIZE, loadPastWorkshops } from "@/lib/workshop-page-data";
import PastEventsPageClient from "./PastEventsPageClient";

export const metadata: Metadata = {
    title: "Past Events & Photos | Only Workshops",
    description:
        "Browse photos and memories from past workshops and creative experiences hosted across the city.",
    alternates: {
        canonical: getAbsoluteUrl("/past-events"),
    },
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
