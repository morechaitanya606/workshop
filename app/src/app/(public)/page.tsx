import type { Metadata } from "next";
import { getAbsoluteUrl, getAppUrl } from "@/lib/env";
import { getIstTodayIso } from "@/lib/ist-date";
import { serializeJsonLd } from "@/lib/json-ld";
import { siteJsonLd } from "@/lib/seo";
import { loadHomepageCommunityPhotos } from "@/lib/community-photos";
import { loadHomeWorkshops } from "@/lib/workshop-page-data";
import HomePageClient from "./HomePageClient";

const canonicalUrl = getAbsoluteUrl("/");
const HOME_TITLE = "Only Workshops | Creative Workshops & Events in Pune";
const HOME_DESCRIPTION =
    "Book hands-on creative workshops in Pune: pottery, baking, sourdough pizza, kimchi and more, with local makers in small groups. Reserve your seat online.";
const defaultOgImageUrl = getAbsoluteUrl("/images/og-default.jpg");

export const metadata: Metadata = {
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    alternates: {
        canonical: canonicalUrl,
    },
    openGraph: {
        title: HOME_TITLE,
        description: HOME_DESCRIPTION,
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
        title: HOME_TITLE,
        description: HOME_DESCRIPTION,
        images: [defaultOgImageUrl],
    },
};

export const revalidate = 60;

export default async function HomePage() {
    const [{ data, source }, communityPhotos] = await Promise.all([
        loadHomeWorkshops(),
        loadHomepageCommunityPhotos(12),
    ]);
    const todayIso = getIstTodayIso();

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: serializeJsonLd(siteJsonLd(getAppUrl())),
                }}
            />
            <HomePageClient
                initialWorkshops={data}
                communityPhotos={communityPhotos}
                source={source}
                todayIso={todayIso}
            />
        </>
    );
}
