import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import type { Workshop } from "@/lib/data";
import { getAbsoluteUrl, getAppUrl } from "@/lib/env";
import { getCachedFaqRows, type PublicFaqRow } from "@/lib/faqs";
import { getIstTodayIso } from "@/lib/ist-date";
import { serializeJsonLd } from "@/lib/json-ld";
import {
    breadcrumbJsonLd,
    cityPagePath,
    getSeoCityByName,
    SITE_NAME,
    workshopEventJsonLd,
    workshopImageUrls,
    workshopOgTitle,
    workshopSeoDescription,
    workshopSeoTitle,
} from "@/lib/seo";
import { isBookingClosedNow } from "@/lib/booking-time";
import {
    primaryTopicFor,
    topicPagePath,
    topicsForWorkshop,
    workshopMatchesTopic,
    type SeoTopic,
} from "@/lib/seo-topics";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase-server";
import { isMissingApprovalStatusColumnError } from "@/lib/workshop-approval-compat";
import { getPlatformSettings } from "@/lib/workshop-page-data";
import { mapWorkshopRowToWorkshop } from "@/lib/workshop-utils";
import WorkshopClient, { type NextSession, type TopicLink } from "./WorkshopClient";

export const revalidate = 60;

const SIMILAR_WORKSHOP_LIMIT = 3;
const PRERENDER_WORKSHOP_LIMIT = 100;

/**
 * Without this, Next treats the whole `[id]` segment as fully dynamic: every request
 * server-renders from scratch and the response carries `Cache-Control: no-store`, so neither
 * the CDN nor the ISR cache ever holds it. Measured before/after on the production build:
 * ~1.9s per request versus ~30ms.
 *
 * Params not listed here still render on demand (dynamicParams defaults to true) and are then
 * cached for `revalidate` seconds, so this is a warm-start list rather than an allowlist.
 */
export async function generateStaticParams() {
    if (!isSupabaseServiceConfigured) return [];

    try {
        const serviceClient = createSupabaseServiceClient({ requestTimeoutMs: 10_000 });
        // Latest dates first, so the upcoming sessions (the pages people book from) are always
        // inside the limit; the oldest past sessions are the ones left to render on demand.
        const { data, error } = await serviceClient
            .from("workshops")
            .select("id")
            .eq("approval_status", "approved")
            .order("date", { ascending: false })
            .limit(PRERENDER_WORKSHOP_LIMIT);

        if (error || !data) return [];
        return data.map((row) => ({ id: String(row.id) }));
    } catch {
        // A build must not fail because the database is briefly unreachable.
        return [];
    }
}

function isSameTemplate(a: Workshop, b: Workshop) {
    return Boolean(a.templateId) && a.templateId === b.templateId;
}

/** "Babka & Foccacia Workshop " and "babka & foccacia workshop" are the same workshop. */
function normalizedTitle(title: string) {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

/**
 * Same template first, then a shared activity, then the same category; the rest follow by date
 * so the section still fills up. City is not scored: every workshop is in Pune, so it ranked
 * nothing and "similar" used to mean "the next three dates".
 */
function rankSimilarWorkshops(workshops: Workshop[], currentWorkshop: Workshop, todayIso: string) {
    const currentTopics = new Set(topicsForWorkshop(currentWorkshop).map((topic) => topic.slug));
    return workshops
        .filter(
            (candidate) =>
                candidate.id !== currentWorkshop.id &&
                candidate.seatsRemaining > 0 &&
                candidate.date >= todayIso
        )
        .map((candidate) => {
            // Counted as well as scored: sourdough + baking beats the cooking hub alone.
            const sharedTopics = topicsForWorkshop(candidate).filter((topic) =>
                currentTopics.has(topic.slug)
            ).length;
            return {
                candidate,
                sharedTopics,
                score:
                    Number(isSameTemplate(candidate, currentWorkshop)) * 4 +
                    Number(sharedTopics > 0) * 3 +
                    Number(candidate.category === currentWorkshop.category),
            };
        })
        .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            if (b.sharedTopics !== a.sharedTopics) return b.sharedTopics - a.sharedTopics;
            return a.candidate.date.localeCompare(b.candidate.date);
        })
        .map((item) => item.candidate)
        .slice(0, SIMILAR_WORKSHOP_LIMIT);
}

/**
 * Where a past session's page sends people next: another date of the same workshop (same
 * template, else the same title), else the soonest upcoming workshop of its activity. The rows
 * are already sorted by date.
 */
function findNextSession(
    upcoming: Workshop[],
    currentWorkshop: Workshop,
    topic: SeoTopic | null
): NextSession | null {
    const title = normalizedTitle(currentWorkshop.title);
    // "Upcoming" is by date only: a session later today may already be past its booking cutoff.
    const now = new Date();
    const bookable = upcoming.filter(
        (candidate) => !isBookingClosedNow(candidate.date, candidate.time, now)
    );
    const sameWorkshop =
        bookable.find((candidate) => isSameTemplate(candidate, currentWorkshop)) ??
        bookable.find((candidate) => normalizedTitle(candidate.title) === title);
    const next =
        sameWorkshop ??
        (topic ? bookable.find((candidate) => workshopMatchesTopic(candidate, topic)) : undefined);
    if (!next) return null;
    return {
        id: next.id,
        title: next.title,
        date: next.date,
        time: next.time,
        sameWorkshop: Boolean(sameWorkshop),
    };
}

export async function generateMetadata({
    params,
}: {
    params: Promise<{ id: string }>;
}): Promise<Metadata> {
    const { id } = await params;
    const workshop = await getWorkshop(id);
    if (!workshop) {
        return { title: "Workshop Not Found | Only Workshops" };
    }
    const canonicalUrl = getAbsoluteUrl(`/workshop/${workshop.id}`);
    // getAbsoluteUrl leaves http(s) URLs as they are; an unsupported cover is cleaned to "".
    const socialPreviewUrl = getAbsoluteUrl(workshop.coverImage || "/images/og-default.jpg");
    // What, where and when (date, venue, price) instead of the first lines of host copy.
    const description = workshopSeoDescription(
        workshop,
        getIstTodayIso(),
        primaryTopicFor(workshop)
    );
    // "{title} in {area, }Pune": the <title> keeps the site name, social cards do not need it.
    const socialTitle = workshopOgTitle(workshop);
    const socialImage = { url: socialPreviewUrl, alt: socialTitle };
    return {
        title: workshopSeoTitle(workshop),
        description,
        alternates: {
            canonical: canonicalUrl,
        },
        openGraph: {
            title: socialTitle,
            description,
            url: canonicalUrl,
            siteName: SITE_NAME,
            locale: "en_IN",
            type: "website",
            images: [socialImage],
        },
        twitter: {
            card: "summary_large_image",
            title: socialTitle,
            description,
            images: [socialImage],
        },
    };
}

const getWorkshop = cache(async (id: string) => {
    if (isSupabaseServiceConfigured) {
        try {
            const serviceClient = createSupabaseServiceClient();
            let { data, error } = await serviceClient
                .from("workshops")
                .select("*")
                .eq("id", id)
                .eq("approval_status", "approved")
                .maybeSingle();

            if (error && isMissingApprovalStatusColumnError(error)) {
                ({ data, error } = await serviceClient
                    .from("workshops")
                    .select("*")
                    .eq("id", id)
                    .maybeSingle());
            }

            if (!error && data) {
                return mapWorkshopRowToWorkshop(data);
            }
        } catch {
            // fallback
        }
    }
    return null;
});

/** Up to 30 bookable upcoming workshops by date: the pool for "similar" and "next date". */
async function getUpcomingWorkshops(workshop: Workshop, todayIso: string): Promise<Workshop[]> {
    if (isSupabaseServiceConfigured) {
        try {
            const serviceClient = createSupabaseServiceClient();
            let { data, error } = await serviceClient
                .from("workshops")
                .select("*")
                .neq("id", workshop.id)
                .eq("approval_status", "approved")
                .gte("date", todayIso)
                .gte("seats_remaining", 1)
                .order("date", { ascending: true })
                .limit(30);

            if (error && isMissingApprovalStatusColumnError(error)) {
                ({ data, error } = await serviceClient
                    .from("workshops")
                    .select("*")
                    .neq("id", workshop.id)
                    .gte("date", todayIso)
                    .gte("seats_remaining", 1)
                    .order("date", { ascending: true })
                    .limit(30));
            }

            if (!error) {
                return (data || []).map((row) => mapWorkshopRowToWorkshop(row));
            }
        } catch {
            // fallback
        }
    }

    return [];
}

export default async function WorkshopDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const workshop = await getWorkshop(id);

    const todayIso = getIstTodayIso();
    if (!workshop) {
        notFound();
    }

    const [upcomingWorkshops, platformSettings, faqs] = await Promise.all([
        getUpcomingWorkshops(workshop, todayIso),
        getPlatformSettings(),
        // Server-rendered so the answers are in the HTML; WorkshopFAQ fetches only without them.
        getCachedFaqRows().catch((): PublicFaqRow[] => []),
    ]);
    const canonicalUrl = getAbsoluteUrl(`/workshop/${workshop.id}`);
    const seoCity = getSeoCityByName(workshop.city);
    const topic = primaryTopicFor(workshop);
    // Plain data: a SeoTopic holds a RegExp, which cannot be passed to a client component.
    const topicLink: TopicLink | null =
        seoCity && topic ? { name: topic.name, href: topicPagePath(seoCity, topic) } : null;
    const similarWorkshops = rankSimilarWorkshops(upcomingWorkshops, workshop, todayIso);
    const nextSession = findNextSession(upcomingWorkshops, workshop, topic);

    // Event data only while the workshop is still ahead: Google ignores ended events, and the
    // markup ("scheduled", "in stock") would contradict the page's own "Past Event" label.
    const jsonLd =
        workshop.date >= todayIso
            ? workshopEventJsonLd(workshop, {
                  canonicalUrl,
                  imageUrls: workshopImageUrls(workshop, getAbsoluteUrl),
                  siteUrl: getAppUrl(),
              })
            : null;
    // Mirrors the visible breadcrumb in WorkshopClient: Home > city > activity > workshop. A
    // workshop that fits no activity page skips that level rather than linking /explore, which
    // canonicalises away.
    const breadcrumb = breadcrumbJsonLd([
        { name: "Home", url: getAbsoluteUrl("/") },
        ...(seoCity ? [{ name: seoCity.name, url: getAbsoluteUrl(cityPagePath(seoCity)) }] : []),
        ...(topicLink ? [{ name: topicLink.name, url: getAbsoluteUrl(topicLink.href) }] : []),
        { name: workshop.title, url: canonicalUrl },
    ]);

    return (
        <>
            {jsonLd && (
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
                />
            )}
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumb) }}
            />
            <WorkshopClient
                workshop={workshop}
                similarWorkshops={similarWorkshops}
                platformSettings={platformSettings}
                todayIso={todayIso}
                topicLink={topicLink}
                nextSession={nextSession}
                initialFaqs={faqs}
            />
        </>
    );
}
