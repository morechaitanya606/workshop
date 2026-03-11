"use client";

import React, { useEffect, useMemo, useState, type MouseEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Calendar, MapPin, Star, Heart } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
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

    const imagePool = useMemo(() => {
        const items = [workshop.coverImage, ...(workshop.galleryImages || [])]
            .map((item) => item?.trim())
            .filter((item): item is string => Boolean(item));
        const unique = Array.from(new Set(items));
        return unique.length ? unique : [workshop.coverImage];
    }, [workshop.coverImage, workshop.galleryImages]);

    const highlightedBadge = workshop.isBestseller
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
    const isSoldOut = workshop.seatsRemaining <= 0;
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
                    className="card-workshop light-sweep hover-lift"
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
                                    className={`inline-flex items-center text-[10px] font-inter font-bold uppercase tracking-wider px-3 py-1 rounded-full ${highlightedBadge.className}`}
                                >
                                    {highlightedBadge.label}
                                </span>
                            </div>
                        )}
                        {/* Save Heart */}
                        <button
                            type="button"
                            onClick={handleToggleFavorite}
                            disabled={favoriteLoading}
                            aria-label={isSaved ? "Remove from wishlist" : "Save to wishlist"}
                            aria-pressed={isSaved}
                            className={`absolute bottom-3 right-3 p-2 bg-white/90 backdrop-blur-sm rounded-full shadow-soft transition-all duration-300 hover:bg-white hover:scale-110 ${
                                isSaved ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                            } ${favoriteLoading ? "cursor-not-allowed" : ""}`}
                        >
                            <Heart
                                className={`w-4 h-4 ${
                                    isSaved ? "text-terracotta fill-terracotta" : "text-dark-muted"
                                }`}
                            />
                        </button>
                        {/* Gradient overlay */}
                        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/20 via-black/5 to-transparent opacity-70 group-hover:opacity-90 transition-opacity duration-500" />
                    </div>

                    {/* Content */}
                    <div className="p-4 transition-transform duration-300 group-hover:-translate-y-0.5">
                        {/* Date & Time */}
                        <div className="flex items-center gap-1.5 mb-2">
                            <Calendar className="w-3.5 h-3.5 text-dark-muted" />
                            <span className="text-xs font-inter text-dark-muted">
                                {formatDate(workshop.date)} &bull; {workshop.time}
                            </span>
                        </div>

                        <h3 className="font-inter text-lg sm:text-xl font-bold text-dark leading-snug mb-2 tracking-tight line-clamp-2 group-hover:text-terracotta transition-colors duration-300">
                            {workshop.title}
                        </h3>

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

                        {/* Location */}
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
                                <span className="text-xs font-inter text-dark-muted">
                                    {workshop.location}, {workshop.city}
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
                                ) : (
                                    <span className="text-xs font-inter font-semibold text-emerald-600 flex items-center gap-1">
                                        <Star className="w-3.5 h-3.5" />
                                        NEW
                                    </span>
                                )}
                            </div>
                            <span className="text-lg font-inter font-bold text-terracotta">
                                {formatCurrency(workshop.price)}
                            </span>
                        </div>

                        {/* Seats indicator */}
                        <div className="mt-2">
                            {workshop.seatsRemaining > 0 && workshop.seatsRemaining <= 5 && (
                                <div className="mb-2 flex items-center gap-1.5">
                                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                                        <div
                                            className="h-full rounded-full bg-terracotta transition-all duration-500"
                                            style={{
                                                width: `${((workshop.maxSeats - workshop.seatsRemaining) / workshop.maxSeats) * 100}%`,
                                            }}
                                        />
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
                        </div>
                    </div>
                </div>
            </Link>
        </motion.div>
    );
}
