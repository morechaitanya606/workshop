import type { Metadata } from "next";
import { getAbsoluteUrl } from "@/lib/env";
import { DEFAULT_OG_IMAGES, SITE_NAME } from "@/lib/seo";
import { ABOUT_DESCRIPTION, ABOUT_TITLE } from "./about-meta";

export const metadata: Metadata = {
    title: ABOUT_TITLE,
    description: ABOUT_DESCRIPTION,
    alternates: {
        canonical: getAbsoluteUrl("/about"),
    },
    openGraph: {
        title: ABOUT_TITLE,
        description: ABOUT_DESCRIPTION,
        url: getAbsoluteUrl("/about"),
        type: "website",
        // A page-level openGraph replaces the root one, so these are repeated here.
        siteName: SITE_NAME,
        locale: "en_IN",
        images: DEFAULT_OG_IMAGES,
    },
    twitter: {
        card: "summary_large_image",
        title: ABOUT_TITLE,
        description: ABOUT_DESCRIPTION,
    },
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
    return children;
}
