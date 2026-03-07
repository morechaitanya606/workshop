import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Explore Workshops | Only Workshop",
    description:
        "Browse and filter creative workshops happening in your city. Pottery, painting, cooking, music and more.",
    openGraph: {
        title: "Explore Workshops | Only Workshop",
        description:
            "Browse and filter creative workshops happening in your city.",
    },
};

export default function ExploreLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return children;
}
