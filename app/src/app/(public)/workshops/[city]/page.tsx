import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import Footer from "@/components/Footer";
import WorkshopCard, { WorkshopPriceTag } from "@/components/WorkshopCard";
import { getCachedPlatformSettings } from "@/lib/cached-reads";
import { buildLandingFaqs, faqPageJsonLd, topicGroups } from "@/lib/city-faqs";
import { getAbsoluteUrl } from "@/lib/env";
import { getIstTodayIso, isDateBetween, istWeekendRange } from "@/lib/ist-date";
import { serializeJsonLd } from "@/lib/json-ld";
import {
    DEFAULT_OG_IMAGES,
    INSTAGRAM_URL,
    SEO_CITIES,
    SITE_NAME,
    breadcrumbJsonLd,
    cityHubH1,
    cityMetaTitle,
    cityPagePath,
    displayVenue,
    firstSentence,
    formatWorkshopDate,
    formatWorkshopTime,
    getSeoCityBySlug,
} from "@/lib/seo";
import { topicPagePath } from "@/lib/seo-topics";
import {
    failRenderOnDataError,
    loadCardPricing,
    loadCityWorkshops,
    workshopCardExtras,
} from "@/lib/workshop-page-data";

export const revalidate = 300;
export const dynamicParams = false;

export function generateStaticParams() {
    return SEO_CITIES.map((city) => ({ city: city.slug }));
}

type Params = { params: Promise<{ city: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
    const city = getSeoCityBySlug((await params).city);
    if (!city) return {};

    const canonicalUrl = getAbsoluteUrl(cityPagePath(city));
    // Rendered at most every 5 minutes (revalidate), so the year turns over on 1 January.
    const title = cityMetaTitle(city, getIstTodayIso().slice(0, 4));
    return {
        title,
        description: city.metaDescription,
        alternates: { canonical: canonicalUrl },
        openGraph: {
            title,
            description: city.metaDescription,
            url: canonicalUrl,
            type: "website",
            // A page-level openGraph replaces the root one, so these are repeated here.
            siteName: SITE_NAME,
            locale: "en_IN",
            images: DEFAULT_OG_IMAGES,
        },
        twitter: {
            card: "summary_large_image",
            title,
            description: city.metaDescription,
        },
    };
}

export default async function CityWorkshopsPage({ params }: Params) {
    const city = getSeoCityBySlug((await params).city);
    if (!city) notFound();

    const [{ upcoming, past, source }, settings, cardPricing] = await Promise.all([
        loadCityWorkshops(city.name),
        getCachedPlatformSettings(),
        loadCardPricing(),
    ]);
    // Keeps the last good page instead of caching empty lists for five minutes.
    failRenderOnDataError(source, cityPagePath(city));
    const todayIso = getIstTodayIso();
    const { cardOffers, closedWorkshopIds } = workshopCardExtras(upcoming, cardPricing, todayIso);
    const closed = new Set(closedWorkshopIds);
    const offerFor = (workshopId: string) =>
        Object.hasOwn(cardOffers, workshopId) ? cardOffers[workshopId] : null;
    const whatsappUrl = settings.whatsapp_community_url?.trim() || undefined;
    const recentPast = past.slice(0, 12);
    const faqs = buildLandingFaqs({ city, upcoming, past, whatsappUrl, todayIso });
    const weekendRange = istWeekendRange(todayIso);
    const thisWeekend = upcoming.filter((workshop) =>
        isDateBetween(workshop.date, weekendRange.from, weekendRange.to)
    );
    const nextWorkshop = [...upcoming]
        .filter((workshop) => isDateBetween(workshop.date, todayIso, "9999-12-31"))
        .sort((a, b) => a.date.localeCompare(b.date))[0];
    // Activity pages that pass the thin-content rule; the others stay unlinked from here.
    const topics = topicGroups(upcoming, past).filter((group) => group.indexable);

    const pageUrl = getAbsoluteUrl(cityPagePath(city));
    const structuredData = [
        breadcrumbJsonLd([
            { name: "Home", url: getAbsoluteUrl("/") },
            { name: `Workshops in ${city.name}`, url: pageUrl },
        ]),
        {
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: `Workshops in ${city.name}`,
            itemListElement: [...upcoming, ...recentPast].map((workshop, index) => ({
                "@type": "ListItem",
                position: index + 1,
                url: getAbsoluteUrl(`/workshop/${workshop.id}`),
                name: workshop.title,
            })),
        },
        faqPageJsonLd(faqs),
    ];

    return (
        <div className="min-h-full bg-cream">
            {structuredData.map((data, index) => (
                <script
                    key={index}
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
                />
            ))}

            <section className="pt-28 pb-10 section-padding">
                <div className="max-w-7xl mx-auto">
                    <nav
                        aria-label="Breadcrumb"
                        className="mb-6 flex items-center gap-2 text-sm font-inter text-dark-muted"
                    >
                        <Link
                            href="/"
                            className="inline-flex items-center hover:text-terracotta transition-colors"
                        >
                            Home
                        </Link>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span className="text-dark" aria-current="page">
                            Workshops in {city.name}
                        </span>
                    </nav>
                    <span className="eyebrow-label">{city.name}</span>
                    <h1 className="heading-lg !text-4xl sm:!text-5xl mb-4">{cityHubH1(city)}</h1>
                    <div className="max-w-3xl space-y-3">
                        {city.intro.map((paragraph) => (
                            <p key={paragraph} className="text-body text-dark-muted">
                                {paragraph}
                            </p>
                        ))}
                    </div>
                    {topics.length > 0 && (
                        <ul
                            className="mt-6 flex flex-wrap gap-2"
                            aria-label="Workshops by activity"
                        >
                            {topics.map(({ topic, counts }) => (
                                <li key={topic.slug}>
                                    <Link
                                        href={topicPagePath(city, topic)}
                                        className="inline-flex items-center rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-inter text-dark hover:border-terracotta hover:text-terracotta transition-colors"
                                    >
                                        {topic.name}
                                        <span className="ml-2 text-dark-muted">
                                            {counts.total}
                                            <span className="sr-only">
                                                {counts.total === 1 ? " session" : " sessions"}
                                            </span>
                                        </span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </section>

            {nextWorkshop && (
                <section className="section-padding pb-14" aria-labelledby="weekend-heading">
                    <div className="max-w-7xl mx-auto">
                        <h2 id="weekend-heading" className="heading-md mb-4">
                            Workshops in {city.name} this weekend
                        </h2>
                        {thisWeekend.length > 0 ? (
                            <ul className="divide-y divide-clay/30 rounded-2xl border border-gray-200 bg-white font-inter">
                                {thisWeekend.map((workshop) => (
                                    <li
                                        key={workshop.id}
                                        className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
                                    >
                                        <div className="min-w-0">
                                            <Link
                                                href={`/workshop/${workshop.id}`}
                                                className="font-semibold text-dark hover:text-terracotta transition-colors"
                                            >
                                                {workshop.title}
                                            </Link>
                                            <p className="text-sm text-dark-muted">
                                                {[
                                                    formatWorkshopDate(workshop.date),
                                                    formatWorkshopTime(workshop.time),
                                                    displayVenue(workshop),
                                                ]
                                                    .filter(Boolean)
                                                    .join(" · ")}
                                            </p>
                                        </div>
                                        <WorkshopPriceTag
                                            className="shrink-0 text-sm font-semibold text-dark"
                                            price={workshop.price}
                                            offer={offerFor(workshop.id)}
                                            bookingsClosed={closed.has(workshop.id)}
                                            soldOut={workshop.seatsRemaining <= 0}
                                        />
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-body text-dark-muted">
                                Nothing is scheduled for this weekend yet. The next workshop is{" "}
                                <Link
                                    href={`/workshop/${nextWorkshop.id}`}
                                    className="font-semibold text-terracotta hover:underline"
                                >
                                    {nextWorkshop.title}
                                </Link>{" "}
                                on {formatWorkshopDate(nextWorkshop.date)}.
                            </p>
                        )}
                    </div>
                </section>
            )}

            <section className="section-padding pb-14" aria-labelledby="upcoming-heading">
                <div className="max-w-7xl mx-auto">
                    <h2 id="upcoming-heading" className="heading-md mb-6">
                        Upcoming workshops in {city.name}
                    </h2>
                    {upcoming.length > 0 ? (
                        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {upcoming.map((workshop, index) => (
                                <WorkshopCard
                                    key={workshop.id}
                                    workshop={workshop}
                                    todayIso={todayIso}
                                    index={index}
                                    offer={offerFor(workshop.id)}
                                    bookingsClosed={closed.has(workshop.id)}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="rounded-2xl border border-gray-200 bg-white px-6 py-8 font-inter">
                            <p className="text-body text-dark mb-4">
                                New {city.name} dates are on their way. Be the first to hear about
                                them:
                            </p>
                            <div className="flex flex-wrap gap-3">
                                {whatsappUrl && (
                                    <a
                                        href={whatsappUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="btn-primary"
                                    >
                                        Join our WhatsApp community
                                    </a>
                                )}
                                <a
                                    href={INSTAGRAM_URL}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="btn-secondary"
                                >
                                    Follow @only_workshops
                                </a>
                                <Link href="/explore" className="btn-secondary">
                                    Explore all workshops
                                </Link>
                            </div>
                        </div>
                    )}
                </div>
            </section>

            {topics.length > 0 && (
                <section className="section-padding pb-14" aria-labelledby="activities-heading">
                    <div className="max-w-7xl mx-auto">
                        <h2 id="activities-heading" className="heading-md mb-6">
                            Workshops by activity in {city.name}
                        </h2>
                        {/* One evergreen line per activity page, so each link has real context. */}
                        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {topics.map(({ topic, counts }) => (
                                <li
                                    key={topic.slug}
                                    className="rounded-2xl border border-gray-200 bg-white p-5 font-inter"
                                >
                                    <h3 className="mb-2 font-semibold text-dark">
                                        <Link
                                            href={topicPagePath(city, topic)}
                                            className="hover:text-terracotta transition-colors"
                                        >
                                            {topic.linkLabel} in {city.name}
                                        </Link>
                                    </h3>
                                    <p className="text-body-sm">{firstSentence(topic.intro[0])}</p>
                                    {counts.upcoming > 0 && (
                                        <p className="mt-3 text-sm font-semibold text-terracotta">
                                            {counts.upcoming} upcoming{" "}
                                            {counts.upcoming === 1 ? "date" : "dates"}
                                        </p>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                </section>
            )}

            {recentPast.length > 0 && (
                <section className="section-padding pb-14" aria-labelledby="past-heading">
                    <div className="max-w-7xl mx-auto">
                        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
                            <h2 id="past-heading" className="heading-md">
                                Recently hosted in {city.name}
                            </h2>
                            <Link
                                href="/past-events"
                                className="text-sm font-inter font-semibold text-terracotta hover:underline"
                            >
                                See photos from past events
                            </Link>
                        </div>
                        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {recentPast.map((workshop, index) => (
                                <WorkshopCard
                                    key={workshop.id}
                                    workshop={workshop}
                                    todayIso={todayIso}
                                    index={index}
                                    showBadgeLabels={false}
                                />
                            ))}
                        </div>
                    </div>
                </section>
            )}

            <section className="section-padding pb-8 md:pb-20" aria-labelledby="faq-heading">
                <div className="max-w-3xl mx-auto">
                    <h2 id="faq-heading" className="heading-md mb-6">
                        Workshops in {city.name}: questions people ask
                    </h2>
                    <dl className="space-y-6 font-inter">
                        {faqs.map((faq) => (
                            <div key={faq.question}>
                                <dt className="font-semibold text-dark mb-1">{faq.question}</dt>
                                <dd className="text-body text-dark-muted">
                                    {faq.answer}
                                    {faq.link && (
                                        <>
                                            {" "}
                                            <Link
                                                href={faq.link.href}
                                                className="text-terracotta font-semibold hover:underline"
                                            >
                                                {faq.link.label}
                                            </Link>
                                        </>
                                    )}
                                </dd>
                            </div>
                        ))}
                    </dl>
                </div>
            </section>

            <Footer />
        </div>
    );
}
