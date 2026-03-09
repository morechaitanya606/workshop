import { loadHomeWorkshops } from "@/lib/workshop-page-data";
import HomePageClient from "./HomePageClient";

export const metadata = {
    title: "Only Workshop | Creative experiences in your city",
    description:
        "Discover creative workshops and experiences happening in your city. Book pottery, painting, cooking, and more.",
};

export const revalidate = 60;

export default async function HomePage() {
    const { data, source } = await loadHomeWorkshops();
    return <HomePageClient initialWorkshops={data} source={source} />;
}
