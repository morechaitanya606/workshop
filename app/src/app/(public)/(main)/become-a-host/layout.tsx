import type { Metadata } from "next";
import { getAbsoluteUrl } from "@/lib/env";
import { DEFAULT_OG_IMAGES, SITE_NAME } from "@/lib/seo";

const title = "Become a Workshop Host in Pune | Only Workshops";
const description =
    "Teach a hands-on workshop in Pune with Only Workshops. See who can host, how applications are reviewed and what you manage from the host dashboard.";
const canonical = getAbsoluteUrl("/become-a-host");

export const metadata: Metadata = {
    title,
    description,
    alternates: {
        canonical,
    },
    // Own social preview instead of the homepage's "A Better Weekend Awaits" one.
    openGraph: {
        title,
        description,
        url: canonical,
        type: "website",
        // A page-level openGraph replaces the root one, so these are repeated here.
        siteName: SITE_NAME,
        locale: "en_IN",
        images: DEFAULT_OG_IMAGES,
    },
    twitter: { card: "summary_large_image", title, description },
};

export default function BecomeAHostLayout({ children }: { children: React.ReactNode }) {
    return children;
}
