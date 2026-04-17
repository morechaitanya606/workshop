import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase-server";
import { ensureWorkshopSeededFromMock, mapWorkshopRowToWorkshop } from "@/lib/workshop-utils";
import { getPlatformSettings } from "@/lib/workshop-page-data";
import { mockWorkshops, type Workshop } from "@/lib/data";
import WorkshopClient from "./WorkshopClient";

export const revalidate = 60;

const SIMILAR_WORKSHOP_LIMIT = 3;

function rankSimilarWorkshops(workshops: Workshop[], currentWorkshop: Workshop) {
    const todayIso = new Date().toISOString().slice(0, 10);

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
    return {
        title: `${workshop.title} | Only Workshops`,
        description: workshop.description.substring(0, 160),
        openGraph: {
            title: workshop.title,
            description: workshop.description.substring(0, 160),
            images: [{ url: workshop.coverImage }],
        },
    };
}

async function getWorkshop(id: string) {
    if (isSupabaseServiceConfigured) {
        try {
            const serviceClient = createSupabaseServiceClient();
            await ensureWorkshopSeededFromMock(serviceClient, id);
            const { data, error } = await serviceClient
                .from("workshops")
                .select("*")
                .eq("id", id)
                .maybeSingle();

            if (!error && data) {
                return mapWorkshopRowToWorkshop(data);
            }
        } catch {
            // fallback
        }
    }
    return mockWorkshops.find((w) => w.id === id) || null;
}

async function getSimilarWorkshops(workshop: Workshop) {
    if (isSupabaseServiceConfigured) {
        try {
            const serviceClient = createSupabaseServiceClient();
            const todayIso = new Date().toISOString().slice(0, 10);
            const { data, error } = await serviceClient
                .from("workshops")
                .select("*")
                .neq("id", workshop.id)
                .gte("date", todayIso)
                .gte("seats_remaining", 1)
                .order("date", { ascending: true })
                .limit(30);

            if (!error) {
                return rankSimilarWorkshops(
                    (data || []).map((row) => mapWorkshopRowToWorkshop(row)),
                    workshop
                );
            }
        } catch {
            // fallback
        }
    }

    return rankSimilarWorkshops(mockWorkshops, workshop);
}

export default async function WorkshopDetailPage({ params }: { params: { id: string } }) {
    const workshop = await getWorkshop(params.id);

    if (!workshop) {
        notFound();
    }

    const similarWorkshops = await getSimilarWorkshops(workshop);
    const platformSettings = await getPlatformSettings();

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
        image: workshop.coverImage,
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
            url: `${process.env.NEXT_PUBLIC_APP_URL || "https://onlyworkshops.com"}/workshop/${workshop.id}`,
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

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
            <WorkshopClient
                workshop={workshop}
                similarWorkshops={similarWorkshops}
                platformSettings={platformSettings}
            />
        </>
    );
}
