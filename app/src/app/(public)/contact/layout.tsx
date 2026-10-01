import type { Metadata } from "next";
import { getAbsoluteUrl } from "@/lib/env";
import { DEFAULT_OG_IMAGES } from "@/lib/seo";

export const metadata: Metadata = {
    title: "Contact | Only Workshops",
    description:
        "Get in touch with the Only Workshops team. We are here to help with booking questions, hosting enquiries, and partnerships.",
    alternates: {
        canonical: getAbsoluteUrl("/contact"),
    },
    openGraph: {
        title: "Contact Only Workshops",
        description: "Reach out to us for any questions or collaborations.",
        url: getAbsoluteUrl("/contact"),
        images: DEFAULT_OG_IMAGES,
    },
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
    return children;
}
