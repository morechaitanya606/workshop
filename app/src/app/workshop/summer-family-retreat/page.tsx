import type { Metadata } from "next";
import { DM_Sans, Cormorant_Garamond } from "next/font/google";
import SummerRetreatClient from "./SummerRetreatClient";

const dmSans = DM_Sans({
    subsets: ["latin"],
    variable: "--font-dm-sans",
    display: "swap",
    weight: ["300", "400", "500", "600", "700"],
});

const cormorantGaramond = Cormorant_Garamond({
    subsets: ["latin"],
    variable: "--font-cormorant",
    display: "swap",
    weight: ["300", "500"],
    style: ["normal", "italic"],
});

export const metadata: Metadata = {
    title: "Summer Special Family Retreat | Only Workshops x The Yellow Slice",
    description:
        "The Summer Special Family Retreat page with the exact event design, programme, venue details, parent experience, and contact information.",
    keywords: [
        "summer family retreat",
        "family workshop",
        "Yellow Slice",
        "Only Workshops",
        "creative family experience",
        "summer activities for families",
    ],
    openGraph: {
        title: "Summer Special Family Retreat | Only Workshops x The Yellow Slice",
        description:
            "The Summer Special Family Retreat page with the exact event design, programme, venue details, parent experience, and contact information.",
        type: "website",
        images: [
            {
                url: "/images/og-default.jpg",
                width: 1200,
                height: 630,
                alt: "Summer Family Retreat preview",
            },
        ],
    },
};

export default function SummerFamilyRetreatPage() {
    return (
        <div className={`${dmSans.variable} ${cormorantGaramond.variable}`}>
            <SummerRetreatClient />
        </div>
    );
}
