import type { Metadata } from "next";
import { getAbsoluteUrl } from "@/lib/env";
import { DEFAULT_OG_IMAGES } from "@/lib/seo";

export const metadata: Metadata = {
    title: "About Us | Only Workshops",
    description:
        "Learn how Only Workshops makes weekends more meaningful through hands-on creative experiences.",
    alternates: {
        canonical: getAbsoluteUrl("/about"),
    },
    openGraph: {
        title: "About Only Workshops",
        description: "Making weekends more meaningful through hands-on creative experiences.",
        url: getAbsoluteUrl("/about"),
        images: DEFAULT_OG_IMAGES,
    },
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
    return children;
}
