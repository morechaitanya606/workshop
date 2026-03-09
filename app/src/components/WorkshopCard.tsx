"use client";

import React, { useEffect, useState, type MouseEvent } from "react";
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
            <Link href={`/workshop/${workshop.id}`} className="block group">
                <div className="card-workshop">
                    {/* Image */}
                    <div className="relative overflow-hidden aspect-[4/3]">
                        <Image
                            src={workshop.coverImage}
                            alt={`${workshop.category} workshop: ${workshop.title}`}
                            fill
                            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                            className="object-cover transition-transform duration-700 ease-out group-hover:scale-110"
                            loading="lazy"
                        />
                        {/* Category Badge */}
                        <div className="absolute top-3 left-3">
                            <span className="inline-block bg-terracotta text-white text-[10px] font-inter font-bold uppercase tracking-wider px-2.5 py-1 rounded-md">
                                {workshop.category}
                            </span>
                        </div>
                        {/* Bestseller / New Badge */}
                        {highlightedBadge && (
                            <div className="absolute top-3 right-3">
                                <span
                                    className={`inline-block text-[10px] font-inter font-bold uppercase tracking-wider px-2.5 py-1 rounded-md ${highlightedBadge.className}`}
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
                        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    </div>

                    {/* Content */}
                    <div className="p-4">
                        {/* Date & Time */}
                        <div className="flex items-center gap-1.5 mb-2">
                            <Calendar className="w-3.5 h-3.5 text-dark-muted" />
                            <span className="text-xs font-inter text-dark-muted">
                                {formatDate(workshop.date)} &bull; {workshop.time}
                            </span>
                        </div>

                        {/* Title */}
                        <h3 className="font-playfair text-base sm:text-lg font-semibold text-dark leading-snug mb-2 line-clamp-2 group-hover:text-terracotta transition-colors duration-300">
                            {workshop.title}
                        </h3>

                        {/* Location */}
                        {variant === "default" && (
                            <div className="flex items-center gap-1.5 mb-3">
                                <MapPin className="w-3.5 h-3.5 text-dark-muted" />
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
                                className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-inter font-semibold uppercase tracking-wider ${
                                    isSoldOut
                                        ? "bg-red-100 text-red-700"
                                        : workshop.seatsRemaining <= 5
                                          ? "bg-terracotta/10 text-terracotta"
                                          : "bg-emerald-100 text-emerald-700"
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
