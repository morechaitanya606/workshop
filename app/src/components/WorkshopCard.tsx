"use client";

import React, { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { usePrefersReducedMotion } from "@/lib/use-reduced-motion";
import { Calendar, MapPin, Heart, Clock, Share2, Users } from "lucide-react";
import { formatCurrency, formatDate, formatTime, truncateText } from "@/lib/utils";
import { getWorkshopDateTime } from "@/lib/booking-time";
import { addFavorite, getFavorites, removeFavorite } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import type { Workshop } from "@/lib/data";
import { fadeInUp, revealViewport, standardTransition } from "@/lib/motion-presets";
import { areaWithCity, displayVenue, workshopArea } from "@/lib/seo";

interface WorkshopCardProps {
    workshop: Workshop;
    todayIso: string;
    index?: number;
    variant?: "default" | "compact";
    animateOnScroll?: boolean;
    /** Hide the suitability keyword chips (e.g. in the "Recently Viewed" rail). */
    showBadgeLabels?: boolean;
    /** `sizes` for the cover image; set it where the card's width is not a plain column share. */
    imageSizes?: string;
}

const DEFAULT_IMAGE_SIZES = "(max-width: 640px) 40vw, (max-width: 1024px) 33vw, 25vw";

const favoritesCache = new Map<string, string[]>();
const favoritesRequests = new Map<string, Promise<string[]>>();

export function clearFavoritesCache() {
    favoritesCache.clear();
    favoritesRequests.clear();
}

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
    todayIso,
    index = 0,
    variant = "default",
    animateOnScroll = true,
    showBadgeLabels = true,
    imageSizes = DEFAULT_IMAGE_SIZES,
}: WorkshopCardProps) {
    const { user, session } = useAuth();
    const prefersReducedMotion = usePrefersReducedMotion();
    // Not tied to reduced motion: the preference is only known after hydration, and dropping the
    // reveal then froze the card in its server-rendered state. MotionConfig makes it instant.
    const shouldAnimateOnScroll = animateOnScroll;
    const accessToken = session?.access_token ?? null;
    const [isSaved, setIsSaved] = useState(false);
    const [favoriteLoading, setFavoriteLoading] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const [imageIndex, setImageIndex] = useState(0);
    const [heartPopping, setHeartPopping] = useState(false);
    const [shareMessage, setShareMessage] = useState<string | null>(null);
    const shareMessageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // "Now" is read after mount. Calling Date.now() during render made the server HTML and
    // the first client render disagree (the "Starts in Nh" badge and the past/upcoming style),
    // which React reports as a hydration mismatch. Before mount we only use the date-level
    // comparison against the server-provided todayIso.
    const [nowMs, setNowMs] = useState<number | null>(null);
    useEffect(() => {
        setNowMs(Date.now());
    }, []);

    const workshopDateTime = getWorkshopDateTime(workshop.date, workshop.time);
    const isPastWorkshop =
        workshopDateTime && nowMs !== null
            ? workshopDateTime.getTime() < nowMs
            : workshop.date < todayIso;

    const hoursUntil =
        workshopDateTime && nowMs !== null
            ? (workshopDateTime.getTime() - nowMs) / (1000 * 60 * 60)
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

    // Never print a pasted Maps link as the venue; fall back to the area the address names.
    const venue = displayVenue(workshop);
    const placeLabel = venue
        ? [venue, workshop.city].filter(Boolean).join(", ")
        : areaWithCity(workshopArea(workshop), workshop.city || "Pune");

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

        // The first swap waits one full interval. Swapping at once meant every card that slid
        // under a resting mouse pointer during a wheel scroll started fetching another photo.
        let index = 0;

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
            if (saved) {
                setHeartPopping(true);
                setTimeout(() => setHeartPopping(false), 400);
            }
        } catch {
            // Keep card interaction non-blocking even if wishlist update fails.
        } finally {
            setFavoriteLoading(false);
        }
    };

    useEffect(
        () => () => {
            if (shareMessageTimerRef.current) clearTimeout(shareMessageTimerRef.current);
        },
        []
    );

    const announceShare = (message: string) => {
        setShareMessage(message);
        if (shareMessageTimerRef.current) clearTimeout(shareMessageTimerRef.current);
        shareMessageTimerRef.current = setTimeout(() => setShareMessage(null), 2500);
    };

    const handleShare = async (event: MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.stopPropagation();
        const url = `${window.location.origin}/workshop/${workshop.id}`;

        if (typeof navigator.share === "function") {
            try {
                await navigator.share({
                    title: workshop.title,
                    text: `Check out this workshop: ${workshop.title}`,
                    url,
                });
            } catch (error) {
                // Closing the share sheet rejects with AbortError; that is not a failure.
                if (!(error instanceof DOMException && error.name === "AbortError")) {
                    announceShare("Could not share this workshop.");
                }
            }
            return;
        }

        try {
            await navigator.clipboard.writeText(url);
            announceShare("Link copied to clipboard.");
        } catch {
            announceShare("Could not copy the link.");
        }
    };

    return (
        <motion.div
            variants={shouldAnimateOnScroll ? fadeInUp : undefined}
            initial={shouldAnimateOnScroll ? "hidden" : undefined}
            whileInView={shouldAnimateOnScroll ? "visible" : undefined}
            viewport={shouldAnimateOnScroll ? revealViewport : undefined}
            // Stagger within a row only: `index * 0.08` made the 13th card in a one-column phone
            // list wait about a second after scrolling into view.
            transition={
                shouldAnimateOnScroll
                    ? { ...standardTransition, delay: (index % 4) * 0.08 }
                    : undefined
            }
        >
            {/* The card is a plain container; the Link and the share/save buttons are siblings
                inside it. Buttons nested inside an <a> are invalid HTML, announce badly, and make
                the click target ambiguous, which is why the old code needed preventDefault. */}
            <div
                className={`group relative card-workshop light-sweep hover-lift active:scale-[0.97] ${isPastWorkshop ? " card-workshop-past" : ""}`}
                // A real mouse only: on phones a tap fires a compat mouseenter with no mouseleave,
                // which left the card cycling (and fetching) photos while the visitor scrolled.
                onPointerEnter={(event) => {
                    if (event.pointerType === "mouse") setIsHovered(true);
                }}
                onPointerLeave={(event) => {
                    if (event.pointerType === "mouse") setIsHovered(false);
                }}
            >
                <Link
                    href={`/workshop/${workshop.id}`}
                    className="flex h-full flex-row sm:flex-col"
                    onFocus={() => setIsHovered(true)}
                    onBlur={() => setIsHovered(false)}
                >
                    {/* Image */}
                    <div className="relative overflow-hidden w-2/5 sm:w-full shrink-0 aspect-[5/4] bg-cream-100">
                        {/* No blur/pulse "loading" state: it was server-rendered and only cleared
                            after hydration, so photos that had already arrived stayed blurred. No
                            `key` either, so a hover swap keeps the current photo until the next
                            one has loaded instead of flashing an empty box. */}
                        <Image
                            src={imagePool[isHovered ? imageIndex : 0]}
                            alt={`${workshop.category} workshop: ${workshop.title}`}
                            fill
                            sizes={imageSizes}
                            className={`object-cover transition-transform duration-700 ease-out ${
                                isHovered ? "scale-105" : "scale-100"
                            }`}
                        />
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
                        {/* Gradient overlay */}
                        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/20 via-black/5 to-transparent opacity-70 group-hover:opacity-90 transition-opacity duration-500" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 flex flex-col p-3 sm:p-4 min-w-0 transition-transform duration-300 group-hover:-translate-y-0.5">
                        {/* Date & Time */}
                        <div className="flex items-center gap-1.5 mb-1.5 sm:mb-2">
                            <Calendar className="w-3 sm:w-3.5 h-3 sm:h-3.5 text-dark-muted shrink-0" />
                            <span className="text-[10px] sm:text-xs font-inter text-dark-muted truncate">
                                {formatDate(workshop.date)} &bull; {formatTime(workshop.time)}
                            </span>
                        </div>

                        <h3 className="font-inter text-base sm:text-lg lg:text-xl font-bold text-dark leading-tight sm:leading-snug mb-1 sm:mb-1.5 tracking-tight line-clamp-2 md:line-clamp-2 group-hover:text-terracotta transition-colors duration-300">
                            {workshop.title}
                        </h3>

                        {/* Description snippet */}
                        <p className="hidden sm:block text-xs font-inter text-dark-muted leading-relaxed mb-2 line-clamp-1">
                            {truncateText(workshop.description, 80)}
                        </p>

                        {/* Suitability badges */}
                        {showBadgeLabels && badgeLabels.length > 0 && (
                            <div className="hidden sm:flex flex-wrap gap-1.5 mb-3">
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
                            <div className="flex items-center gap-1.5 mb-2 sm:mb-3 mt-auto sm:mt-0">
                                {/* A host avatar that is the cover photo again is skipped. */}
                                {workshop.hostAvatar &&
                                workshop.hostAvatar !== workshop.coverImage ? (
                                    <div className="hidden sm:block relative w-4 h-4 rounded-full overflow-hidden shrink-0 border border-gray-100">
                                        <Image
                                            src={workshop.hostAvatar}
                                            alt={workshop.hostName}
                                            fill
                                            className="object-cover"
                                            sizes="16px"
                                        />
                                    </div>
                                ) : (
                                    <MapPin className="hidden sm:block w-3.5 h-3.5 text-dark-muted shrink-0" />
                                )}
                                <span className="text-[10px] sm:text-xs font-inter text-dark-muted truncate">
                                    <span className="hidden sm:inline">
                                        {workshop.hostName} &bull;{" "}
                                    </span>
                                    {placeLabel}
                                </span>
                            </div>
                        )}

                        {/* Bottom Row */}
                        <div className="flex items-center justify-between pt-2 border-t border-gray-100 mt-auto sm:mt-0">
                            <span className="text-sm sm:text-lg font-inter font-bold text-terracotta ml-auto">
                                {formatCurrency(workshop.price)}
                            </span>
                        </div>

                        {/* Seats / Status indicator */}
                        <div className="hidden sm:block mt-2">
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
                </Link>

                {/* Quick actions. This layer has the same box as the image (same width and
                    aspect ratio) so the buttons sit over the image while staying outside the
                    link. Only the buttons capture pointer events. */}
                <div className="pointer-events-none absolute left-0 top-0 z-10 aspect-[5/4] w-2/5 sm:w-full">
                    <div
                        className={`pointer-events-auto absolute bottom-3 right-3 flex flex-col gap-2 transition-all duration-300 focus-within:translate-x-0 focus-within:opacity-100 ${
                            isHovered || isSaved
                                ? "opacity-100 translate-x-0"
                                : "opacity-0 translate-x-4 md:opacity-0 md:group-hover:opacity-100 md:group-hover:translate-x-0"
                        }`}
                    >
                        <button
                            type="button"
                            onClick={(event) => void handleShare(event)}
                            aria-label="Share workshop"
                            className="p-2 bg-white/90 rounded-full shadow-soft transition-all duration-300 hover:bg-white hover:scale-110 hover:text-terracotta active:scale-95"
                        >
                            <Share2 className="w-4 h-4 text-dark-muted hover:text-terracotta transition-colors" />
                        </button>

                        <button
                            type="button"
                            onClick={handleToggleFavorite}
                            disabled={favoriteLoading}
                            aria-label={isSaved ? "Remove from wishlist" : "Save to wishlist"}
                            aria-pressed={isSaved}
                            className={`p-2 bg-white/90 rounded-full shadow-soft transition-all duration-300 hover:bg-white hover:scale-110 active:scale-95 ${
                                favoriteLoading ? "cursor-not-allowed opacity-50" : ""
                            }`}
                        >
                            <Heart
                                className={`w-4 h-4 transition-colors ${heartPopping ? "heart-pop" : ""} ${
                                    isSaved
                                        ? "text-terracotta fill-terracotta"
                                        : "text-dark-muted hover:text-terracotta"
                                }`}
                            />
                        </button>
                    </div>

                    {/* Inline replacement for the old alert(): always mounted so screen readers
                        announce changes, visible only while there is a message. */}
                    <p
                        role="status"
                        aria-live="polite"
                        className={
                            shareMessage
                                ? "absolute bottom-3 left-3 max-w-[60%] rounded-full bg-dark/90 px-3 py-1.5 text-[11px] font-inter font-semibold text-white"
                                : "sr-only"
                        }
                    >
                        {shareMessage}
                    </p>
                </div>
            </div>
        </motion.div>
    );
}
