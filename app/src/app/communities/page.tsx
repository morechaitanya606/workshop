import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Compass, Sparkles, Users } from "lucide-react";
import Footer from "@/components/Footer";
import MobileNav from "@/components/MobileNav";
import Navbar from "@/components/Navbar";
import CommunityListCard from "@/components/communities/CommunityListCard";
import CommunitySpotlightCard from "@/components/communities/CommunitySpotlightCard";
import { listLocalCommunities } from "@/lib/community-local-store";
import {
    listCommunities,
    mergeCommunities,
    mockCommunities,
    type Community,
} from "@/lib/communities";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase-server";

export const metadata: Metadata = {
    title: "Explore Communities | Only Workshops",
    description:
        "Discover creative communities, meet regularly, and stay connected between workshops.",
};

export const revalidate = 60;

async function loadPublicCommunities() {
    const localCommunities = await listLocalCommunities(24);

    if (!isSupabaseServiceConfigured) {
        return mergeCommunities(localCommunities, mockCommunities);
    }

    try {
        const liveCommunities = await listCommunities(createSupabaseServiceClient(), 24);
        return mergeCommunities(
            mergeCommunities(liveCommunities, localCommunities),
            mockCommunities
        );
    } catch {
        return mergeCommunities(localCommunities, mockCommunities);
    }
}

function buildStats(communities: Community[]) {
    const categoryCount = new Set(communities.map((community) => community.category)).size;
    const cityCount = new Set(communities.map((community) => community.city)).size;

    return [
        { label: "Communities", value: String(communities.length) },
        { label: "Categories", value: String(categoryCount) },
        { label: "Cities", value: String(cityCount) },
    ];
}

export default async function CommunitiesPage() {
    const communities = await loadPublicCommunities();
    const stats = buildStats(communities);

    return (
        <main className="min-h-screen bg-cream text-dark">
            <Navbar />

            <section className="section-padding pb-10 pt-28">
                <div className="mx-auto max-w-6xl">
                    {/* Hero header */}
                    <div className="overflow-hidden rounded-[2.2rem] border border-clay/20 bg-white shadow-soft">
                        <div className="relative bg-[radial-gradient(circle_at_top_left,_rgba(206,121,83,0.20),_transparent_42%),linear-gradient(135deg,#fffaf5_0%,#fff3ee_100%)] px-6 py-10 sm:px-10 sm:py-12">
                            <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-clay/20 bg-white/80 px-3 py-1 text-[11px] font-inter font-bold uppercase tracking-[0.28em] text-terracotta">
                                <Compass className="h-3.5 w-3.5" />
                                Explore Communities
                            </p>
                            <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
                                <div className="max-w-3xl">
                                    <h1 className="font-playfair text-4xl font-bold sm:text-6xl">
                                        Find your people, not just your next workshop
                                    </h1>
                                    <p className="mt-4 max-w-2xl text-base font-inter leading-7 text-dark-secondary sm:text-lg">
                                        Join communities built around storytelling, photography,
                                        pottery, wellness, film, and slow creative practice. Meet
                                        regularly, build friendships, and stay inspired between
                                        workshop bookings.
                                    </p>
                                </div>

                                <div className="flex flex-wrap gap-3">
                                    <Link
                                        href="/communities/new"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="btn-primary"
                                    >
                                        <Sparkles className="h-4 w-4" />
                                        List Your Community
                                    </Link>
                                    <Link href="/explore" className="btn-secondary">
                                        Explore Workshops
                                    </Link>
                                </div>
                            </div>

                            <div className="mt-8 grid gap-3 sm:grid-cols-3">
                                {stats.map((stat) => (
                                    <div
                                        key={stat.label}
                                        className="rounded-2xl border border-clay/15 bg-white/80 px-5 py-4"
                                    >
                                        <p className="font-playfair text-3xl font-bold text-dark">
                                            {stat.value}
                                        </p>
                                        <p className="mt-1 text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                            {stat.label}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Community list */}
                        <div className="px-6 py-8 sm:px-10 sm:py-10">
                            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                                <div>
                                    <p className="text-xs font-inter font-bold uppercase tracking-[0.24em] text-dark-muted">
                                        Featured Circles
                                    </p>
                                    <h2 className="mt-2 font-playfair text-3xl font-bold text-dark">
                                        Communities to explore right now
                                    </h2>
                                </div>
                                <p className="max-w-xl text-sm font-inter leading-6 text-dark-muted">
                                    These sample and live community pages show how members can find
                                    regular meetups, hosts, and creative circles across cities.
                                </p>
                            </div>

                            {/* Mobile: List layout */}
                            <div className="flex flex-col gap-3 md:hidden">
                                {communities.map((community) => (
                                    <CommunityListCard key={community.slug} community={community} />
                                ))}
                            </div>

                            {/* Desktop: Grid layout */}
                            <div className="hidden gap-5 md:grid md:grid-cols-2 xl:grid-cols-3">
                                {communities.map((community) => (
                                    <CommunitySpotlightCard
                                        key={community.slug}
                                        community={community}
                                    />
                                ))}
                            </div>

                            {/* CTA Banner */}
                            <div className="mt-8 rounded-[1.75rem] border border-clay/20 bg-cream-50 px-5 py-6 sm:px-6">
                                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                                    <div className="max-w-2xl">
                                        <p className="text-xs font-inter font-bold uppercase tracking-[0.24em] text-terracotta">
                                            Build Your Own
                                        </p>
                                        <h3 className="mt-2 font-playfair text-2xl font-bold text-dark">
                                            Want a page like this for your community?
                                        </h3>
                                        <p className="mt-2 text-sm font-inter leading-6 text-dark-secondary">
                                            Open the form, fill in your host details, and generate a
                                            public page people can discover and join.
                                        </p>
                                    </div>

                                    <Link
                                        href="/communities/new"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="btn-primary"
                                    >
                                        <Users className="h-4 w-4" />
                                        Create Community Page
                                        <ArrowRight className="h-4 w-4" />
                                    </Link>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <Footer />
            <MobileNav />
        </main>
    );
}
