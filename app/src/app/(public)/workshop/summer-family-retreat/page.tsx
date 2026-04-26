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
    title: "Best Pune Special Event for Parents and Child | Summer Family Retreat 2026",
    description:
        "Searching for a Pune special event for parents and child? Join our top-rated Summer Family Retreat on May 9-10. Enjoy exciting kids' workshops (drones & cakesicles) while parents relax with exclusive cheese tasting and estate tours at The Yellow Slice, Pirangut. Book the most trending family event in Pune today!",
    keywords: [
        "Pune special event for parents and child",
        "special events in Pune for family",
        "Pune kids workshops",
        "family summer retreat Pune",
        "fun places for kids in Pune",
        "drone making workshop Pune",
        "cakesicle workshop for kids Pune",
        "weekend family getaways near Pune",
        "Pune parent-child activities",
        "things to do in Pune with kids this weekend",
        "trending family events in Pune",
        "summer camp for kids in Pune",
        "parent and child workshops in Pune",
        "The Yellow Slice Pirangut events",
        "Only Workshops Pune",
    ],
    alternates: {
        canonical: canonicalUrl,
    },
    openGraph: {
        title: "Top Pune Special Event for Parents and Child | Summer Retreat",
        description:
            "Experience the most trending family weekend in Pune! Creative drone & baking workshops for kids, plus relaxing curated estate experiences for parents at The Yellow Slice, Pirangut.",
        url: canonicalUrl,
        type: "website",
        images: [
            {
                url: ogImageUrl,
                width: 1200,
                height: 630,
                alt: "Pune special event for parents and child - Summer Family Retreat",
            },
        ],
    },
    twitter: {
        card: "summary_large_image",
        title: "Must-Attend Pune Special Event for Parents & Child",
        description:
            "Looking for family events in Pune? Treat your kids to fun workshops while you enjoy relaxing estate tours. The ultimate summer family retreat!",
        images: [ogImageUrl],
    },
};

const eventStructuredData = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: "Pune Special Event for Parents and Child: Summer Family Retreat",
    description:
        "The ultimate Pune special event for parents and child. A curated family experience featuring drone making and cakesicle workshops for kids, plus exclusive cheese tasting and estate tours for parents at The Yellow Slice, Pirangut. Voted among the top trending events in Pune.",
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
