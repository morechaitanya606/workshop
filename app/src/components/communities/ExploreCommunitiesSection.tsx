"use client";

import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import type { Community } from "@/lib/communities";
import CommunitySpotlightCard from "./CommunitySpotlightCard";

export default function ExploreCommunitiesSection({ communities }: { communities: Community[] }) {
    const featuredCommunities = communities.slice(0, 3);

    if (featuredCommunities.length === 0) {
        return null;
    }

    return (
        <section className="section-padding pb-14 pt-2 sm:pb-16">
            <div className="overflow-hidden rounded-[2rem] border border-[#f1c8c1] bg-[#fff4f1] px-5 py-7 shadow-soft sm:px-8 sm:py-9">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-2xl">
                        <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#efc2ba] bg-white/75 px-3 py-1 text-[11px] font-inter font-bold uppercase tracking-[0.26em] text-terracotta">
                            <Sparkles className="h-3.5 w-3.5" />
                            Communities
                        </p>
                        <h2 className="font-playfair text-3xl font-bold text-dark sm:text-4xl">
                            Keep the creative energy going between workshops
                        </h2>
                        <p className="mt-3 max-w-xl text-sm font-inter leading-6 text-dark-secondary sm:text-base">
                            Discover circles for storytellers, photographers, potters, and people
                            building creative habits together. Meet regularly, make friends, and
                            find your people.
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <Link href="/communities" className="btn-primary">
                            Explore Communities
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                        <Link
                            href="/communities/new"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-secondary"
                        >
                            List Your Community
                        </Link>
                    </div>
                </div>

                <div className="mt-7 grid gap-4 lg:grid-cols-3">
                    {featuredCommunities.map((community) => (
                        <CommunitySpotlightCard
                            key={community.slug}
                            community={community}
                            compact
                        />
                    ))}
                </div>
            </div>
        </section>
    );
}
