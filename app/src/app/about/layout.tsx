import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "About Us | Only Workshops",
    description:
        "Learn how Only Workshops makes weekends more meaningful through hands-on creative experiences.",
    openGraph: {
        title: "About Only Workshops",
        description: "Making weekends more meaningful through hands-on creative experiences.",
    },
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
    return children;
}
