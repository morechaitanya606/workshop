import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import Footer from "@/components/Footer";
import WorkshopCard from "@/components/WorkshopCard";
import { getCachedPlatformSettings } from "@/lib/cached-reads";
import {
    buildLandingFaqs,
    faqPageJsonLd,
    topicAreaSentence,
    topicGroup,
    topicGroups,
} from "@/lib/city-faqs";
import { getAbsoluteUrl } from "@/lib/env";
import { getIstTodayIso } from "@/lib/ist-date";
import { serializeJsonLd } from "@/lib/json-ld";
import {
    DEFAULT_OG_IMAGES,
    INSTAGRAM_URL,
    SEO_CITIES,
    SITE_NAME,
    breadcrumbJsonLd,
    cityPagePath,
    getSeoCityBySlug,
    workshopOgTitle,
} from "@/lib/seo";
import { SEO_TOPICS, getSeoTopicBySlug, topicPagePath } from "@/lib/seo-topics";
import { loadCityWorkshops } from "@/lib/workshop-page-data";

/*
 * Evergreen activity page (/workshops/pune/chocolate-making): one stable URL per activity that
 * outlives every session date. Event markup stays on the workshop pages themselves.
 */

export const revalidate = 300;
export const dynamicParams = false;

export function generateStaticParams() {
    return SEO_CITIES.flatMap((city) =>
        SEO_TOPICS.map((topic) => ({ city: city.slug, topic: topic.slug }))
    );
}

type Params = { params: Promise<{ city: string; topic: string }> };

/** Shared by the metadata and the page; loadCityWorkshops is cached, so the rows are read once. */
async function loadTopicPage(params: Params["params"]) {
    const { city: citySlug, topic: topicSlug } = await params;
    const city = getSeoCityBySlug(citySlug);
    const topic = getSeoTopicBySlug(topicSlug);
    if (!city || !topic) return null;

    const { upcoming, past, source } = await loadCityWorkshops(city.name);
    return { city, topic, upcoming, past, source, group: topicGroup(topic, upcoming, past) };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
    const data = await loadTopicPage(params);
    if (!data) return {};

    const { city, topic, group, source } = data;
    const canonicalUrl = getAbsoluteUrl(topicPagePath(city, topic));
    // The next session's cover, captioned with that session's own title and place.
    const coverWorkshop = group.upcoming.find((workshop) => workshop.coverImage?.trim());
    const images = coverWorkshop
        ? [
              {
                  url: getAbsoluteUrl(coverWorkshop.coverImage.trim()),
                  alt: workshopOgTitle(coverWorkshop),
              },
          ]
        : DEFAULT_OG_IMAGES;
    // Thin pages stay reachable (follow) but out of the index. A failed read proves nothing
    // about the page, so it never triggers noindex.
    const noindex = !group.indexable && source !== "error";

    return {
        title: topic.metaTitle,
        description: topic.metaDescription,
        alternates: { canonical: canonicalUrl },
        ...(noindex ? { robots: { index: false, follow: true } } : {}),
        openGraph: {
            title: topic.h1,
            description: topic.metaDescription,
            url: canonicalUrl,
            type: "website",
            siteName: SITE_NAME,
            locale: "en_IN",
            images,
        },
        twitter: {
            card: "summary_large_image",
            title: topic.h1,
            description: topic.metaDescription,
        },
    };
}

export default async function TopicWorkshopsPage({ params }: Params) {
    const [data, settings] = await Promise.all([
        loadTopicPage(params),
        getCachedPlatformSettings(),
    ]);
    if (!data) notFound();

    const { city, topic, upcoming, past, group } = data;
    const todayIso = getIstTodayIso();
    const whatsappUrl = settings.whatsapp_community_url?.trim() || undefined;
    const recentPast = group.past.slice(0, 12);
    const areaSentence = topicAreaSentence(group.upcoming, group.past);
    const faqs = buildLandingFaqs({
        city,
        upcoming: group.upcoming,
        past: group.past,
        whatsappUrl,
        topic,
    });
    // Related activities that have at least one session, so no link leads to an empty page.
    const groupsBySlug = new Map(
        topicGroups(upcoming, past).map((g) => [g.topic.slug, g] as const)
    );
    const related = topic.related.flatMap((slug) => {
        const relatedGroup = groupsBySlug.get(slug);
        return relatedGroup && relatedGroup.counts.total > 0 ? [relatedGroup.topic] : [];
    });

    const siteRoot = getAbsoluteUrl("/");
    const cityUrl = getAbsoluteUrl(cityPagePath(city));
    const pageUrl = getAbsoluteUrl(topicPagePath(city, topic));
    const listed = [...group.upcoming, ...recentPast];
    const structuredData = [
        breadcrumbJsonLd([
            { name: "Home", url: siteRoot },
            { name: `Workshops in ${city.name}`, url: cityUrl },
            { name: topic.name, url: pageUrl },
        ]),
        {
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            "@id": `${pageUrl}#webpage`,
            name: topic.h1,
            description: topic.metaDescription,
            url: pageUrl,
            inLanguage: "en-IN",
            // Same @id as the WebSite in siteJsonLd on the homepage.
            isPartOf: {
                "@type": "WebSite",
                "@id": `${siteRoot}#website`,
                name: SITE_NAME,
                url: siteRoot,
            },
            ...(listed.length ? { mainEntity: { "@id": `${pageUrl}#list` } } : {}),
        },
        ...(listed.length
            ? [
                  {
                      "@context": "https://schema.org",
                      "@type": "ItemList",
                      "@id": `${pageUrl}#list`,
                      name: `${topic.name} workshops in ${city.name}`,
                      numberOfItems: listed.length,
                      itemListElement: listed.map((workshop, index) => ({
                          "@type": "ListItem",
                          position: index + 1,
                          url: getAbsoluteUrl(`/workshop/${workshop.id}`),
                          name: workshop.title,
                      })),
                  },
              ]
            : []),
        faqPageJsonLd(faqs),
    ];

    return (
        <div className="min-h-full bg-cream">
            {structuredData.map((item, index) => (
                <script
                    key={index}
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: serializeJsonLd(item) }}
                />
            ))}

            <section className="pt-28 pb-10 section-padding">
                <div className="max-w-7xl mx-auto">
                    <nav
                        aria-label="Breadcrumb"
                        className="mb-6 flex flex-wrap items-center gap-2 text-sm font-inter text-dark-muted"
                    >
                        <Link
                            href="/"
                            className="inline-flex items-center hover:text-terracotta transition-colors"
                        >
                            Home
                        </Link>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <Link
                            href={cityPagePath(city)}
                            className="inline-flex items-center hover:text-terracotta transition-colors"
                        >
                            Workshops in {city.name}
                        </Link>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span className="text-dark" aria-current="page">
                            {topic.name}
                        </span>
                    </nav>
                    <span className="eyebrow-label">{city.name}</span>
                    <h1 className="heading-lg !text-4xl sm:!text-5xl mb-4">{topic.h1}</h1>
                    <div className="max-w-3xl space-y-3">
                        {topic.intro.map((paragraph) => (
                            <p key={paragraph} className="text-body text-dark-muted">
                                {paragraph}
                            </p>
                        ))}
                        {areaSentence && <p className="text-body text-dark">{areaSentence}</p>}
                    </div>
                </div>
            </section>

            <section className="section-padding pb-14" aria-labelledby="upcoming-heading">
                <div className="max-w-7xl mx-auto">
                    <h2 id="upcoming-heading" className="heading-md mb-6">
                        Upcoming {topic.name} workshops in {city.name}
                    </h2>
                    {group.upcoming.length > 0 ? (
                        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {group.upcoming.map((workshop, index) => (
                                <WorkshopCard
                                    key={workshop.id}
                                    workshop={workshop}
                                    todayIso={todayIso}
                                    index={index}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="rounded-2xl border border-gray-200 bg-white px-6 py-8 font-inter">
                            <p className="text-body text-dark mb-4">
                                No {topic.name.toLowerCase()} dates are listed right now. Follow
                                along to hear about new ones:
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
                                <Link href={cityPagePath(city)} className="btn-secondary">
                                    All workshops in {city.name}
                                </Link>
                            </div>
                        </div>
                    )}
                </div>
            </section>

            {recentPast.length > 0 && (
                <section className="section-padding pb-14" aria-labelledby="past-heading">
                    <div className="max-w-7xl mx-auto">
                        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
                            <h2 id="past-heading" className="heading-md">
                                Past {topic.name} sessions in {city.name}
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

            <section className="section-padding pb-14" aria-labelledby="faq-heading">
                <div className="max-w-3xl mx-auto">
                    <h2 id="faq-heading" className="heading-md mb-6">
                        {topic.name} workshops in {city.name}: questions people ask
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

            <section className="section-padding pb-8 md:pb-20" aria-labelledby="related-heading">
                <div className="max-w-3xl mx-auto">
                    <h2 id="related-heading" className="heading-md mb-6">
                        Related workshops in {city.name}
                    </h2>
                    <ul className="flex flex-wrap gap-2">
                        {related.map((relatedTopic) => (
                            <li key={relatedTopic.slug}>
                                <Link
                                    href={topicPagePath(city, relatedTopic)}
                                    className="inline-flex items-center rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-inter text-dark hover:border-terracotta hover:text-terracotta transition-colors"
                                >
                                    {relatedTopic.linkLabel}
                                </Link>
                            </li>
                        ))}
                        <li>
                            <Link
                                href={cityPagePath(city)}
                                className="inline-flex items-center rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-inter font-semibold text-terracotta hover:border-terracotta transition-colors"
                            >
                                All workshops in {city.name}
                            </Link>
                        </li>
                    </ul>
                </div>
            </section>

            <Footer />
        </div>
    );
}
