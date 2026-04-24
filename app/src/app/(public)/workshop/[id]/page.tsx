import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { mockWorkshops, type Workshop } from "@/lib/data";
import { getAbsoluteUrl } from "@/lib/env";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase-server";
import { isMissingApprovalStatusColumnError } from "@/lib/workshop-approval-compat";
import { getPlatformSettings } from "@/lib/workshop-page-data";
import { mapWorkshopRowToWorkshop } from "@/lib/workshop-utils";
import WorkshopClient from "./WorkshopClient";

export const revalidate = 60;

const SIMILAR_WORKSHOP_LIMIT = 3;

function allowMockFallback() {
    return process.env.NODE_ENV !== "production";
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

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
    const workshop = await getWorkshop(params.id);
    if (!workshop) {
        return { title: "Workshop Not Found | Only Workshops" };
    }
    const canonicalUrl = getAbsoluteUrl(`/workshop/${workshop.id}`);
    const socialPreviewUrl = workshop.coverImage.startsWith("http")
        ? workshop.coverImage
        : getAbsoluteUrl(workshop.coverImage);
    return {
        title: `${workshop.title} | Only Workshops`,
        description: workshop.description.substring(0, 160),
        alternates: {
            canonical: canonicalUrl,
        },
        openGraph: {
            title: workshop.title,
            description: workshop.description.substring(0, 160),
            url: canonicalUrl,
            type: "website",
            images: [{ url: socialPreviewUrl }],
        },
        twitter: {
            card: "summary_large_image",
            title: workshop.title,
            description: workshop.description.substring(0, 160),
            images: [socialPreviewUrl],
        },
    };
}

async function getWorkshop(id: string) {
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
    if (!allowMockFallback()) {
        return null;
    }
    return mockWorkshops.find((workshop) => workshop.id === id) || null;
}

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

    if (!allowMockFallback()) {
        return [];
    }

    return rankSimilarWorkshops(mockWorkshops, workshop, todayIso);
}

export default async function WorkshopDetailPage({ params }: { params: { id: string } }) {
    const workshop = await getWorkshop(params.id);

    const todayIso = new Date().toISOString().slice(0, 10);
    if (!workshop) {
        notFound();
    }

    const similarWorkshops = await getSimilarWorkshops(workshop, todayIso);
    const platformSettings = await getPlatformSettings();
    const canonicalUrl = getAbsoluteUrl(`/workshop/${workshop.id}`);
    const exploreUrl = getAbsoluteUrl("/explore");
    const socialPreviewUrl = workshop.coverImage.startsWith("http")
        ? workshop.coverImage
        : getAbsoluteUrl(workshop.coverImage);

    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "Event",
        name: workshop.title,
        description: workshop.description.substring(0, 300),
        startDate: `${workshop.date}T${workshop.time || "10:00"}`,
        location: {
            "@type": "Place",
            name: workshop.location,
            address: {
                "@type": "PostalAddress",
                addressLocality: workshop.city,
            },
        },
        image: socialPreviewUrl,
        organizer: {
            "@type": "Organization",
            name: workshop.hostName,
        },
        offers: {
            "@type": "Offer",
            price: workshop.price,
            priceCurrency: "INR",
            availability:
                workshop.seatsRemaining > 0
                    ? "https://schema.org/InStock"
                    : "https://schema.org/SoldOut",
            url: canonicalUrl,
        },
        ...(workshop.rating > 0 && workshop.reviewCount > 0
            ? {
                  aggregateRating: {
                      "@type": "AggregateRating",
                      ratingValue: workshop.rating,
                      reviewCount: workshop.reviewCount,
                  },
              }
            : {}),
    };
    const breadcrumbJsonLd = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
            {
                "@type": "ListItem",
                position: 1,
                name: "Home",
                item: getAbsoluteUrl("/"),
            },
            {
                "@type": "ListItem",
                position: 2,
                name: "Explore",
                item: exploreUrl,
            },
            {
                "@type": "ListItem",
                position: 3,
                name: workshop.title,
                item: canonicalUrl,
            },
        ],
    };

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
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
