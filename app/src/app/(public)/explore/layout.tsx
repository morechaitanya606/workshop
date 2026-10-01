import type { Metadata } from "next";
import { DEFAULT_OG_IMAGES } from "@/lib/seo";

export const metadata: Metadata = {
    title: "Explore Workshops | Only Workshops",
    description:
        "Browse and filter creative workshops happening in your city. Pottery, painting, cooking, music and more.",
    openGraph: {
        title: "Explore Workshops | Only Workshops",
        description: "Browse and filter creative workshops happening in your city.",
        images: DEFAULT_OG_IMAGES,
    },
};

export default function ExploreLayout({ children }: { children: React.ReactNode }) {
    return children;
}
