import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import type { Workshop } from "@/lib/data";
import { getAbsoluteUrl, getAppUrl } from "@/lib/env";
import { getIstTodayIso } from "@/lib/ist-date";
import { serializeJsonLd } from "@/lib/json-ld";
import {
    breadcrumbJsonLd,
    cityPagePath,
    getSeoCityByName,
    trimForDescription,
    workshopEventJsonLd,
    workshopSeoTitle,
} from "@/lib/seo";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase-server";
import { isMissingApprovalStatusColumnError } from "@/lib/workshop-approval-compat";
import { getPlatformSettings } from "@/lib/workshop-page-data";
import { mapWorkshopRowToWorkshop } from "@/lib/workshop-utils";
import WorkshopClient from "./WorkshopClient";

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
        const { data, error } = await serviceClient
            .from("workshops")
            .select("id")
            .eq("approval_status", "approved")
            .order("date", { ascending: true })
            .limit(PRERENDER_WORKSHOP_LIMIT);

        if (error || !data) return [];
        return data.map((row) => ({ id: String(row.id) }));
    } catch {
        // A build must not fail because the database is briefly unreachable.
        return [];
    }
}

function rankSimilarWorkshops(workshops: Workshop[], currentWorkshop: Workshop, todayIso: string) {
    return workshops
        .filter(
            (candidate) =>
                candidate.id !== currentWorkshop.id &&
                candidate.seatsRemaining > 0 &&
                candidate.date >= todayIso
        )
        .map((candidate) => ({
            candidate,
            score:
                Number(candidate.category === currentWorkshop.category) * 2 +
                Number(candidate.city === currentWorkshop.city),
        }))
        .filter((item) => item.score > 0)
        .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return a.candidate.date.localeCompare(b.candidate.date);
        })
        .map((item) => item.candidate)
        .slice(0, SIMILAR_WORKSHOP_LIMIT);
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
    const socialPreviewUrl = workshop.coverImage.startsWith("http")
        ? workshop.coverImage
        : getAbsoluteUrl(workshop.coverImage);
    const description = trimForDescription(workshop.description);
    return {
        title: workshopSeoTitle(workshop),
        description,
        alternates: {
            canonical: canonicalUrl,
        },
        openGraph: {
            title: workshop.title,
            description,
            url: canonicalUrl,
            type: "website",
            images: [{ url: socialPreviewUrl }],
        },
        twitter: {
            card: "summary_large_image",
            title: workshop.title,
            description,
            images: [socialPreviewUrl],
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

async function getSimilarWorkshops(workshop: Workshop, todayIso: string) {
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
                return rankSimilarWorkshops(
                    (data || []).map((row) => mapWorkshopRowToWorkshop(row)),
                    workshop,
                    todayIso
                );
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

    const [similarWorkshops, platformSettings] = await Promise.all([
        getSimilarWorkshops(workshop, todayIso),
        getPlatformSettings(),
    ]);
    const canonicalUrl = getAbsoluteUrl(`/workshop/${workshop.id}`);
    const socialPreviewUrl = workshop.coverImage.startsWith("http")
        ? workshop.coverImage
        : getAbsoluteUrl(workshop.coverImage);

    const jsonLd = workshopEventJsonLd(workshop, {
        canonicalUrl,
        imageUrl: socialPreviewUrl,
        siteUrl: getAppUrl(),
    });
    // Mirrors the visible breadcrumb in WorkshopClient: Home > city > category > workshop.
    const seoCity = getSeoCityByName(workshop.city);
    const breadcrumb = breadcrumbJsonLd([
        { name: "Home", url: getAbsoluteUrl("/") },
        ...(seoCity ? [{ name: seoCity.name, url: getAbsoluteUrl(cityPagePath(seoCity)) }] : []),
        ...(workshop.category
            ? [
                  {
                      name: workshop.category,
                      url: getAbsoluteUrl(
                          `/explore?category=${encodeURIComponent(workshop.category)}`
                      ),
                  },
              ]
            : []),
        { name: workshop.title, url: canonicalUrl },
    ]);

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
            />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumb) }}
            />
            <WorkshopClient
                workshop={workshop}
                similarWorkshops={similarWorkshops}
                platformSettings={platformSettings}
                todayIso={todayIso}
            />
        </>
    );
}
