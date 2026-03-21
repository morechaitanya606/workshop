"use client";

import React, { useEffect, useMemo, useState, type MouseEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Calendar, MapPin, Star, Heart, Clock, Share2, Users } from "lucide-react";
import { formatCurrency, formatDate, formatTime, truncateText } from "@/lib/utils";
import { getWorkshopDateTime } from "@/lib/booking-time";
import { addFavorite, getFavorites, removeFavorite } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import type { Workshop } from "@/lib/data";
import { fadeInUp, revealViewport, standardTransition } from "@/lib/motion-presets";

interface WorkshopCardProps {
    workshop: Workshop;
    index?: number;
    variant?: "default" | "compact";
    animateOnScroll?: boolean;
}

const favoritesCache = new Map<string, string[]>();
const favoritesRequests = new Map<string, Promise<string[]>>();

async function getCachedFavorites(accessToken: string) {
    if (favoritesCache.has(accessToken)) {
        return favoritesCache.get(accessToken)!;
    }
    if (favoritesRequests.has(accessToken)) {
        return favoritesRequests.get(accessToken)!;
    }

    const request = getFavorites(accessToken)
        .then((result) => {
            favoritesCache.set(accessToken, result.favorites);
            return result.favorites;
        })
        .finally(() => {
            favoritesRequests.delete(accessToken);
        });

    favoritesRequests.set(accessToken, request);
    return request;
}

export default function WorkshopCard({
    workshop,
    index = 0,
    variant = "default",
    animateOnScroll = true,
}: WorkshopCardProps) {
    const { user, session } = useAuth();
    const prefersReducedMotion = useReducedMotion();
    const shouldAnimateOnScroll = animateOnScroll && !prefersReducedMotion;
    const accessToken = session?.access_token ?? null;
    const [isSaved, setIsSaved] = useState(false);
    const [favoriteLoading, setFavoriteLoading] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const [imageIndex, setImageIndex] = useState(0);

    const today = new Date().toISOString().slice(0, 10);
    const workshopDateTime = getWorkshopDateTime(workshop.date, workshop.time);
    const now = Date.now();
    const isPastWorkshop = workshopDateTime
        ? workshopDateTime.getTime() < now
        : workshop.date < today;

    const hoursUntil = workshopDateTime
        ? (workshopDateTime.getTime() - now) / (1000 * 60 * 60)
        : null;
    const isStartingSoon = hoursUntil !== null && hoursUntil > 0 && hoursUntil <= 48;

    const imagePool = useMemo(() => {
        const items = [workshop.coverImage, ...(workshop.galleryImages || [])]
            .map((item) => item?.trim())
            .filter((item): item is string => Boolean(item));
        const unique = Array.from(new Set(items));
        return unique.length ? unique : [workshop.coverImage];
    }, [workshop.coverImage, workshop.galleryImages]);

    const highlightedBadge = isPastWorkshop
        ? null
        : isStartingSoon
          ? {
                label: `Starts in ${Math.ceil(hoursUntil!)}h`,
                className: "bg-terracotta text-white animate-pulse shadow-md shadow-terracotta/20",
                icon: Clock,
            }
          : workshop.isBestseller
            ? {
                  label: "Bestseller",
                  className: "bg-dark text-white",
              }
            : workshop.isNew
              ? {
                    label: "New",
                    className: "bg-emerald-500 text-white",
                }
              : null;
    const isSoldOut = !isPastWorkshop && workshop.seatsRemaining <= 0;
    const seatsLabel = isSoldOut
        ? "Sold out"
        : `${workshop.seatsRemaining} seat${workshop.seatsRemaining === 1 ? "" : "s"} available`;

    const includesMaterials = workshop.materialsProvided.length > 0;
    const isGreatForGroups = workshop.maxSeats >= 6;
    const badgeLabels = useMemo(() => {
        const custom = (workshop.badgeLabels || [])
            .map((label) => String(label).trim())
            .filter(Boolean);
        if (custom.length > 0) return custom.slice(0, 3);

        const fallback: string[] = ["Beginners welcome"];
        if (includesMaterials) fallback.push("All materials included");
        if (isGreatForGroups) fallback.push("Great for groups");
        return fallback.slice(0, 3);
    }, [includesMaterials, isGreatForGroups, workshop.badgeLabels]);

    useEffect(() => {
        if (!accessToken) {
            setIsSaved(false);
            return;
        }
        let cancelled = false;

        const loadFavorites = async () => {
            try {
                const favorites = await getCachedFavorites(accessToken);
                if (!cancelled) {
                    setIsSaved(favorites.includes(workshop.id));
                }
            } catch {
                if (!cancelled) {
                    setIsSaved(false);
                }
            }
        };

        void loadFavorites();

        return () => {
            cancelled = true;
        };
    }, [accessToken, workshop.id]);

    useEffect(() => {
        if (!isHovered || imagePool.length <= 1 || prefersReducedMotion) {
            setImageIndex(0);
            return;
        }

        let index = 1 % imagePool.length;
        setImageIndex(index);

        const interval = setInterval(() => {
            index = (index + 1) % imagePool.length;
            setImageIndex(index);
        }, 1500);

        return () => {
            clearInterval(interval);
        };
    }, [isHovered, imagePool.length, prefersReducedMotion]);

    const handleToggleFavorite = async (event: MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.stopPropagation();

        if (!user) {
            if (typeof window !== "undefined") {
                window.location.href = `/auth/login?redirect=${encodeURIComponent(
                    `/workshop/${workshop.id}`
                )}`;
            }
            return;
        }

        if (!accessToken) {
            return;
        }

        setFavoriteLoading(true);
        try {
            const result = isSaved
                ? await removeFavorite(accessToken, workshop.id)
                : await addFavorite(accessToken, workshop.id);
            favoritesCache.set(accessToken, result.favorites);
            const saved = result.favorites.includes(workshop.id);
            setIsSaved(saved);
        } catch {
            // Keep card interaction non-blocking even if wishlist update fails.
        } finally {
            setFavoriteLoading(false);
        }
    };

    const handleShare = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const url = `${window.location.origin}/workshop/${workshop.id}`;
        if (navigator.share) {
            navigator
                .share({
                    title: workshop.title,
                    text: `Check out this workshop: ${workshop.title}`,
                    url: url,
                })
                .catch(console.error);
        } else {
            navigator.clipboard.writeText(url);
            alert("Link copied to clipboard!");
        }
    };

    return (
        <motion.div
            variants={shouldAnimateOnScroll ? fadeInUp : undefined}
            initial={shouldAnimateOnScroll ? "hidden" : undefined}
            whileInView={shouldAnimateOnScroll ? "visible" : undefined}
            viewport={shouldAnimateOnScroll ? revealViewport : undefined}
            transition={
                shouldAnimateOnScroll ? { ...standardTransition, delay: index * 0.08 } : undefined
            }
        >
            <Link
                href={`/workshop/${workshop.id}`}
                className="block group"
                onFocus={() => setIsHovered(true)}
                onBlur={() => setIsHovered(false)}
            >
                <div
                    className={`card-workshop light-sweep hover-lift${isPastWorkshop ? " card-workshop-past" : ""}`}
                    onMouseEnter={() => setIsHovered(true)}
                    onMouseLeave={() => setIsHovered(false)}
                >
                    {/* Image */}
                    <div className="relative overflow-hidden aspect-[4/3] bg-cream-100">
                        {imagePool.map((src, idx) => {
                            const isActive = (isHovered ? imageIndex : 0) === idx;
                            return (
                                <Image
                                    key={src}
                                    src={src}
                                    alt={`${workshop.category} workshop: ${workshop.title}`}
                                    fill
                                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                                    className={`object-cover transition-opacity duration-500 ease-in-out image-hover-pan ${
                                        isActive ? "opacity-100" : "opacity-0"
                                    }`}
                                    loading={isHovered ? "eager" : "lazy"}
                                />
                            );
                        })}
                        {/* Category Badge - Removed per user request */}
                        {/* Bestseller / New Badge */}
                        {highlightedBadge && (
                            <div className="absolute top-3 right-3">
                                <span
                                    className={`inline-flex items-center gap-1.5 text-[10px] font-inter font-bold uppercase tracking-wider px-3 py-1.5 rounded-full ${highlightedBadge.className}`}
                                >
                                    {highlightedBadge.icon && (
                                        <highlightedBadge.icon className="w-3 h-3" />
                                    )}
                                    {highlightedBadge.label}
                                </span>
                            </div>
                        )}
                        {/* Quick Actions Overlay */}
                        <div
                            className={`absolute bottom-3 right-3 flex flex-col gap-2 transition-all duration-300 ${
                                isHovered || isSaved
                                    ? "opacity-100 translate-x-0"
                                    : "opacity-0 translate-x-4 md:opacity-0 md:group-hover:opacity-100 md:group-hover:translate-x-0"
                            }`}
                        >
                            {/* Share Button */}
                            <button
                                type="button"
                                onClick={handleShare}
                                aria-label="Share workshop"
                                className="p-2 bg-white/90 backdrop-blur-sm rounded-full shadow-soft transition-all duration-300 hover:bg-white hover:scale-110 hover:text-terracotta active:scale-95"
                            >
                                <Share2 className="w-4 h-4 text-dark-muted hover:text-terracotta transition-colors" />
                            </button>

                            {/* Save Heart */}
                            <button
                                type="button"
                                onClick={handleToggleFavorite}
                                disabled={favoriteLoading}
                                aria-label={isSaved ? "Remove from wishlist" : "Save to wishlist"}
                                aria-pressed={isSaved}
                                className={`p-2 bg-white/90 backdrop-blur-sm rounded-full shadow-soft transition-all duration-300 hover:bg-white hover:scale-110 active:scale-95 ${
                                    favoriteLoading ? "cursor-not-allowed opacity-50" : ""
                                }`}
                            >
                                <Heart
                                    className={`w-4 h-4 transition-colors ${
                                        isSaved
                                            ? "text-terracotta fill-terracotta"
                                            : "text-dark-muted hover:text-terracotta"
                                    }`}
                                />
                            </button>
                        </div>
                        {/* Gradient overlay */}
                        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/20 via-black/5 to-transparent opacity-70 group-hover:opacity-90 transition-opacity duration-500" />
                    </div>

                    {/* Content */}
                    <div className="p-4 transition-transform duration-300 group-hover:-translate-y-0.5">
                        {/* Date & Time */}
                        <div className="flex items-center gap-1.5 mb-2">
                            <Calendar className="w-3.5 h-3.5 text-dark-muted" />
                            <span className="text-xs font-inter text-dark-muted">
                                {formatDate(workshop.date)} &bull; {formatTime(workshop.time)}
                            </span>
                        </div>

                        <h3 className="font-inter text-lg sm:text-xl font-bold text-dark leading-snug mb-1 tracking-tight line-clamp-2 group-hover:text-terracotta transition-colors duration-300">
                            {workshop.title}
                        </h3>

                        {/* Description snippet */}
                        <p className="text-xs font-inter text-dark-muted leading-relaxed mb-2 line-clamp-1">
                            {truncateText(workshop.description, 80)}
                        </p>

                        {/* Suitability badges */}
                        {badgeLabels.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-3">
                                {badgeLabels.map((label) => (
                                    <span
                                        key={label}
                                        className="inline-flex items-center rounded-full bg-cream-100 px-2 py-[3px] text-[10px] font-inter font-semibold uppercase tracking-wide text-dark-muted"
                                    >
                                        {label}
                                    </span>
                                ))}
                            </div>
                        )}

                        {/* Host & Location */}
                        {variant === "default" && (
                            <div className="flex items-center gap-1.5 mb-3">
                                {workshop.hostAvatar ? (
                                    <div className="relative w-4 h-4 rounded-full overflow-hidden shrink-0 border border-gray-100">
                                        <Image
                                            src={workshop.hostAvatar}
                                            alt={workshop.hostName}
                                            fill
                                            className="object-cover"
                                            sizes="16px"
                                        />
                                    </div>
                                ) : (
                                    <MapPin className="w-3.5 h-3.5 text-dark-muted" />
                                )}
                                <span className="text-xs font-inter text-dark-muted truncate">
                                    {workshop.hostName} &bull; {workshop.location}, {workshop.city}
                                </span>
                            </div>
                        )}

                        {/* Bottom Row */}
                        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                            <div className="flex items-center gap-1.5">
                                {workshop.reviewCount > 0 ? (
                                    <>
                                        <Star className="w-3.5 h-3.5 text-terracotta fill-terracotta" />
                                        <span className="text-sm font-inter font-semibold text-dark">
                                            {workshop.rating}
                                        </span>
                                        <span className="text-xs font-inter text-dark-muted">
                                            ({workshop.reviewCount})
                                        </span>
                                    </>
                                ) : isPastWorkshop ? (
                                    <span className="text-xs font-inter text-dark-muted flex items-center gap-1">
                                        <Star className="w-3.5 h-3.5" />
                                        No reviews
                                    </span>
                                ) : (
                                    <span className="text-xs font-inter font-semibold text-emerald-600 flex items-center gap-1">
                                        <Star className="w-3.5 h-3.5" />
                                        New
                                    </span>
                                )}
                            </div>
                            <span className="text-lg font-inter font-bold text-terracotta">
                                {formatCurrency(workshop.price)}
                            </span>
                        </div>

                        {/* Seats / Status indicator */}
                        <div className="mt-2">
                            {isPastWorkshop ? (
                                <span className="inline-flex rounded-full px-2.5 py-1 text-[10px] font-inter font-semibold uppercase tracking-wider border bg-gray-100 text-gray-500 border-gray-200">
                                    Event ended
                                </span>
                            ) : (
                                <>
                                    {workshop.seatsRemaining > 0 &&
                                        workshop.seatsRemaining <= 5 && (
                                            <div className="mb-2">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-[10px] font-bold text-terracotta uppercase tracking-wider animate-pulse flex items-center gap-1">
                                                        <Users className="w-3 h-3" />
                                                        Only {workshop.seatsRemaining} seats left
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                                                        <div
                                                            className="h-full rounded-full bg-terracotta transition-all duration-500"
                                                            style={{
                                                                width: `${((workshop.maxSeats - workshop.seatsRemaining) / workshop.maxSeats) * 100}%`,
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    <span
                                        className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-inter font-semibold uppercase tracking-wider border ${
                                            isSoldOut
                                                ? "bg-red-100 text-red-700 border-red-200"
                                                : workshop.seatsRemaining <= 5
                                                  ? "bg-terracotta/10 text-terracotta border-terracotta/20"
                                                  : "bg-emerald-50 text-emerald-800 border-emerald-100"
                                        }`}
                                    >
                                        {seatsLabel}
                                    </span>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </Link>
        </motion.div>
    );
}
