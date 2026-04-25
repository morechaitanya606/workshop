import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Compass, Info, Sparkles, Users } from "lucide-react";
import Footer from "@/components/Footer";
import CommunityListCard from "@/components/communities/CommunityListCard";
import CommunitySpotlightCard from "@/components/communities/CommunitySpotlightCard";
import { type Community } from "@/lib/communities";
import { loadPublicCommunities } from "@/lib/community-page-data";
import { getAbsoluteUrl } from "@/lib/env";

export const metadata: Metadata = {
    title: "Explore Communities | Only Workshops",
    description:
        "Discover creative communities, meet regularly, and stay connected between workshops.",
    alternates: {
        canonical: getAbsoluteUrl("/communities"),
    },
};

export const revalidate = 60;

function buildStats(communities: Community[]) {
    const categoryCount = new Set(communities.map((community) => community.category)).size;
    const cityCount = new Set(communities.map((community) => community.city)).size;

    return [
        { label: "Communities", value: String(communities.length) },
        { label: "Cities", value: String(cityCount) },
        { label: "Categories", value: String(categoryCount) },
    ];
}

export default async function CommunitiesPage() {
    const { data: communities, source } = await loadPublicCommunities();
    const stats = buildStats(communities);

    return (
        <div className="min-h-full bg-cream text-dark">
            <section className="section-padding pb-10 pt-28">
                <div className="mx-auto max-w-6xl">
                    {source === "mock" && (
                        <div className="mb-6 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-inter text-amber-900">
                            <Info className="h-4 w-4" />
                            Showing sample communities in development while live community data is
                            unavailable.
                        </div>
                    )}
                    {source === "error" && (
                        <div className="mb-6 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-inter text-red-700">
                            <Info className="h-4 w-4" />
                            Live communities are temporarily unavailable.
                        </div>
                    )}

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

                            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
                                {stats.map((stat, index) => (
                                    <div
                                        key={stat.label}
                                        className={`rounded-2xl border border-clay/15 bg-white/80 px-5 py-4 ${
                                            index === stats.length - 1
                                                ? "col-span-2 sm:col-span-1"
                                                : ""
                                        }`}
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
                                    Browse creative circles people can join for regular meetups,
                                    host updates, and shared practice across cities.
                                </p>
                            </div>

                            {communities.length === 0 ? (
                                <div className="rounded-[1.75rem] border border-dashed border-clay/30 bg-cream-50 px-5 py-10 text-center sm:px-6">
                                    <h3 className="font-playfair text-2xl font-bold text-dark">
                                        No communities are live yet
                                    </h3>
                                    <p className="mx-auto mt-3 max-w-2xl text-sm font-inter leading-6 text-dark-muted">
                                        Public community pages will appear here once they have been
                                        created and published.
                                    </p>
                                </div>
                            ) : (
                                <>
                                    <div className="flex flex-col gap-3 md:hidden">
                                        {communities.map((community) => (
                                            <CommunityListCard
                                                key={community.slug}
                                                community={community}
                                            />
                                        ))}
                                    </div>

                                    <div className="hidden gap-5 md:grid md:grid-cols-2 xl:grid-cols-3">
                                        {communities.map((community) => (
                                            <CommunitySpotlightCard
                                                key={community.slug}
                                                community={community}
                                            />
                                        ))}
                                    </div>
                                </>
                            )}

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
        </div>
    );
}
