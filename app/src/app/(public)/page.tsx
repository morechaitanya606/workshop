import type { Metadata } from "next";
import { getAbsoluteUrl } from "@/lib/env";
import { loadHomeWorkshops } from "@/lib/workshop-page-data";
import HomePageClient from "./HomePageClient";

const canonicalUrl = getAbsoluteUrl("/");
const defaultOgImageUrl = getAbsoluteUrl("/images/og-default.jpg");

export const metadata: Metadata = {
    title: "Only Workshops | Creative experiences in your city",
    description:
        "Discover creative workshops and experiences happening in your city. Book pottery, painting, cooking, and more.",
    alternates: {
        canonical: canonicalUrl,
    },
    openGraph: {
        title: "Only Workshops | Creative experiences in your city",
        description:
            "Discover creative workshops and experiences happening in your city. Book pottery, painting, cooking, and more.",
        url: canonicalUrl,
        type: "website",
        images: [
            {
                url: defaultOgImageUrl,
                width: 1200,
                height: 630,
                alt: "Only Workshops homepage social preview",
            },
        ],
    },
    twitter: {
        card: "summary_large_image",
        title: "Only Workshops | Creative experiences in your city",
        description:
            "Discover creative workshops and experiences happening in your city. Book pottery, painting, cooking, and more.",
        images: [defaultOgImageUrl],
    },
};

export const revalidate = 60;

const organizationStructuredData = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Only Workshops",
    url: canonicalUrl,
    logo: getAbsoluteUrl("/images/icon.png"),
    sameAs: ["https://www.instagram.com/only_workshops"],
};

export default async function HomePage() {
    const { data, source } = await loadHomeWorkshops();
    const todayIso = new Date().toISOString().slice(0, 10);

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify(organizationStructuredData),
                }}
            />
            <HomePageClient initialWorkshops={data} source={source} todayIso={todayIso} />
        </>
    );
}
