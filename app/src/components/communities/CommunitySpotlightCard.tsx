"use client";

import Link from "next/link";
import { ArrowUpRight, MapPin, Users } from "lucide-react";
import type { Community } from "@/lib/communities";

function buildBackgroundStyle(coverImage: string | null) {
    if (!coverImage) {
        return {
            backgroundImage: "linear-gradient(135deg, rgba(196,111,74,0.96), rgba(39,27,20,0.92))",
        };
    }

    return {
        backgroundImage: `linear-gradient(rgba(26,20,16,0.22), rgba(26,20,16,0.62)), url(${coverImage})`,
    };
}

export default function CommunitySpotlightCard({
    community,
    compact = false,
}: {
    community: Community;
    compact?: boolean;
}) {
    return (
        <Link
            href={`/communities/${community.slug}`}
            className="group block overflow-hidden rounded-[1.6rem] border border-clay/20 bg-white shadow-soft transition-transform duration-300 hover:-translate-y-1"
        >
            <div
                className={`${compact ? "h-44" : "h-52"} border-b border-clay/10 bg-cover bg-center p-5 text-white`}
                style={buildBackgroundStyle(community.coverImage)}
            >
                <div className="flex items-start justify-between gap-3">
                    <span className="rounded-full border border-white/25 bg-white/12 px-3 py-1 text-[11px] font-inter font-bold uppercase tracking-[0.24em] text-white/90 backdrop-blur-sm">
                        {community.category}
                    </span>
                    <ArrowUpRight className="h-5 w-5 text-white/90 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </div>

                <div className="mt-8">
                    <h3 className="max-w-[18rem] font-playfair text-2xl font-bold leading-tight">
                        {community.title}
                    </h3>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs font-inter text-white/90">
                        <span className="rounded-full bg-white/12 px-3 py-1 backdrop-blur-sm">
                            {community.meetingFormat}
                        </span>
                        <span className="rounded-full bg-white/12 px-3 py-1 backdrop-blur-sm">
                            {community.city}
                        </span>
                    </div>
                </div>
            </div>

            <div className="space-y-4 p-5">
                <p
                    className={`font-inter text-sm leading-6 text-dark-secondary ${compact ? "min-h-[4.5rem]" : ""}`}
                >
                    {community.summary}
                </p>

                <div className="flex flex-wrap gap-2 text-xs font-inter font-semibold text-dark-muted">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-cream-100 px-3 py-1.5">
                        <MapPin className="h-3.5 w-3.5 text-terracotta" />
                        {community.city}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-cream-100 px-3 py-1.5">
                        <Users className="h-3.5 w-3.5 text-terracotta" />
                        {community.meetupFrequency}
                    </span>
                </div>
            </div>
        </Link>
    );
}
