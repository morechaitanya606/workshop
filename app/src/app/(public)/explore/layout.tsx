import type { Metadata } from "next";
import { DEFAULT_OG_IMAGES } from "@/lib/seo";

export const metadata: Metadata = {
    title: "Explore Workshops in Pune | Only Workshops",
    description:
        "Browse and filter creative workshops in Pune by date, price and category: pottery, baking, cooking and more.",
    openGraph: {
        title: "Explore Workshops in Pune | Only Workshops",
        description: "Browse and filter creative workshops in Pune.",
        images: DEFAULT_OG_IMAGES,
    },
};

export default function ExploreLayout({ children }: { children: React.ReactNode }) {
    return children;
}
