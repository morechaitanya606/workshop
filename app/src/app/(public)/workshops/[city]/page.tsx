import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import Footer from "@/components/Footer";
import WorkshopCard from "@/components/WorkshopCard";
import { BOOKING_HOLD_MINUTES } from "@/lib/booking-time";
import { getCachedPlatformSettings } from "@/lib/cached-reads";
import { CANCELLATION_POLICY } from "@/lib/cancellation-policy";
import type { Workshop } from "@/lib/data";
import { getAbsoluteUrl } from "@/lib/env";
import { getIstTodayIso } from "@/lib/ist-date";
import { serializeJsonLd } from "@/lib/json-ld";
import {
    DEFAULT_OG_IMAGES,
    INSTAGRAM_URL,
    SEO_CITIES,
    breadcrumbJsonLd,
    cityPagePath,
    getSeoCityBySlug,
    type SeoCity,
} from "@/lib/seo";
import { formatCurrency } from "@/lib/utils";
import { loadCityWorkshops } from "@/lib/workshop-page-data";

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
    return {
        title: city.metaTitle,
        description: city.metaDescription,
        alternates: { canonical: canonicalUrl },
        openGraph: {
            title: city.metaTitle,
            description: city.metaDescription,
            url: canonicalUrl,
            type: "website",
            images: DEFAULT_OG_IMAGES,
        },
        twitter: {
            card: "summary_large_image",
            title: city.metaTitle,
            description: city.metaDescription,
        },
    };
}

type Faq = { question: string; answer: string; link?: { href: string; label: string } };

function joinList(items: string[]) {
    if (items.length <= 1) return items[0] ?? "";
    return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function range(values: number[]) {
    const clean = values.filter((value) => Number.isFinite(value) && value > 0);
    return clean.length ? { min: Math.min(...clean), max: Math.max(...clean) } : null;
}

/** Answers come from live data and shared policy constants, so they cannot drift. */
function buildFaqs(city: SeoCity, workshops: Workshop[], whatsappUrl: string | undefined) {
    const categories = [...new Set(workshops.map((w) => w.category).filter(Boolean))];
    const prices = range(workshops.map((w) => w.price));
    const seats = range(workshops.map((w) => w.maxSeats));
    const faqs: Faq[] = [];

    if (categories.length) {
        const groupSize = seats
            ? seats.min === seats.max
                ? ` Groups are kept to around ${seats.max} people.`
                : ` Groups are kept small, around ${seats.min} to ${seats.max} people.`
            : "";
        faqs.push({
            question: `What kind of workshops can I do in ${city.name}?`,
            answer: `Hands-on ${joinList(categories.map((c) => c.toLowerCase()))} workshops led by local hosts.${groupSize}`,
        });
    }

    faqs.push({
        question: `Where do the workshops in ${city.name} take place?`,
        answer: `At partner studios, cafés and kitchens around ${city.name}. The exact venue and address are on each workshop's page.`,
    });

    if (prices) {
        faqs.push({
            question: `How much does a workshop in ${city.name} cost?`,
            answer:
                prices.min === prices.max
                    ? `Workshops have been ${formatCurrency(prices.min)} per person. Each workshop page shows the full price before you pay.`
                    : `Workshops have ranged from ${formatCurrency(prices.min)} to ${formatCurrency(prices.max)} per person. Each workshop page shows the full price before you pay.`,
        });
    }

    faqs.push({
        question: "How do I book a seat?",
        answer: `Pick a workshop and the number of seats, then pay online with UPI, cards or net banking. Your seats are held for ${BOOKING_HOLD_MINUTES} minutes while you pay, and your confirmation arrives by email.`,
    });

    faqs.push({
        question: "Can I cancel my booking?",
        answer: `${CANCELLATION_POLICY.earlyBirdSummary} ${CANCELLATION_POLICY.noCancellationSummary} ${CANCELLATION_POLICY.hostCancellationSummary}`,
        link: { href: "/cancellations", label: "Read the full cancellation policy" },
    });

    faqs.push({
        question: `How do I hear about new workshops in ${city.name}?`,
        answer: whatsappUrl
            ? "Join our WhatsApp community or follow @only_workshops on Instagram, where new dates are shared."
            : "Follow @only_workshops on Instagram, where new dates are shared.",
    });

    return faqs;
}

export default async function CityWorkshopsPage({ params }: Params) {
    const city = getSeoCityBySlug((await params).city);
    if (!city) notFound();

    const [{ upcoming, past }, settings] = await Promise.all([
        loadCityWorkshops(city.name),
        getCachedPlatformSettings(),
    ]);
    const todayIso = getIstTodayIso();
    const whatsappUrl = settings.whatsapp_community_url?.trim() || undefined;
    const allWorkshops = [...upcoming, ...past];
    const recentPast = past.slice(0, 12);
    const faqs = buildFaqs(city, allWorkshops, whatsappUrl);

    const categories = Object.entries(
        allWorkshops.reduce<Record<string, number>>((counts, workshop) => {
            if (workshop.category) counts[workshop.category] = (counts[workshop.category] || 0) + 1;
            return counts;
        }, {})
    ).sort((a, b) => b[1] - a[1]);

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
        {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faqs.map((faq) => ({
                "@type": "Question",
                name: faq.question,
                acceptedAnswer: { "@type": "Answer", text: faq.answer },
            })),
        },
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
                    <h1 className="heading-lg !text-4xl sm:!text-5xl mb-4">
                        Workshops &amp; Creative Events in {city.name}
                    </h1>
                    <div className="max-w-3xl space-y-3">
                        {city.intro.map((paragraph) => (
                            <p key={paragraph} className="text-body text-dark-muted">
                                {paragraph}
                            </p>
                        ))}
                    </div>
                    {categories.length > 0 && (
                        <ul className="mt-6 flex flex-wrap gap-2" aria-label="Workshop categories">
                            {categories.map(([category, count]) => (
                                <li key={category}>
                                    <Link
                                        href={`/explore?city=${encodeURIComponent(city.name)}&category=${encodeURIComponent(category)}`}
                                        className="inline-flex items-center rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-inter text-dark hover:border-terracotta hover:text-terracotta transition-colors"
                                    >
                                        {category}
                                        <span className="ml-2 text-dark-muted">{count}</span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </section>

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

            <section className="section-padding pb-20" aria-labelledby="faq-heading">
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
