"use client";

import Link from "next/link";
import { MapPin, Users, Calendar, ArrowUpRight } from "lucide-react";
import type { Community } from "@/lib/communities";

function getTimeBadge(createdAt: string): { label: string; variant: "today" | "soon" | "default" } {
    const now = new Date();
    const created = new Date(createdAt);
    const diffMs = now.getTime() - created.getTime();
    const diffDays = Math.floor(Math.abs(diffMs) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
        return { label: "NEW TODAY", variant: "today" };
    }

    if (diffDays <= 7) {
        return { label: `${diffDays}D AGO`, variant: "soon" };
    }

    return { label: `${diffDays}D AGO`, variant: "default" };
}

const BADGE_STYLES: Record<string, string> = {
    today: "bg-terracotta text-white",
    soon: "bg-terracotta/10 text-terracotta",
    default: "bg-cream-100 text-dark-muted",
};

function buildThumbnailStyle(coverImage: string | null) {
    if (!coverImage) return undefined;

    return {
        backgroundImage: `linear-gradient(rgba(26,20,16,0.08), rgba(26,20,16,0.28)), url(${coverImage})`,
    };
}

export default function CommunityListCard({ community }: { community: Community }) {
    const badge = getTimeBadge(community.createdAt);

    return (
        <Link
            href={`/communities/${community.slug}`}
            className="group flex items-start gap-4 rounded-2xl border border-clay/20 bg-white px-4 py-4 shadow-soft transition-all duration-300 hover:border-terracotta/30 hover:shadow-md sm:gap-5 sm:px-5 sm:py-5"
        >
            {/* Thumbnail */}
            <div className="relative h-20 w-20 flex-none overflow-hidden rounded-xl bg-gradient-to-br from-terracotta/80 to-terracotta-700/90 sm:h-24 sm:w-24">
                {community.coverImage ? (
                    <div
                        aria-hidden="true"
                        className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-110"
                        style={buildThumbnailStyle(community.coverImage)}
                    />
                ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-terracotta/80 to-terracotta-700/90">
                        <Users className="h-7 w-7 text-white/80" />
                    </div>
                )}
            </div>

            {/* Content area */}
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                {/* Title row */}
                <div className="flex items-start justify-between gap-3">
                    <h3 className="font-playfair text-base font-bold leading-snug text-dark sm:text-lg">
                        {community.title}
                    </h3>
                    <span
                        className={`flex-none rounded-full px-2.5 py-1 text-[10px] font-inter font-bold uppercase tracking-wider ${BADGE_STYLES[badge.variant]}`}
                    >
                        {badge.label}
                    </span>
                </div>

                {/* Meta info row */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-inter text-dark-muted sm:text-sm">
                    <span className="inline-flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-terracotta" />
                        {community.city}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-terracotta" />
                        {community.meetupFrequency}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 text-terracotta" />
                        {community.meetingFormat}
                    </span>
                </div>

                {/* Summary - only shown on larger screens */}
                <p className="mt-0.5 line-clamp-1 text-xs font-inter leading-5 text-dark-secondary sm:line-clamp-2 sm:text-sm">
                    {community.summary}
                </p>

                {/* Category pill */}
                <div className="mt-1 flex items-center gap-2">
                    <span className="rounded-full bg-cream-100 px-2.5 py-0.5 text-[10px] font-inter font-semibold uppercase tracking-wider text-dark-muted sm:text-[11px]">
                        {community.category}
                    </span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-terracotta opacity-0 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100" />
                </div>
            </div>
        </Link>
    );
}
