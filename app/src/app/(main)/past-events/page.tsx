import { loadHomeWorkshops } from "@/lib/workshop-page-data";
import PastEventsPageClient from "./PastEventsPageClient";

export const metadata = {
    title: "Past Events & Photos | Only Workshops",
    description:
        "Browse photos and memories from past workshops and creative experiences hosted across the city.",
};

export const revalidate = 60;

export default async function PastEventsPage() {
    const { data, source } = await loadHomeWorkshops();
    return <PastEventsPageClient allWorkshops={data} source={source} />;
}
