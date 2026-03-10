import Link from "next/link";
import type { Metadata } from "next";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase-server";
import { ensureWorkshopSeededFromMock, mapWorkshopRowToWorkshop } from "@/lib/workshop-utils";
import { mockWorkshops, type Workshop } from "@/lib/data";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import MobileNav from "@/components/MobileNav";
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
        return { title: "Workshop Not Found | Only Workshop" };
    }
    return {
        title: `${workshop.title} | Only Workshop`,
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
        return (
            <main className="min-h-screen bg-cream">
                <Navbar />
                <div className="pt-32 pb-20 section-padding text-center">
                    <h1 className="heading-lg mb-3">Workshop not found</h1>
                    <p className="text-body text-dark-muted mb-8">
                        This workshop may have been removed or the link is incorrect.
                    </p>
                    <Link href="/explore" className="btn-primary">
                        Back to Explore
                    </Link>
                </div>
                <Footer />
                <MobileNav />
            </main>
        );
    }

    const similarWorkshops = await getSimilarWorkshops(workshop);
    return <WorkshopClient workshop={workshop} similarWorkshops={similarWorkshops} />;
}
