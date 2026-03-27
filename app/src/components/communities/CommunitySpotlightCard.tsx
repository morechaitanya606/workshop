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
            className="group block overflow-hidden rounded-[1.35rem] border border-clay/20 bg-white shadow-soft transition-transform duration-300 hover:-translate-y-1 sm:rounded-[1.6rem]"
        >
            <div
                className={`${compact ? "h-32 p-3.5 sm:h-44 sm:p-5" : "h-40 p-4 sm:h-52 sm:p-5"} border-b border-clay/10 bg-cover bg-center text-white`}
                style={buildBackgroundStyle(community.coverImage)}
            >
                <div className="flex items-start justify-between gap-3">
                    <span className="rounded-full border border-white/25 bg-white/12 px-2.5 py-1 text-[10px] font-inter font-bold uppercase tracking-[0.18em] text-white/90 backdrop-blur-sm sm:px-3 sm:text-[11px] sm:tracking-[0.24em]">
                        {community.category}
                    </span>
                    <ArrowUpRight className="h-4 w-4 text-white/90 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 sm:h-5 sm:w-5" />
                </div>

                <div className="mt-4 sm:mt-8">
                    <h3 className="max-w-[18rem] font-playfair text-lg font-bold leading-tight sm:text-2xl">
                        {community.title}
                    </h3>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-inter text-white/90 sm:mt-3 sm:gap-2 sm:text-xs">
                        <span className="rounded-full bg-white/12 px-2.5 py-1 backdrop-blur-sm sm:px-3">
                            {community.meetingFormat}
                        </span>
                        <span className="rounded-full bg-white/12 px-2.5 py-1 backdrop-blur-sm sm:px-3">
                            {community.city}
                        </span>
                    </div>
                </div>
            </div>

            <div className="space-y-3 p-3.5 sm:space-y-4 sm:p-5">
                <p
                    className={`font-inter text-xs leading-5 text-dark-secondary sm:text-sm sm:leading-6 ${
                        compact ? "line-clamp-2 sm:min-h-[4.5rem] sm:line-clamp-3" : "line-clamp-3"
                    }`}
                >
                    {community.summary}
                </p>

                <div className="flex flex-wrap gap-1.5 text-[11px] font-inter font-semibold text-dark-muted sm:gap-2 sm:text-xs">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-cream-100 px-2.5 py-1 sm:px-3 sm:py-1.5">
                        <MapPin className="h-3 w-3 text-terracotta sm:h-3.5 sm:w-3.5" />
                        {community.city}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-cream-100 px-2.5 py-1 sm:px-3 sm:py-1.5">
                        <Users className="h-3 w-3 text-terracotta sm:h-3.5 sm:w-3.5" />
                        {community.meetupFrequency}
                    </span>
                </div>
            </div>
        </Link>
    );
}
