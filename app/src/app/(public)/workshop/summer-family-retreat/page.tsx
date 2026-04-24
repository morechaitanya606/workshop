import type { Metadata } from "next";
import { DM_Sans, Cormorant_Garamond } from "next/font/google";
import { getAbsoluteUrl } from "@/lib/env";
import SummerRetreatClient from "./SummerRetreatClient";

const dmSans = DM_Sans({
    subsets: ["latin"],
    variable: "--font-dm-sans",
    display: "swap",
    weight: ["400", "500", "700"],
});

const cormorantGaramond = Cormorant_Garamond({
    subsets: ["latin"],
    variable: "--font-cormorant",
    display: "swap",
    weight: ["300"],
    style: ["italic"],
});

const canonicalUrl = getAbsoluteUrl("/workshop/summer-family-retreat");
const ogImageUrl = getAbsoluteUrl("/images/summer-family-retreat-og.jpg");

export const metadata: Metadata = {
    title: "Summer Family Retreat | Only Workshops x The Yellow Slice",
    description:
        "Join the Summer Family Retreat on May 9-10 at The Yellow Slice, Pirangut. Drone making and cakesicle workshops for kids, with cheese tasting and estate tours for parents.",
    keywords: [
        "summer family retreat pune",
        "family workshop pune",
        "kids workshop pirangut",
        "drone workshop pune",
        "cakesicle workshop pune",
        "The Yellow Slice",
        "Only Workshops",
    ],
    alternates: {
        canonical: canonicalUrl,
    },
    openGraph: {
        title: "Summer Family Retreat | May 9-10 in Pirangut",
        description:
            "A two-evening family retreat with creative workshops for kids and curated estate experiences for parents at The Yellow Slice, Pirangut.",
        url: canonicalUrl,
        type: "website",
        images: [
            {
                url: ogImageUrl,
                width: 1200,
                height: 630,
                alt: "Summer Family Retreat event preview",
            },
        ],
    },
    twitter: {
        card: "summary_large_image",
        title: "Summer Family Retreat | May 9-10 in Pirangut",
        description:
            "Drone making and cakesicle workshops for kids, plus cheese tasting and estate tours for parents.",
        images: [ogImageUrl],
    },
};

const eventStructuredData = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: "Summer Family Retreat",
    description:
        "A curated family experience with drone making and cakesicle workshops for kids, plus cheese tasting and estate tours for parents at The Yellow Slice, Pirangut.",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    startDate: "2026-05-09T17:00:00+05:30",
    endDate: "2026-05-10T21:00:00+05:30",
    image: [ogImageUrl],
    url: canonicalUrl,
    location: {
        "@type": "Place",
        name: "The Yellow Slice",
        address: {
            "@type": "PostalAddress",
            addressLocality: "Pirangut, Pune",
            addressRegion: "Maharashtra",
            addressCountry: "IN",
        },
    },
    organizer: [
        {
            "@type": "Organization",
            name: "Only Workshops",
            url: getAbsoluteUrl("/"),
        },
        {
            "@type": "Organization",
            name: "The Yellow Slice",
        },
    ],
};

export default function SummerFamilyRetreatPage() {
    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify(eventStructuredData),
                }}
            />
            <div className={`${dmSans.variable} ${cormorantGaramond.variable}`}>
                <SummerRetreatClient />
            </div>
        </>
    );
}
