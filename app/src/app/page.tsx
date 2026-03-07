import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase-server";
import { mapWorkshopRowToWorkshop, queryMockWorkshops } from "@/lib/workshop-utils";
import HomePageClient from "./HomePageClient";

export const metadata = {
    title: "Only Workshop | Creative experiences in your city",
    description: "Discover creative workshops and experiences happening in your city. Book pottery, painting, cooking, and more.",
};

async function getLiveWorkshops() {
    if (isSupabaseServiceConfigured) {
        try {
            const serviceClient = createSupabaseServiceClient();
            const { data, error } = await serviceClient
                .from("workshops")
                .select("*")
                .order("date", { ascending: true })
                .limit(12);

            if (!error && data) {
                return data.map((row) => mapWorkshopRowToWorkshop(row as Record<string, unknown>));
            }
        } catch (e) {
            console.error("Failed to fetch live workshops:", e);
        }
    }
    // Fallback to mock data
    return queryMockWorkshops({
        q: "",
        category: "",
        city: "",
        dateFrom: "",
        dateTo: "",
        sort: "date_asc",
        page: 1,
        pageSize: 12
    }).data;
}

export default async function HomePage() {
    const workshops = await getLiveWorkshops();
    return <HomePageClient initialWorkshops={workshops} />;
}
