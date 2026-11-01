import Link from "next/link";
import * as Sentry from "@sentry/nextjs";
import { Compass, HeartHandshake, ShieldCheck } from "lucide-react";
import StaticPage from "@/components/StaticPage";
import { buildAboutStats, hostedSentence, whereSentence, type AboutStats } from "@/lib/about-stats";
import { BOOKING_HOLD_MINUTES } from "@/lib/booking-time";
import { CANCELLATION_POLICY } from "@/lib/cancellation-policy";
import { getAbsoluteUrl } from "@/lib/env";
import { serializeJsonLd } from "@/lib/json-ld";
import { cityPagePath, getSeoCityBySlug, SITE_NAME } from "@/lib/seo";
import { loadCityWorkshops } from "@/lib/workshop-page-data";
import { ABOUT_LINK_CLASS, HostedSection, WhereSection } from "./AboutCitySections";
import { ABOUT_DESCRIPTION, ABOUT_TITLE } from "./about-meta";

// The same window as the city and activity pages, which share this cached workshop list.
export const revalidate = 300;

const CITY = getSeoCityBySlug("pune");

/** Facts from the cached city list; null when the read fails, so the page keeps its own copy. */
async function loadAboutStats(): Promise<AboutStats | null> {
    if (!CITY) return null;
    try {
        const { upcoming, past, source } = await loadCityWorkshops(CITY.name);
        return source === "error" ? null : buildAboutStats(CITY, upcoming, past);
    } catch (error) {
        Sentry.captureException(error, { tags: { layer: "web", route: "about_page" } });
        return null;
    }
}

export default async function AboutPage() {
    const stats = await loadAboutStats();
    const cityName = CITY?.name ?? "Pune";
    const cityHref = CITY ? cityPagePath(CITY) : "/explore";
    const hosted = stats ? hostedSentence(stats, cityName) : "";
    const where = stats ? whereSentence(stats, cityName) : "";

    const pageUrl = getAbsoluteUrl("/about");
    const siteUrl = getAbsoluteUrl("/");
    // Points at the Organization and WebSite nodes the homepage defines (lib/seo.ts siteJsonLd).
    const aboutPageJsonLd = {
        "@context": "https://schema.org",
        "@type": "AboutPage",
        "@id": `${pageUrl}#webpage`,
        url: pageUrl,
        name: ABOUT_TITLE,
        description: ABOUT_DESCRIPTION,
        inLanguage: "en-IN",
        isPartOf: { "@id": `${siteUrl}#website` },
        about: { "@id": `${siteUrl}#organization`, "@type": "Organization", name: SITE_NAME },
    };

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: serializeJsonLd(aboutPageJsonLd) }}
            />
            <StaticPage
                title="About Only Workshops"
                description="Only Workshops helps people discover and book high-quality creative experiences in their city."
                icon={<Compass className="h-5 w-5" aria-hidden />}
            >
                <section>
                    <h2 className="heading-sm mb-2">Our Story</h2>
                    <p>
                        Only Workshops started to make weekends more meaningful through hands-on
                        creative experiences. We want people to feel like a child again, less sure
                        about everything and more open to explore.
                    </p>
                    <p className="mt-3">
                        In {cityName}, that means hands-on sessions where a local chef, maker or
                        guide teaches you a skill in a few hours.
                    </p>
                </section>
                {/* Ternaries, not `&&`: StaticPage boxes every child, and an empty string is one. */}
                {stats ? (
                    <HostedSection cityName={cityName} summary={hosted} topics={stats.topics} />
                ) : null}
                {where ? <WhereSection cityName={cityName} sentence={where} /> : null}
                <section>
                    <h2 className="heading-sm mb-2">How It Works</h2>
                    <ol className="list-decimal space-y-2 pl-5">
                        <li>
                            <strong className="text-dark">Discover.</strong> Browse{" "}
                            <Link href={cityHref} className={ABOUT_LINK_CLASS}>
                                hands-on workshops in {cityName}
                            </Link>{" "}
                            by date or activity. Every workshop page shows the venue, what you will
                            learn and how many seats are left.
                        </li>
                        <li>
                            <strong className="text-dark">Reserve.</strong> Pick the number of seats
                            and pay online with UPI, cards or net banking. Your seats are held for{" "}
                            {BOOKING_HOLD_MINUTES} minutes while you pay, and your confirmation
                            arrives by email.
                        </li>
                        <li>
                            <strong className="text-dark">Experience.</strong> Show up at the venue,
                            try the skill hands-on with your host guiding you, and take home
                            memories that last.
                        </li>
                    </ol>
                    <p className="mt-3">
                        {CANCELLATION_POLICY.hostCancellationSummary}{" "}
                        <Link href="/cancellations" className={ABOUT_LINK_CLASS}>
                            Read the cancellation policy
                        </Link>
                    </p>
                </section>
                <section>
                    <h2 className="heading-sm mb-2">What We Value</h2>
                    <p>
                        Every workshop should feel beginner-friendly, thoughtfully hosted, and worth
                        recommending to a friend.
                    </p>
                </section>
                <section>
                    <h2 className="heading-sm mb-2">How We Vet Hosts</h2>
                    <p>
                        Hosts are checked for teaching clarity and venue readiness before they are
                        promoted broadly on the platform.
                    </p>
                    <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-inter font-semibold text-emerald-800">
                        <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                        Quality checks are ongoing after launch.
                    </div>
                </section>
                <section>
                    <h2 className="heading-sm mb-2">Community First</h2>
                    <p>
                        We design for repeat discovery and long-term learning, not one-off bookings.
                        Hosts and attendees grow together through recurring formats and feedback
                        loops.
                    </p>
                    <div className="mt-3 inline-flex items-center gap-2 text-sm font-inter text-dark-secondary">
                        <HeartHandshake className="h-4 w-4 text-terracotta" aria-hidden />
                        Built for creators and curious learners.
                    </div>
                </section>
                <section>
                    <h2 className="heading-sm mb-2">For Hosts and Venues</h2>
                    <p>
                        Are you a creative professional in {cityName} with a skill to teach?{" "}
                        <Link href="/become-a-host" className={ABOUT_LINK_CLASS}>
                            Apply to host a workshop
                        </Link>{" "}
                        and tell us about your background, the topics you teach and your teaching
                        style. Our team reviews each application, and approved hosts set up paid
                        experiences for their community with our support.
                    </p>
                    <p className="mt-3">
                        Own a café, studio or other space?{" "}
                        <Link href="/list-your-space" className={ABOUT_LINK_CLASS}>
                            List your space for workshops
                        </Link>
                        : we handle the ticketing, payments, marketing and host coordination, and
                        you provide the space.
                    </p>
                    <p className="mt-3">
                        Run a creative club or meet-up? List it among the{" "}
                        <Link href="/communities" className={ABOUT_LINK_CLASS}>
                            creative communities on Only Workshops
                        </Link>
                        , where people can discover groups to join, meet regularly and stay
                        connected between workshops.
                    </p>
                </section>
            </StaticPage>
        </>
    );
}
