import type { Metadata } from "next";
import { getAbsoluteUrl, getAppUrl } from "@/lib/env";
import { getIstTodayIso } from "@/lib/ist-date";
import { serializeJsonLd } from "@/lib/json-ld";
import { SITE_NAME, siteJsonLd } from "@/lib/seo";
import { loadHomepageCommunityPhotos } from "@/lib/community-photos";
import {
    failRenderOnDataError,
    loadCardPricing,
    loadHomeWorkshops,
    workshopCardExtras,
} from "@/lib/workshop-page-data";
import HomePageClient from "./HomePageClient";

const canonicalUrl = getAbsoluteUrl("/");
// Keyword first; /workshops/pune takes the plain "workshops in Pune" query. Only the <title> and
// the search snippet change for SEO: the visible homepage stays as the owner set it up.
const HOME_TITLE = "Creative Workshops & Classes in Pune | Only Workshops";
const HOME_DESCRIPTION =
    "Hands-on workshops in Pune led by local hosts: pottery, baking, sourdough, chocolate making, macarons, terrariums and ice baths, in small groups. Book online.";
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
        // A page-level openGraph replaces the root one, so these are repeated here.
        siteName: SITE_NAME,
        locale: "en_IN",
        images: [
            {
                url: defaultOgImageUrl,
                width: 1200,
                height: 630,
                alt: "Collage of children and adults painting, playing chess and making crafts at workshops",
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
    const [{ data, source }, communityPhotos, cardPricing] = await Promise.all([
        loadHomeWorkshops(),
        loadHomepageCommunityPhotos(12),
        loadCardPricing(),
    ]);
    // Keeps the last good homepage instead of caching "Unable to load live workshops".
    failRenderOnDataError(source, "/");
    const todayIso = getIstTodayIso();
    // Only the workshop cards use these (offer badge and price, "Bookings closed"): the rest of
    // the homepage stays exactly as the owner set it up.
    const { cardOffers, closedWorkshopIds } = workshopCardExtras(data, cardPricing, todayIso);

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
                cardOffers={cardOffers}
                closedWorkshopIds={closedWorkshopIds}
            />
        </>
    );
}
