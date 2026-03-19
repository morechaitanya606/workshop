"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import {
    BellRing,
    Star,
    MapPin,
    Clock,
    Calendar,
    Minus,
    Plus,
    Shield,
    Tag,
    Check,
    ChevronRight,
    Share2,
    Heart,
    Grid3X3,
    Play,
    Instagram,
    Youtube,
    Globe,
    Loader2,
    X,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SocialShareButtons from "@/components/SocialShareButtons";
import WorkshopFAQ from "@/components/WorkshopFAQ";
import MobileNav from "@/components/MobileNav";
import { useToast } from "@/components/ToastProvider";
import type { Workshop } from "@/lib/data";
import {
    addFavorite,
    createBookingHold,
    getFavorites,
    getWorkshopFeedback,
    getWorkshopPublicFeedback,
    getWorkshopNotifications,
    isApiClientError,
    removeFavorite,
    submitWorkshopFeedback,
    toApiErrorMessage,
    updateWorkshopNotifications,
    uploadMedia,
} from "@/lib/api-client";
import { addRecentlyViewed } from "@/lib/recently-viewed";
import { formatCurrency, formatDate, getInitials } from "@/lib/utils";
import { BOOKING_CUTOFF_HOURS, getWorkshopDateTime, isBookingClosedNow } from "@/lib/booking-time";
import { useAuth } from "@/lib/auth-context";
import { trackEvent } from "@/lib/analytics";
import {
    fadeIn,
    fadeInUp,
    quickTransition,
    revealViewport,
    slideInRight,
    staggerContainer,
    standardTransition,
} from "@/lib/motion-presets";
import { isDirectVideoFileUrl } from "@/lib/workshop-media";

function toFiniteNumberOrNull(value: unknown) {
    if (typeof value !== "number" && typeof value !== "string") return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    return parsed;
}

function extractAvailableSeatsFromBookingError(error: unknown) {
    if (!isApiClientError(error)) return null;

    if (error.details && typeof error.details === "object") {
        const details = error.details as Record<string, unknown>;
        const fromDetails =
            toFiniteNumberOrNull(details.availableSeats) ??
            toFiniteNumberOrNull(details.available_seats) ??
            toFiniteNumberOrNull(details.available);
        if (fromDetails !== null) {
            return Math.max(0, fromDetails);
        }
    }

    const message = String(error.message || "");
    const seatsMatch = message.match(/only\s+(\d+)\s+seat/i);
    if (seatsMatch?.[1]) {
        return Math.max(0, Number.parseInt(seatsMatch[1], 10));
    }

    const normalizedMessage = message.toLowerCase();
    if (
        normalizedMessage.includes("sold out") ||
        normalizedMessage.includes("all spots are taken")
    ) {
        return 0;
    }

    return null;
}

export default function WorkshopClient({
    workshop,
    similarWorkshops = [],
}: {
    workshop: Workshop;
    similarWorkshops?: Workshop[];
}) {
    const router = useRouter();
    const prefersReducedMotion = useReducedMotion();
    const { user, session } = useAuth();
    const toast = useToast();

    const [guests, setGuests] = useState(2);
    const [activeImage, setActiveImage] = useState(0);
    const [isSaved, setIsSaved] = useState(false);
    const [favoriteLoading, setFavoriteLoading] = useState(false);
    const [showVideo, setShowVideo] = useState(false);
    const [bookingLoading, setBookingLoading] = useState(false);
    const [holdError, setHoldError] = useState<string | null>(null);
    const [liveAvailableSeatCount, setLiveAvailableSeatCount] = useState<number | null>(null);
    const [notifyState, setNotifyState] = useState({
        similar: false,
        creator: false,
    });
    const [notifyMessage, setNotifyMessage] = useState<string | null>(null);
    const [notifyError, setNotifyError] = useState<string | null>(null);
    const [notifyLoadingMode, setNotifyLoadingMode] = useState<"similar" | "creator" | null>(null);
    const [feedbackDraft, setFeedbackDraft] = useState("");
    const [feedbackError, setFeedbackError] = useState<string | null>(null);
    const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
    const [feedbackLoading, setFeedbackLoading] = useState(false);
    const [canLeaveFeedback, setCanLeaveFeedback] = useState(false);
    const [userFeedback, setUserFeedback] = useState<{
        rating: number | null;
        comment: string;
        photos: string[];
        video_url: string | null;
        created_at: string;
        updated_at: string;
    } | null>(null);
    const [isEditingFeedback, setIsEditingFeedback] = useState(false);
    const [feedbackRating, setFeedbackRating] = useState(5);
    const [feedbackPhotos, setFeedbackPhotos] = useState<string[]>([]);
    const [feedbackUploading, setFeedbackUploading] = useState(false);
    const [publicFeedback, setPublicFeedback] = useState<
        Array<{
            id: string;
            rating: number | null;
            comment: string;
            photos: string[];
            createdAt: string;
            userDisplayName: string;
            avatarUrl?: string | null;
        }>
    >([]);
    const [publicFeedbackLoading, setPublicFeedbackLoading] = useState(false);
    const [publicFeedbackError, setPublicFeedbackError] = useState<string | null>(null);
    const videoModalRef = useRef<HTMLDivElement | null>(null);

    // Waitlist state
    const [showWaitlistModal, setShowWaitlistModal] = useState(false);
    const [waitlistEmail, setWaitlistEmail] = useState("");
    const [waitlistLoading, setWaitlistLoading] = useState(false);
    const [waitlistError, setWaitlistError] = useState<string | null>(null);
    const [waitlistSuccess, setWaitlistSuccess] = useState(false);

    const today = new Date().toISOString().slice(0, 10);
    const workshopDateTime = getWorkshopDateTime(workshop.date, workshop.time);

    const isPastWorkshop = (() => {
        if (!workshopDateTime) {
            return workshop.date < today;
        }
        return workshopDateTime.getTime() < Date.now();
    })();
    const isBookingClosed = isPastWorkshop || isBookingClosedNow(workshop.date, workshop.time);
    const availableSeatCount = Math.max(0, liveAvailableSeatCount ?? workshop.seatsRemaining);
    const isSoldOut = !isPastWorkshop && availableSeatCount <= 0;
    const seatAvailabilityLabel = isPastWorkshop
        ? "Event completed"
        : isBookingClosed
          ? "Booking closed"
          : isSoldOut
            ? "Sold out - all spots are taken"
            : `${availableSeatCount} seat${availableSeatCount === 1 ? "" : "s"} available`;
    const fallbackBadgeLabels = [
        "Beginners welcome",
        ...(workshop.materialsProvided.length > 0 ? ["All materials included"] : []),
        workshop.city ? `${workshop.city} · Offline workshop` : "Offline workshop",
    ];
    const badgeLabels = (
        workshop.badgeLabels && workshop.badgeLabels.length > 0
            ? workshop.badgeLabels
            : fallbackBadgeLabels
    )
        .map((label) => String(label).trim())
        .filter(Boolean)
        .slice(0, 3);
    const suggestedWorkshops = similarWorkshops
        .filter(
            (item) =>
                item.id !== workshop.id &&
                item.seatsRemaining > 0 &&
                item.date >= today &&
                (item.category === workshop.category || item.city === workshop.city)
        )
        .slice(0, 3);
    const isDirectVideoFile = isDirectVideoFileUrl(workshop.videoUrl);
    const accessToken = session?.access_token ?? null;
    const closeVideoModal = () => setShowVideo(false);

    useEffect(() => {
        if (!accessToken) {
            setIsSaved(false);
            return;
        }
        let cancelled = false;
        const loadFavorites = async () => {
            try {
                const result = await getFavorites(accessToken);
                if (!cancelled) {
                    setIsSaved(result.favorites.includes(workshop.id));
                }
            } catch {
                // non-blocking
            }
        };
        void loadFavorites();
        return () => {
            cancelled = true;
        };
    }, [accessToken, workshop.id]);

    useEffect(() => {
        addRecentlyViewed(workshop.id);
    }, [workshop.id]);

    useEffect(() => {
        if (!isPastWorkshop) {
            setCanLeaveFeedback(false);
            setUserFeedback(null);
            return;
        }
        if (!accessToken) {
            setNotifyState({ similar: false, creator: false });
            setCanLeaveFeedback(false);
            setUserFeedback(null);
            return;
        }
        let cancelled = false;
        const loadPastEventActions = async () => {
            try {
                const notifyResult = await getWorkshopNotifications(workshop.id, accessToken).catch(
                    () => null
                );
                if (!cancelled && notifyResult) {
                    setNotifyState({
                        similar: Boolean(notifyResult.subscriptions?.similar),
                        creator: Boolean(notifyResult.subscriptions?.creator),
                    });
                }

                try {
                    const feedbackResult = await getWorkshopFeedback(workshop.id, accessToken);
                    if (!cancelled) {
                        setCanLeaveFeedback(true);
                        setUserFeedback(feedbackResult.feedback || null);
                        if (feedbackResult.feedback) {
                            setFeedbackRating(feedbackResult.feedback.rating ?? 5);
                            setFeedbackPhotos(feedbackResult.feedback.photos || []);
                        } else {
                            setFeedbackRating(5);
                            setFeedbackPhotos([]);
                        }
                    }
                } catch (error) {
                    if (!cancelled && isApiClientError(error) && error.status === 403) {
                        setCanLeaveFeedback(false);
                    }
                }
            } catch {
                // Keep local state defaults if API load fails.
            }
        };
        void loadPastEventActions();
        return () => {
            cancelled = true;
        };
    }, [accessToken, isPastWorkshop, workshop]);

    useEffect(() => {
        setLiveAvailableSeatCount(null);
        setWaitlistSuccess(false);
        setShowWaitlistModal(false);
    }, [workshop.id]);

    useEffect(() => {
        setFeedbackDraft("");
        setFeedbackError(null);
        setFeedbackMessage(null);
        setIsEditingFeedback(false);
        setFeedbackRating(5);
        setFeedbackPhotos([]);
    }, [workshop.id]);

    useEffect(() => {
        if (isSoldOut) {
            setGuests(1);
            return;
        }

        setGuests((currentGuests) =>
            Math.min(Math.max(1, currentGuests), Math.max(1, availableSeatCount))
        );
    }, [availableSeatCount, isSoldOut]);

    useEffect(() => {
        if (!showVideo && !showWaitlistModal) {
            return;
        }

        const previousActive = document.activeElement as HTMLElement | null;
        const modalNode = showVideo
            ? videoModalRef.current
            : document.getElementById("waitlist-modal");
        if (!modalNode) {
            return;
        }

        const getFocusableElements = () =>
            Array.from(
                modalNode.querySelectorAll<HTMLElement>(
                    'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
                )
            );

        const focusable = getFocusableElements();
        (focusable[0] || modalNode).focus();

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                setShowVideo(false);
                return;
            }

            if (event.key !== "Tab") return;
            const focusableElements = getFocusableElements();
            if (focusableElements.length === 0) {
                event.preventDefault();
                modalNode.focus();
                return;
            }

            const first = focusableElements[0];
            const last = focusableElements[focusableElements.length - 1];

            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        document.addEventListener("keydown", handleKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener("keydown", handleKeyDown);
            previousActive?.focus();
        };
    }, [showVideo, showWaitlistModal]);

    const serviceFee = 99;
    const subtotal = workshop.price * guests;
    const total = subtotal + serviceFee;
    const locationQuery = `${workshop.location}, ${workshop.city}`.trim();
    const encodedLocationQuery = encodeURIComponent(locationQuery);
    const mapEmbedUrl =
        typeof workshop.latitude === "number" && typeof workshop.longitude === "number"
            ? `https://www.google.com/maps?q=${workshop.latitude},${workshop.longitude}&output=embed`
            : `https://www.google.com/maps?q=${encodedLocationQuery}&output=embed`;
    const mapOpenUrl =
        typeof workshop.latitude === "number" && typeof workshop.longitude === "number"
            ? `https://www.google.com/maps/search/?api=1&query=${workshop.latitude},${workshop.longitude}`
            : `https://www.google.com/maps/search/?api=1&query=${encodedLocationQuery}`;
    const workshopPath = `/workshop/${workshop.id}`;
    const loginRedirectHref = `/auth/login?redirect=${encodeURIComponent(workshopPath)}`;
    const MAX_FEEDBACK_PHOTOS = 4;

    const loadPublicFeedback = useCallback(async () => {
        setPublicFeedbackLoading(true);
        setPublicFeedbackError(null);
        try {
            const result = await getWorkshopPublicFeedback(workshop.id, { limit: 8 });
            setPublicFeedback(result.feedback || []);
        } catch (error) {
            setPublicFeedback([]);
            setPublicFeedbackError(
                toApiErrorMessage(error, "Unable to load workshop feedback right now.")
            );
        } finally {
            setPublicFeedbackLoading(false);
        }
    }, [workshop.id]);

    useEffect(() => {
        void loadPublicFeedback();
    }, [loadPublicFeedback]);

    useEffect(() => {
        if (user && user.email) {
            setWaitlistEmail(user.email);
        }
    }, [user]);

    const handleJoinWaitlist = async (e: React.FormEvent) => {
        e.preventDefault();
        setWaitlistError(null);
        if (!waitlistEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(waitlistEmail)) {
            setWaitlistError("Please enter a valid email address.");
            return;
        }

        setWaitlistLoading(true);
        try {
            const res = await fetch(`/api/workshops/${workshop.id}/waitlist`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: waitlistEmail,
                    userId: user?.id,
                }),
            });
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to join waitlist.");
            }

            setWaitlistSuccess(true);
            toast.success(
                "Joined waitlist",
                data.message || "We will email you if a spot opens up."
            );
        } catch (err: any) {
            setWaitlistError(err.message || "An unexpected error occurred.");
            toast.error("Error", err.message || "Could not join waitlist.");
        } finally {
            setWaitlistLoading(false);
        }
    };

    const handleBooking = async () => {
        setHoldError(null);
        if (isBookingClosed) {
            const message = `Bookings close ${BOOKING_CUTOFF_HOURS} hours before the workshop starts.`;
            setHoldError(message);
            toast.info("Booking closed", message);
            return;
        }
        if (isSoldOut) {
            const message = "This workshop is sold out. Please choose a similar workshop.";
            setHoldError(message);
            toast.info("Workshop sold out", message);
            return;
        }
        if (!user) {
            router.push(loginRedirectHref);
            toast.info("Log in required", "Please sign in to reserve your seat.");
            return;
        }
        if (!accessToken) {
            const message = "Your session expired. Please log in again.";
            setHoldError(message);
            toast.error("Session expired", message);
            return;
        }
        setBookingLoading(true);
        try {
            const result = await createBookingHold(accessToken, {
                workshopId: workshop.id,
                guests,
            });

            const holdId = result?.hold?.id;
            if (!holdId) {
                const message = "Seat hold was created but could not be verified.";
                setHoldError(message);
                toast.error("Seat hold failed", message);
                return;
            }
            const holdExpiresAt = result?.hold?.expires_at || "";
            trackEvent("booking_started", {
                workshopId: workshop.id,
                guests,
                source: "workshop_detail",
            });
            toast.success(
                "Seat hold created",
                "Your seats are reserved. Continue checkout to confirm booking."
            );
            const bookingParams = new URLSearchParams({
                workshop: workshop.id,
                guests: String(guests),
                hold: holdId,
            });
            if (holdExpiresAt) {
                bookingParams.set("holdExpiresAt", holdExpiresAt);
            }
            router.push(`/booking?${bookingParams.toString()}`);
        } catch (error) {
            const nextAvailableSeatCount = extractAvailableSeatsFromBookingError(error);
            if (nextAvailableSeatCount !== null) {
                setLiveAvailableSeatCount(nextAvailableSeatCount);
                if (nextAvailableSeatCount <= 0) {
                    setGuests(1);
                    const message = "This workshop just sold out!";
                    setHoldError(message);
                    toast.error("Sold out", message);
                    return;
                } else {
                    setGuests((currentGuests) =>
                        Math.min(Math.max(1, currentGuests), Math.max(1, nextAvailableSeatCount))
                    );
                }
            }
            const message = toApiErrorMessage(error, "Unable to reserve seats. Please try again.");
            setHoldError(message);
            toast.error("Could not reserve seats", message);
        } finally {
            setBookingLoading(false);
        }
    };

    const handlePastNotify = async (mode: "similar" | "creator") => {
        setNotifyMessage(null);
        setNotifyError(null);
        if (!user) {
            const redirectPath = encodeURIComponent(`/workshop/${workshop.id}`);
            router.push(`/auth/login?redirect=${redirectPath}`);
            toast.info("Log in required", "Please sign in to manage notifications.");
            return;
        }
        if (!accessToken) {
            const message = "Your session expired. Please log in again.";
            setNotifyError(message);
            toast.error("Session expired", message);
            return;
        }
        setNotifyLoadingMode(mode);
        try {
            const result = await updateWorkshopNotifications(workshop.id, accessToken, mode);
            setNotifyState({
                similar: Boolean(result.subscriptions?.similar),
                creator: Boolean(result.subscriptions?.creator),
            });
            trackEvent("notify_subscription_updated", {
                workshopId: workshop.id,
                mode,
            });
            setNotifyMessage(
                result.message ||
                    (mode === "similar"
                        ? `Notification enabled. We will notify you about similar ${workshop.category.toLowerCase()} events.`
                        : `Notification enabled. We will notify you when ${workshop.hostName} publishes the next event.`)
            );
            toast.success("Notification updated", "Your preference has been saved.");
        } catch (error) {
            const message = toApiErrorMessage(error, "Unable to save notification preference.");
            setNotifyError(message);
            toast.error("Notification update failed", message);
        } finally {
            setNotifyLoadingMode(null);
        }
    };

    const handleFeedbackSubmit = async () => {
        setFeedbackError(null);
        setFeedbackMessage(null);
        if (!user) {
            const redirectPath = encodeURIComponent(`/workshop/${workshop.id}`);
            router.push(`/auth/login?redirect=${redirectPath}`);
            toast.info("Log in required", "Please sign in to submit feedback.");
            return;
        }
        if (!accessToken) {
            const message = "Your session expired. Please log in again.";
            setFeedbackError(message);
            toast.error("Session expired", message);
            return;
        }
        const trimmedFeedback = feedbackDraft.trim();
        if (!trimmedFeedback) {
            const message = "Please add feedback before submitting.";
            setFeedbackError(message);
            toast.info("Feedback required", message);
            return;
        }
        setFeedbackLoading(true);
        try {
            const result = await submitWorkshopFeedback(workshop.id, accessToken, {
                comment: trimmedFeedback,
                rating: feedbackRating,
                photos: feedbackPhotos,
            });
            setUserFeedback(result.feedback || null);
            if (result.feedback) {
                setFeedbackRating(result.feedback.rating ?? 5);
                setFeedbackPhotos(result.feedback.photos || []);
            }
            setFeedbackDraft("");
            setIsEditingFeedback(false);
            trackEvent("feedback_submitted", {
                workshopId: workshop.id,
            });
            setFeedbackMessage(result.message || "Thanks for sharing your feedback.");
            toast.success("Feedback saved", "Thanks for sharing your experience.");
            void loadPublicFeedback();
        } catch (error) {
            const message = toApiErrorMessage(error, "Unable to save feedback.");
            setFeedbackError(message);
            toast.error("Feedback not saved", message);
        } finally {
            setFeedbackLoading(false);
        }
    };

    const handleStartFeedbackEdit = () => {
        if (!userFeedback) return;
        setFeedbackDraft(userFeedback.comment || "");
        setFeedbackRating(userFeedback.rating ?? 5);
        setFeedbackPhotos(userFeedback.photos || []);
        setIsEditingFeedback(true);
        setFeedbackMessage(null);
        setFeedbackError(null);
    };

    const handleCancelFeedbackEdit = () => {
        setIsEditingFeedback(false);
        setFeedbackDraft("");
        setFeedbackRating(userFeedback?.rating ?? 5);
        setFeedbackPhotos(userFeedback?.photos || []);
        setFeedbackMessage(null);
        setFeedbackError(null);
    };

    const handleFeedbackPhotoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []);
        event.target.value = "";
        if (!files.length) return;
        if (!accessToken) {
            setFeedbackError("Please log in to upload photos.");
            return;
        }
        const remaining = Math.max(0, MAX_FEEDBACK_PHOTOS - feedbackPhotos.length);
        if (remaining === 0) {
            setFeedbackError(`You can upload up to ${MAX_FEEDBACK_PHOTOS} photos.`);
            return;
        }
        const selected = files.slice(0, remaining);
        setFeedbackUploading(true);
        setFeedbackError(null);
        try {
            const uploads = await Promise.all(
                selected.map(async (file) => {
                    const result = await uploadMedia(accessToken, file);
                    return String(result.url || "");
                })
            );
            setFeedbackPhotos((prev) => [...prev, ...uploads.filter(Boolean)]);
        } catch (error) {
            setFeedbackError(toApiErrorMessage(error, "Unable to upload photos."));
        } finally {
            setFeedbackUploading(false);
        }
    };

    const handleRemoveFeedbackPhoto = (index: number) => {
        setFeedbackPhotos((prev) => prev.filter((_, i) => i !== index));
    };

    const handleToggleFavorite = async () => {
        if (!user) {
            const redirectPath = encodeURIComponent(`/workshop/${workshop.id}`);
            router.push(`/auth/login?redirect=${redirectPath}`);
            toast.info("Log in required", "Please sign in to save favorites.");
            return;
        }
        if (!accessToken) {
            toast.error("Session expired", "Please log in again to save favorites.");
            return;
        }

        setFavoriteLoading(true);
        try {
            const result = isSaved
                ? await removeFavorite(accessToken, workshop.id)
                : await addFavorite(accessToken, workshop.id);
            const saved = result.favorites.includes(workshop.id);
            setIsSaved(saved);
            toast.success(
                saved ? "Saved to favorites" : "Removed from favorites",
                saved
                    ? "You can find this workshop from your dashboard later."
                    : "The workshop was removed from your wishlist."
            );
        } catch (error) {
            toast.error("Favorites update failed", toApiErrorMessage(error, "Please try again."));
        } finally {
            setFavoriteLoading(false);
        }
    };

    const visiblePublicFeedback = userFeedback
        ? publicFeedback.filter(
              (item) =>
                  item.comment !== userFeedback.comment ||
                  item.createdAt !== userFeedback.created_at
          )
        : publicFeedback;

    return (
        <main className="min-h-screen pb-24 md:pb-0">
            <Navbar />

            <div className="pt-20 sm:pt-24">
                <div className="section-padding mb-4">
                    <motion.nav
                        variants={prefersReducedMotion ? undefined : fadeIn}
                        initial={prefersReducedMotion ? undefined : "hidden"}
                        animate={prefersReducedMotion ? undefined : "visible"}
                        transition={prefersReducedMotion ? { duration: 0 } : quickTransition}
                        className="flex items-center gap-2 text-sm font-inter text-dark-muted"
                    >
                        <Link href="/" className="hover:text-terracotta transition-colors">
                            Home
                        </Link>
                        <ChevronRight className="w-3.5 h-3.5" />
                        <Link
                            href={`/explore?category=${encodeURIComponent(workshop.category)}`}
                            className="hover:text-terracotta transition-colors"
                        >
                            {workshop.category}
                        </Link>
                        <ChevronRight className="w-3.5 h-3.5" />
                        <span className="text-dark">{workshop.title}</span>
                    </motion.nav>
                </div>

                <div className="section-padding">
                    <div className="grid grid-cols-1 lg:grid-cols-[1fr,380px] gap-8 lg:gap-12">
                        {/* ═══ LEFT COLUMN ═══ */}
                        <div>
                            <motion.div
                                variants={prefersReducedMotion ? undefined : fadeInUp}
                                initial={prefersReducedMotion ? undefined : "hidden"}
                                animate={prefersReducedMotion ? undefined : "visible"}
                                transition={
                                    prefersReducedMotion ? { duration: 0 } : standardTransition
                                }
                                className="relative"
                            >
                                <div className="bg-white/90 rounded-3xl shadow-card border border-white/40 backdrop-blur-sm p-2">
                                    <div className="grid grid-cols-1 sm:grid-cols-[2fr,1fr] gap-2 rounded-2xl overflow-hidden">
                                        <div className="relative aspect-[4/3] sm:aspect-auto sm:row-span-2 ring-1 ring-white/50">
                                            <Image
                                                src={workshop.galleryImages[activeImage]}
                                                alt={workshop.title}
                                                fill
                                                priority
                                                className="object-cover"
                                                sizes="(max-width: 1024px) 100vw, 60vw"
                                            />
                                            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/35 via-black/10 to-transparent" />
                                            {workshop.isBestseller && (
                                                <div className="absolute top-4 left-4 bg-terracotta text-white text-xs font-inter font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg">
                                                    Bestseller
                                                </div>
                                            )}
                                            {workshop.videoUrl && (
                                                <button
                                                    onClick={() => setShowVideo(true)}
                                                    className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm text-dark text-xs font-inter font-semibold px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-white transition-colors shadow-soft"
                                                >
                                                    <Play className="w-4 h-4 text-terracotta fill-terracotta" />{" "}
                                                    Watch Video
                                                </button>
                                            )}
                                        </div>
                                        {workshop.galleryImages.slice(1, 3).map((img, i) => {
                                            const thumbIndex = i + 1;
                                            const isActive = activeImage === thumbIndex;
                                            return (
                                                <div
                                                    key={i}
                                                    className={`hidden sm:block cursor-pointer rounded-xl bg-cream-100 border border-clay/40 p-1 transition-all ${
                                                        isActive
                                                            ? "ring-2 ring-terracotta/50"
                                                            : "hover:ring-2 hover:ring-terracotta/30"
                                                    }`}
                                                    onClick={() => setActiveImage(thumbIndex)}
                                                >
                                                    <div className="relative aspect-[4/3] overflow-hidden rounded-lg">
                                                        <Image
                                                            src={img}
                                                            alt={`${workshop.title} ${i + 2}`}
                                                            fill
                                                            className="object-cover hover:opacity-90 transition-opacity"
                                                            sizes="20vw"
                                                            loading="lazy"
                                                        />
                                                        {i === 1 && (
                                                            <button className="absolute bottom-3 right-3 bg-white/90 backdrop-blur-sm text-dark text-xs font-inter font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5 hover:bg-white transition-colors">
                                                                <Grid3X3 className="w-3.5 h-3.5" />{" "}
                                                                View All
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div className="absolute top-4 right-4 flex gap-2 sm:hidden">
                                    <button
                                        type="button"
                                        aria-label="Share workshop"
                                        className="p-2.5 bg-white/90 backdrop-blur-sm rounded-full shadow-soft"
                                    >
                                        <Share2 className="w-4 h-4 text-dark" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleToggleFavorite}
                                        disabled={favoriteLoading}
                                        aria-label={
                                            isSaved ? "Remove from wishlist" : "Save to wishlist"
                                        }
                                        aria-pressed={isSaved}
                                        className="p-2.5 bg-white/90 backdrop-blur-sm rounded-full shadow-soft disabled:opacity-60"
                                    >
                                        <Heart
                                            className={`w-4 h-4 ${isSaved ? "text-terracotta fill-terracotta" : "text-dark"}`}
                                        />
                                    </button>
                                </div>
                            </motion.div>

                            {showVideo && workshop.videoUrl && (
                                <motion.div
                                    variants={prefersReducedMotion ? undefined : fadeIn}
                                    initial={prefersReducedMotion ? undefined : "hidden"}
                                    animate={prefersReducedMotion ? undefined : "visible"}
                                    transition={
                                        prefersReducedMotion ? { duration: 0 } : quickTransition
                                    }
                                    className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4"
                                    onClick={closeVideoModal}
                                >
                                    <motion.div
                                        initial={
                                            prefersReducedMotion
                                                ? undefined
                                                : { opacity: 0, scale: 0.9 }
                                        }
                                        animate={
                                            prefersReducedMotion
                                                ? undefined
                                                : { opacity: 1, scale: 1 }
                                        }
                                        transition={
                                            prefersReducedMotion ? { duration: 0 } : quickTransition
                                        }
                                        className="relative w-full max-w-4xl aspect-video rounded-2xl overflow-hidden"
                                        onClick={(e) => e.stopPropagation()}
                                        role="dialog"
                                        aria-modal="true"
                                        aria-label={`${workshop.title} video preview`}
                                        tabIndex={-1}
                                        ref={videoModalRef}
                                    >
                                        {isDirectVideoFile ? (
                                            <video
                                                src={workshop.videoUrl}
                                                className="w-full h-full bg-black"
                                                controls
                                                autoPlay
                                            />
                                        ) : (
                                            <iframe
                                                src={workshop.videoUrl}
                                                title={`${workshop.title} video`}
                                                className="w-full h-full"
                                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                                allowFullScreen
                                            />
                                        )}
                                        <button
                                            onClick={closeVideoModal}
                                            className="absolute -top-12 right-0 text-white text-sm font-inter hover:text-terracotta transition-colors"
                                            aria-label="Close video"
                                        >
                                            Close X
                                        </button>
                                    </motion.div>
                                </motion.div>
                            )}

                            <motion.div
                                variants={prefersReducedMotion ? undefined : fadeInUp}
                                initial={prefersReducedMotion ? undefined : "hidden"}
                                animate={prefersReducedMotion ? undefined : "visible"}
                                transition={
                                    prefersReducedMotion
                                        ? { duration: 0 }
                                        : { ...standardTransition, delay: 0.15 }
                                }
                                className="mt-6"
                            >
                                {isPastWorkshop && (
                                    <div className="inline-flex items-center gap-2 bg-terracotta/10 text-terracotta text-xs font-inter font-bold uppercase tracking-wider px-3 py-1.5 rounded-full mb-4">
                                        Past Event
                                    </div>
                                )}
                                <h1 className="heading-lg font-inter mb-3">{workshop.title}</h1>
                                <div className="flex flex-wrap items-center gap-4 text-sm font-inter text-dark-secondary">
                                    <div className="flex items-center gap-1.5">
                                        <Star className="w-4 h-4 text-terracotta fill-terracotta" />
                                        <span className="font-semibold">{workshop.rating}</span>
                                        <span className="text-dark-muted">
                                            ({workshop.reviewCount} reviews)
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <MapPin className="w-4 h-4 text-dark-muted" />{" "}
                                        {workshop.location}, {workshop.city}
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <Clock className="w-4 h-4 text-dark-muted" />{" "}
                                        {workshop.duration}
                                    </div>
                                    <span
                                        className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-inter font-semibold uppercase tracking-wider border ${
                                            isPastWorkshop
                                                ? "bg-gray-100 text-dark-muted border-gray-200"
                                                : isSoldOut
                                                  ? "bg-red-100 text-red-700 border-red-200"
                                                  : availableSeatCount <= 5
                                                    ? "bg-terracotta/10 text-terracotta border-terracotta/20"
                                                    : "bg-emerald-50 text-emerald-800 border-emerald-100"
                                        }`}
                                    >
                                        {seatAvailabilityLabel}
                                    </span>
                                </div>
                                {/* Quick suitability strip */}
                                {badgeLabels.length > 0 && (
                                    <div className="mt-4 flex flex-wrap gap-2 text-xs font-inter text-dark-muted">
                                        {badgeLabels.map((label) => (
                                            <span
                                                key={label}
                                                className="inline-flex items-center rounded-full bg-cream-100 px-2.5 py-1 font-semibold uppercase tracking-wider"
                                            >
                                                {label}
                                            </span>
                                        ))}
                                    </div>
                                )}
                                {workshop.socialLinks && (
                                    <div className="flex items-center gap-3 mt-4">
                                        {workshop.socialLinks.instagram && (
                                            <a
                                                href={workshop.socialLinks.instagram}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-1.5 text-sm font-inter text-dark-muted hover:text-terracotta transition-colors bg-white px-3 py-1.5 rounded-lg border border-gray-100"
                                            >
                                                <Instagram className="w-4 h-4" />
                                                <span>Instagram</span>
                                            </a>
                                        )}
                                        {workshop.socialLinks.youtube && (
                                            <a
                                                href={workshop.socialLinks.youtube}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-1.5 text-sm font-inter text-dark-muted hover:text-terracotta transition-colors bg-white px-3 py-1.5 rounded-lg border border-gray-100"
                                            >
                                                <Youtube className="w-4 h-4" />
                                                <span>YouTube</span>
                                            </a>
                                        )}
                                        {workshop.socialLinks.website && (
                                            <a
                                                href={workshop.socialLinks.website}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-1.5 text-sm font-inter text-dark-muted hover:text-terracotta transition-colors bg-white px-3 py-1.5 rounded-lg border border-gray-100"
                                            >
                                                <Globe className="w-4 h-4" />
                                                <span>Website</span>
                                            </a>
                                        )}
                                    </div>
                                )}

                                {/* Share with friends */}
                                <div className="mt-4 pt-4 border-t border-clay/20">
                                    <p className="text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                                        Share with friends
                                    </p>
                                    <SocialShareButtons
                                        title={workshop.title}
                                        date={formatDate(workshop.date)}
                                        city={workshop.city}
                                        seatsRemaining={availableSeatCount}
                                        url={
                                            typeof window !== "undefined"
                                                ? window.location.href
                                                : ""
                                        }
                                    />
                                </div>
                            </motion.div>

                            <hr className="my-8 border-clay/30" />

                            <motion.div
                                variants={prefersReducedMotion ? undefined : staggerContainer}
                                initial={prefersReducedMotion ? undefined : "hidden"}
                                whileInView={prefersReducedMotion ? undefined : "visible"}
                                viewport={prefersReducedMotion ? undefined : revealViewport}
                                className="space-y-6"
                            >
                                <motion.div
                                    variants={prefersReducedMotion ? undefined : fadeInUp}
                                    transition={
                                        prefersReducedMotion ? { duration: 0 } : quickTransition
                                    }
                                    className="card-section"
                                >
                                    <div className="flex items-start gap-4">
                                        <div className="relative w-16 h-16 rounded-full overflow-hidden flex-shrink-0 ring-2 ring-terracotta/20">
                                            <Image
                                                src={workshop.hostAvatar}
                                                alt={workshop.hostName}
                                                fill
                                                className="object-cover"
                                            />
                                        </div>
                                        <div className="flex-1">
                                            <p className="font-playfair text-lg font-semibold text-dark">
                                                Hosted by {workshop.hostName}
                                            </p>
                                            {workshop.hostExperience && (
                                                <p className="text-xs font-inter font-semibold text-terracotta mt-0.5">
                                                    {workshop.hostExperience}
                                                </p>
                                            )}
                                            <p className="text-sm font-inter text-dark-muted mt-2 leading-relaxed">
                                                {workshop.hostBio}
                                            </p>
                                            {workshop.hostSocialLinks && (
                                                <div className="flex items-center gap-2 mt-3">
                                                    {workshop.hostSocialLinks.instagram && (
                                                        <a
                                                            href={
                                                                workshop.hostSocialLinks.instagram
                                                            }
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="p-2 bg-cream-100 rounded-lg hover:bg-terracotta/10 transition-colors"
                                                        >
                                                            <Instagram className="w-4 h-4 text-dark-muted" />
                                                        </a>
                                                    )}
                                                    {workshop.hostSocialLinks.youtube && (
                                                        <a
                                                            href={workshop.hostSocialLinks.youtube}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="p-2 bg-cream-100 rounded-lg hover:bg-terracotta/10 transition-colors"
                                                        >
                                                            <Youtube className="w-4 h-4 text-dark-muted" />
                                                        </a>
                                                    )}
                                                    {workshop.hostSocialLinks.website && (
                                                        <a
                                                            href={workshop.hostSocialLinks.website}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="p-2 bg-cream-100 rounded-lg hover:bg-terracotta/10 transition-colors flex items-center gap-1"
                                                        >
                                                            <Globe className="w-4 h-4 text-dark-muted" />
                                                        </a>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>

                                <motion.div
                                    variants={prefersReducedMotion ? undefined : fadeInUp}
                                    transition={
                                        prefersReducedMotion ? { duration: 0 } : quickTransition
                                    }
                                    className="card-section"
                                >
                                    <span className="eyebrow-label">Snapshot</span>
                                    <h2 className="heading-sm font-inter mb-4">What to expect</h2>
                                    <div className="text-sm font-inter text-dark-secondary space-y-1.5">
                                        <p>
                                            No prior experience needed – this workshop is designed
                                            for complete beginners as well as hobbyists.
                                        </p>
                                        <p>
                                            Small group session in the city with all core materials
                                            provided at the studio.
                                        </p>
                                        <p>
                                            You&apos;ll leave with something you made and the basics
                                            to continue at home.
                                        </p>
                                    </div>
                                </motion.div>

                                <motion.div
                                    variants={prefersReducedMotion ? undefined : fadeInUp}
                                    transition={
                                        prefersReducedMotion ? { duration: 0 } : quickTransition
                                    }
                                    className="card-section"
                                >
                                    <span className="eyebrow-label">About</span>
                                    <h2 className="heading-sm font-inter mb-4">
                                        About this experience
                                    </h2>
                                    <div className="text-body whitespace-pre-line">
                                        {workshop.description}
                                    </div>
                                </motion.div>

                                <motion.div
                                    variants={prefersReducedMotion ? undefined : fadeInUp}
                                    transition={
                                        prefersReducedMotion ? { duration: 0 } : quickTransition
                                    }
                                    className="card-section"
                                >
                                    <span className="eyebrow-label">Learn</span>
                                    <h2 className="heading-sm font-inter mb-4">
                                        What you will learn
                                    </h2>
                                    <ul className="space-y-3">
                                        {workshop.whatYouLearn.map((item, i) => (
                                            <li
                                                key={i}
                                                className="flex items-start gap-3 text-body"
                                            >
                                                <Check className="w-5 h-5 text-terracotta flex-shrink-0 mt-0.5" />{" "}
                                                {item}
                                            </li>
                                        ))}
                                    </ul>
                                </motion.div>

                                <motion.div
                                    variants={prefersReducedMotion ? undefined : fadeInUp}
                                    transition={
                                        prefersReducedMotion ? { duration: 0 } : quickTransition
                                    }
                                    className="card-section"
                                >
                                    <span className="eyebrow-label">Included</span>
                                    <h2 className="heading-sm font-inter mb-4">
                                        {"What's included"}
                                    </h2>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {workshop.materialsProvided.map((item, i) => (
                                            <div
                                                key={i}
                                                className="flex items-center gap-3 bg-cream-200/50 rounded-xl px-4 py-3"
                                            >
                                                <div className="w-8 h-8 bg-terracotta/10 rounded-lg flex items-center justify-center flex-shrink-0">
                                                    <Check className="w-4 h-4 text-terracotta" />
                                                </div>
                                                <span className="text-sm font-inter text-dark-secondary">
                                                    {item}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </motion.div>

                                <motion.div
                                    variants={prefersReducedMotion ? undefined : fadeInUp}
                                    transition={
                                        prefersReducedMotion ? { duration: 0 } : quickTransition
                                    }
                                    className="card-section"
                                >
                                    <span className="eyebrow-label">Location</span>
                                    <h2 className="heading-sm font-inter mb-4">
                                        {"Where you'll be"}
                                    </h2>
                                    <div className="relative overflow-hidden rounded-2xl border border-clay/30 bg-white shadow-soft mb-4">
                                        <iframe
                                            title={`Map for ${locationQuery}`}
                                            src={mapEmbedUrl}
                                            className="w-full h-72 border-0"
                                            loading="lazy"
                                            referrerPolicy="no-referrer-when-downgrade"
                                        />
                                        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/55 to-transparent" />
                                        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-3 rounded-xl bg-white/95 p-3 shadow-soft">
                                            <div className="min-w-0">
                                                <p className="text-sm font-inter font-semibold text-dark truncate">
                                                    {workshop.location}
                                                </p>
                                                <p className="text-xs font-inter text-dark-muted truncate">
                                                    {workshop.city} &bull;{" "}
                                                    {workshop.eventAddress
                                                        ? workshop.eventAddress
                                                        : "Exact address sent upon booking"}
                                                </p>
                                            </div>
                                            <a
                                                href={mapOpenUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-inter font-semibold text-dark hover:border-terracotta hover:text-terracotta transition-colors"
                                            >
                                                <MapPin className="w-3.5 h-3.5" />
                                                Open
                                            </a>
                                        </div>
                                    </div>

                                    {workshop.locationImages &&
                                        workshop.locationImages.length > 0 && (
                                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
                                                {workshop.locationImages.map((img, i) => (
                                                    <div
                                                        key={i}
                                                        className="relative aspect-[4/3] rounded-xl overflow-hidden border border-clay/30 shadow-sm"
                                                    >
                                                        <Image
                                                            src={img}
                                                            alt={`Location image ${i + 1}`}
                                                            fill
                                                            className="object-cover"
                                                            sizes="(max-width: 640px) 50vw, 33vw"
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                </motion.div>

                                <motion.div
                                    variants={prefersReducedMotion ? undefined : fadeInUp}
                                    transition={
                                        prefersReducedMotion ? { duration: 0 } : quickTransition
                                    }
                                >
                                    <WorkshopFAQ />
                                </motion.div>

                                <motion.div
                                    variants={prefersReducedMotion ? undefined : fadeInUp}
                                    transition={
                                        prefersReducedMotion ? { duration: 0 } : quickTransition
                                    }
                                    className="card-section"
                                >
                                    <span className="eyebrow-label">Reviews</span>
                                    <h2 className="heading-sm font-inter mb-4">
                                        Workshop feedback
                                    </h2>
                                    {publicFeedbackLoading ? (
                                        <p className="text-sm font-inter text-dark-muted">
                                            Loading feedback...
                                        </p>
                                    ) : publicFeedbackError ? (
                                        <p className="text-sm font-inter text-red-600">
                                            {publicFeedbackError}
                                        </p>
                                    ) : visiblePublicFeedback.length === 0 ? (
                                        <p className="text-sm font-inter text-dark-muted">
                                            No public feedback yet. Be the first to share your
                                            experience.
                                        </p>
                                    ) : (
                                        <div className="space-y-4">
                                            {visiblePublicFeedback.map((item) => (
                                                <div
                                                    key={item.id}
                                                    className="rounded-xl border border-clay/30 bg-cream-50 p-4"
                                                >
                                                    <div className="flex items-center justify-between gap-4">
                                                        <div className="flex items-center gap-3 min-w-0">
                                                            <div className="h-9 w-9 rounded-full bg-cream border border-clay/40 flex items-center justify-center text-xs font-inter font-semibold text-dark-secondary overflow-hidden">
                                                                {item.avatarUrl ? (
                                                                    <Image
                                                                        src={item.avatarUrl}
                                                                        alt={item.userDisplayName}
                                                                        width={36}
                                                                        height={36}
                                                                        className="h-full w-full object-cover"
                                                                    />
                                                                ) : (
                                                                    getInitials(
                                                                        item.userDisplayName
                                                                    )
                                                                )}
                                                            </div>
                                                            <p className="text-sm font-inter font-semibold text-dark truncate">
                                                                {item.userDisplayName}
                                                            </p>
                                                        </div>
                                                        <span className="text-xs font-inter text-dark-muted whitespace-nowrap">
                                                            {formatDate(item.createdAt)}
                                                        </span>
                                                    </div>
                                                    <div className="mt-2 flex items-center gap-1">
                                                        {Array.from({ length: 5 }).map(
                                                            (_, index) => (
                                                                <Star
                                                                    key={index}
                                                                    className={`w-3.5 h-3.5 ${
                                                                        index < (item.rating ?? 0)
                                                                            ? "text-terracotta fill-terracotta"
                                                                            : "text-dark-muted/40"
                                                                    }`}
                                                                />
                                                            )
                                                        )}
                                                        <span className="text-xs font-inter text-dark-muted ml-2">
                                                            {item.rating ?? "—"} / 5
                                                        </span>
                                                    </div>
                                                    <p className="mt-2 text-sm font-inter text-dark-secondary leading-relaxed">
                                                        {item.comment}
                                                    </p>
                                                    {item.photos.length > 0 && (
                                                        <div className="mt-3 grid grid-cols-3 gap-2">
                                                            {item.photos.map((photo, index) => (
                                                                <div
                                                                    key={`${item.id}-photo-${index}`}
                                                                    className="relative aspect-square overflow-hidden rounded-lg bg-cream-100 border border-clay/30"
                                                                >
                                                                    <Image
                                                                        src={photo}
                                                                        alt="Workshop feedback"
                                                                        fill
                                                                        className="object-cover"
                                                                        sizes="96px"
                                                                    />
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </motion.div>
                            </motion.div>
                        </div>

                        {/* ═══ RIGHT COLUMN - BOOKING SIDEBAR ═══ */}
                        <div className="hidden lg:block">
                            {isPastWorkshop ? (
                                <motion.div
                                    variants={prefersReducedMotion ? undefined : slideInRight}
                                    initial={prefersReducedMotion ? undefined : "hidden"}
                                    animate={prefersReducedMotion ? undefined : "visible"}
                                    transition={
                                        prefersReducedMotion
                                            ? { duration: 0 }
                                            : { ...standardTransition, delay: 0.3 }
                                    }
                                    className="sticky top-28 bg-white rounded-2xl shadow-card p-6 border border-clay/50"
                                >
                                    <div className="inline-flex items-center gap-2 bg-terracotta/10 text-terracotta text-xs font-inter font-bold uppercase tracking-wider px-3 py-1.5 rounded-full mb-4">
                                        Past Event
                                    </div>
                                    <p className="text-sm font-inter text-dark-muted mb-5">
                                        {formatDate(workshop.date)} &bull; {workshop.time} &bull;{" "}
                                        {workshop.location}, {workshop.city}
                                    </p>

                                    <div className="bg-cream-100 rounded-2xl p-4 border border-clay/40 mb-5">
                                        <p className="text-[11px] font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                                            Attendee Feedback
                                        </p>
                                        <p className="text-sm font-inter text-dark-secondary leading-relaxed">
                                            &ldquo;
                                            {workshop.feedbackHighlight ||
                                                `Rated ${workshop.rating}/5 from ${workshop.reviewCount} reviews.`}
                                            &rdquo;
                                        </p>
                                        <p className="text-xs font-inter text-dark-muted mt-2">
                                            {workshop.feedbackAuthor ||
                                                `${workshop.reviewCount} verified reviews`}
                                        </p>
                                    </div>

                                    <div className="space-y-3">
                                        <button
                                            onClick={() => handlePastNotify("similar")}
                                            disabled={notifyLoadingMode !== null}
                                            className={`w-full inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-inter font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${notifyState.similar ? "bg-emerald-100 text-emerald-700 border border-emerald-300" : "bg-terracotta text-white hover:bg-terracotta-600"}`}
                                        >
                                            <BellRing className="w-4 h-4" />
                                            {notifyLoadingMode === "similar"
                                                ? "Saving..."
                                                : notifyState.similar
                                                  ? "Similar Event Alerts On"
                                                  : "Notify Similar Event"}
                                        </button>
                                        <button
                                            onClick={() => handlePastNotify("creator")}
                                            disabled={notifyLoadingMode !== null}
                                            className={`w-full inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-inter font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${notifyState.creator ? "bg-emerald-100 text-emerald-700 border border-emerald-300" : "bg-white text-dark-secondary border border-gray-200 hover:border-terracotta hover:text-terracotta"}`}
                                        >
                                            <BellRing className="w-4 h-4" />
                                            {notifyLoadingMode === "creator"
                                                ? "Saving..."
                                                : notifyState.creator
                                                  ? "Creator Alerts On"
                                                  : "Notify Creator Event"}
                                        </button>
                                    </div>
                                    {notifyMessage && (
                                        <p className="mt-4 text-xs font-inter text-emerald-700">
                                            {notifyMessage}
                                        </p>
                                    )}
                                    {notifyError && (
                                        <p className="mt-2 text-xs font-inter text-red-600">
                                            {notifyError}
                                        </p>
                                    )}

                                    {userFeedback && !isEditingFeedback && (
                                        <div className="mt-6 pt-5 border-t border-dashed border-clay/50">
                                            <div className="flex items-center justify-between mb-2">
                                                <p className="text-[10px] font-inter font-bold uppercase tracking-wider text-dark-muted">
                                                    Your Feedback
                                                </p>
                                                <button
                                                    type="button"
                                                    onClick={handleStartFeedbackEdit}
                                                    className="text-xs font-inter font-semibold text-terracotta hover:text-terracotta-700 transition-colors"
                                                >
                                                    Edit
                                                </button>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                {Array.from({ length: 5 }).map((_, index) => (
                                                    <Star
                                                        key={index}
                                                        className={`w-4 h-4 ${
                                                            index < (userFeedback.rating ?? 0)
                                                                ? "text-terracotta fill-terracotta"
                                                                : "text-dark-muted/40"
                                                        }`}
                                                    />
                                                ))}
                                                <span className="text-xs font-inter text-dark-muted ml-2">
                                                    {userFeedback.rating ?? "—"} / 5
                                                </span>
                                            </div>
                                            <p className="mt-2 text-sm font-inter text-dark-secondary leading-relaxed">
                                                {userFeedback.comment}
                                            </p>
                                            {userFeedback.photos?.length > 0 && (
                                                <div className="mt-3 grid grid-cols-3 gap-2">
                                                    {userFeedback.photos.map((photo, index) => (
                                                        <div
                                                            key={`${photo}-${index}`}
                                                            className="relative aspect-square overflow-hidden rounded-lg bg-cream-100 border border-clay/30"
                                                        >
                                                            <Image
                                                                src={photo}
                                                                alt="Your workshop feedback"
                                                                fill
                                                                className="object-cover"
                                                                sizes="96px"
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {canLeaveFeedback && (isEditingFeedback || !userFeedback) && (
                                        <div className="mt-6 pt-5 border-t border-dashed border-clay/50">
                                            <label className="block text-[10px] font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                                                Rate this workshop
                                            </label>
                                            <div className="flex items-center gap-1 mb-3">
                                                {Array.from({ length: 5 }).map((_, index) => (
                                                    <button
                                                        key={index}
                                                        type="button"
                                                        onClick={() => setFeedbackRating(index + 1)}
                                                        className="p-1"
                                                        aria-label={`Rate ${index + 1} stars`}
                                                    >
                                                        <Star
                                                            className={`w-4 h-4 ${
                                                                index < feedbackRating
                                                                    ? "text-terracotta fill-terracotta"
                                                                    : "text-dark-muted/40"
                                                            }`}
                                                        />
                                                    </button>
                                                ))}
                                                <span className="text-xs font-inter text-dark-muted ml-2">
                                                    {feedbackRating} / 5
                                                </span>
                                            </div>
                                            <label className="block text-[10px] font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                                                Feedback
                                            </label>
                                            <textarea
                                                value={feedbackDraft}
                                                onChange={(event) =>
                                                    setFeedbackDraft(event.target.value)
                                                }
                                                rows={4}
                                                placeholder="Share your feedback for this workshop"
                                                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-inter text-dark focus:outline-none focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta/50"
                                            />
                                            <div className="mt-3">
                                                <label className="block text-[10px] font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                                                    Upload photos
                                                </label>
                                                <div className="flex flex-wrap items-center gap-3">
                                                    <label className="inline-flex items-center gap-2 rounded-full border border-clay/40 px-3 py-2 text-xs font-inter font-semibold text-dark-secondary cursor-pointer hover:border-terracotta hover:text-terracotta transition-colors">
                                                        <input
                                                            type="file"
                                                            accept="image/*"
                                                            multiple
                                                            onChange={handleFeedbackPhotoUpload}
                                                            disabled={
                                                                feedbackUploading || feedbackLoading
                                                            }
                                                            className="sr-only"
                                                        />
                                                        {feedbackUploading
                                                            ? "Uploading..."
                                                            : "Add photos"}
                                                    </label>
                                                    <span className="text-xs font-inter text-dark-muted">
                                                        {feedbackPhotos.length}/
                                                        {MAX_FEEDBACK_PHOTOS}
                                                    </span>
                                                </div>
                                                {feedbackPhotos.length > 0 && (
                                                    <div className="mt-3 grid grid-cols-3 gap-2">
                                                        {feedbackPhotos.map((photo, index) => (
                                                            <div
                                                                key={`${photo}-${index}`}
                                                                className="relative aspect-square overflow-hidden rounded-lg bg-cream-100 border border-clay/30"
                                                            >
                                                                <Image
                                                                    src={photo}
                                                                    alt="Uploaded feedback"
                                                                    fill
                                                                    className="object-cover"
                                                                    sizes="96px"
                                                                />
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        handleRemoveFeedbackPhoto(
                                                                            index
                                                                        )
                                                                    }
                                                                    className="absolute top-1 right-1 rounded-full bg-white/90 p-1 shadow-sm"
                                                                    aria-label="Remove photo"
                                                                >
                                                                    <X className="w-3 h-3 text-dark-muted" />
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="mt-4 flex items-center gap-3">
                                                <button
                                                    onClick={handleFeedbackSubmit}
                                                    disabled={feedbackLoading}
                                                    className="flex-1 rounded-full border border-terracotta text-terracotta font-inter font-semibold text-sm px-4 py-2.5 hover:bg-terracotta hover:text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                                >
                                                    {feedbackLoading
                                                        ? "Submitting..."
                                                        : "Submit Feedback"}
                                                </button>
                                                {userFeedback && isEditingFeedback && (
                                                    <button
                                                        type="button"
                                                        onClick={handleCancelFeedbackEdit}
                                                        className="rounded-full border border-gray-200 px-4 py-2.5 text-sm font-inter font-semibold text-dark-secondary hover:border-terracotta hover:text-terracotta transition-colors"
                                                    >
                                                        Cancel
                                                    </button>
                                                )}
                                            </div>
                                            {feedbackError && (
                                                <p className="mt-2 text-xs font-inter text-red-600">
                                                    {feedbackError}
                                                </p>
                                            )}
                                            {feedbackMessage && (
                                                <p className="mt-2 text-xs font-inter text-emerald-700">
                                                    {feedbackMessage}
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </motion.div>
                            ) : (
                                <motion.div
                                    variants={prefersReducedMotion ? undefined : slideInRight}
                                    initial={prefersReducedMotion ? undefined : "hidden"}
                                    animate={prefersReducedMotion ? undefined : "visible"}
                                    transition={
                                        prefersReducedMotion
                                            ? { duration: 0 }
                                            : { ...standardTransition, delay: 0.3 }
                                    }
                                    className="sticky top-28 bg-white rounded-2xl shadow-card p-6 border border-clay/50"
                                >
                                    <div className="flex items-end justify-between mb-6">
                                        <div>
                                            <p className="text-xs font-inter font-semibold text-terracotta uppercase tracking-wider mb-1">
                                                Price
                                            </p>
                                            <div className="flex items-baseline gap-1">
                                                <span className="font-playfair text-3xl font-bold text-dark">
                                                    {formatCurrency(workshop.price)}
                                                </span>
                                                <span className="text-sm font-inter text-dark-muted">
                                                    / person
                                                </span>
                                            </div>
                                        </div>
                                        {isSoldOut ? (
                                            <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-inter font-bold text-red-700 transition-colors">
                                                Sold Out
                                            </span>
                                        ) : (
                                            availableSeatCount <= 5 && (
                                                <span className="rounded-full bg-terracotta/10 px-2.5 py-1 text-xs font-inter font-bold text-terracotta transition-colors">
                                                    Selling Fast
                                                </span>
                                            )
                                        )}
                                    </div>

                                    <div className="mb-4">
                                        <label className="block text-[10px] font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                                            Select Date
                                        </label>
                                        <div className="bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between cursor-pointer hover:border-terracotta/40 transition-colors">
                                            <div className="flex items-center gap-2">
                                                <Calendar className="w-4 h-4 text-dark-muted" />
                                                <span className="text-sm font-inter text-dark">
                                                    {formatDate(workshop.date)} &bull;{" "}
                                                    {workshop.time}
                                                </span>
                                            </div>
                                            <ChevronRight className="w-4 h-4 text-dark-muted" />
                                        </div>
                                    </div>

                                    <div
                                        className={`mb-6 rounded-xl border px-4 py-3 text-sm font-inter transition-colors ${
                                            isSoldOut
                                                ? "border-red-200 bg-red-50 text-red-700"
                                                : "border-emerald-200 bg-emerald-50 text-emerald-700"
                                        }`}
                                    >
                                        {seatAvailabilityLabel}
                                    </div>

                                    {!isSoldOut && (
                                        <div className="mb-6">
                                            <label className="mb-2 block text-[10px] font-inter font-bold uppercase tracking-wider text-dark-muted">
                                                Guests
                                            </label>
                                            <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-cream-100 px-4 py-3">
                                                <button
                                                    onClick={() =>
                                                        setGuests(Math.max(1, guests - 1))
                                                    }
                                                    disabled={guests <= 1}
                                                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 transition-colors hover:border-terracotta hover:text-terracotta disabled:cursor-not-allowed disabled:opacity-40"
                                                >
                                                    <Minus className="h-4 w-4" />
                                                </button>
                                                <span className="text-lg font-inter font-bold text-dark">
                                                    {guests}
                                                </span>
                                                <button
                                                    onClick={() =>
                                                        setGuests(
                                                            Math.min(availableSeatCount, guests + 1)
                                                        )
                                                    }
                                                    disabled={guests >= availableSeatCount}
                                                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 transition-colors hover:border-terracotta hover:text-terracotta disabled:cursor-not-allowed disabled:opacity-40"
                                                >
                                                    <Plus className="h-4 w-4" />
                                                </button>
                                            </div>
                                            {workshop.maxSeats >= 6 && (
                                                <p className="mt-2 text-xs font-inter text-dark-muted bg-violet-50 border border-violet-100 rounded-lg px-3 py-2">
                                                    🎉 Great for groups! Bring 3+ friends for a
                                                    memorable weekend.
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    {!isSoldOut && (
                                        <div className="mb-6 space-y-3 border-t border-dashed border-clay/50 pt-4">
                                            <div className="flex justify-between text-sm font-inter">
                                                <span className="text-dark-secondary">
                                                    {formatCurrency(workshop.price)} &times;{" "}
                                                    {guests} guests
                                                </span>
                                                <span className="font-medium text-dark">
                                                    {formatCurrency(subtotal)}
                                                </span>
                                            </div>
                                            <div className="flex justify-between text-sm font-inter">
                                                <span className="text-dark-secondary">
                                                    Service fee
                                                </span>
                                                <span className="font-medium text-dark">
                                                    {formatCurrency(serviceFee)}
                                                </span>
                                            </div>
                                            <div className="flex justify-between border-t border-dashed border-clay/50 pt-3 text-base font-inter font-bold">
                                                <span className="text-dark">Total</span>
                                                <span className="text-dark">
                                                    {formatCurrency(total)}
                                                </span>
                                            </div>
                                        </div>
                                    )}

                                    {isBookingClosed ? (
                                        <button
                                            type="button"
                                            disabled
                                            className="btn-secondary w-full text-center !py-4 text-base cursor-not-allowed opacity-70"
                                        >
                                            Booking Closed
                                        </button>
                                    ) : isSoldOut ? (
                                        <button
                                            onClick={() => setShowWaitlistModal(true)}
                                            className="btn-secondary w-full text-center !py-4 text-base"
                                        >
                                            Join Waitlist
                                        </button>
                                    ) : user ? (
                                        <button
                                            onClick={handleBooking}
                                            disabled={bookingLoading}
                                            className="btn-primary w-full text-center !py-4 text-base disabled:opacity-60 disabled:cursor-not-allowed"
                                        >
                                            {bookingLoading ? (
                                                <>
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                    Reserving...
                                                </>
                                            ) : (
                                                "Reserve Spot ->"
                                            )}
                                        </button>
                                    ) : (
                                        <Link
                                            href={loginRedirectHref}
                                            className="btn-primary block w-full text-center !py-4 text-base"
                                        >
                                            {"Log in to Book ->"}
                                        </Link>
                                    )}
                                    <p className="text-center text-xs font-inter text-dark-muted mt-3">
                                        {isBookingClosed
                                            ? `Bookings close ${BOOKING_CUTOFF_HOURS} hours before the workshop starts.`
                                            : isSoldOut
                                              ? "All spots are taken. Join the waitlist to be notified if someone cancels."
                                              : user
                                                ? "Secure payments via Razorpay. You won't be charged twice even if something goes wrong."
                                                : "Log in to book. Payments are processed securely via Razorpay."}
                                    </p>
                                    {holdError && (
                                        <p className="text-center text-xs font-inter text-red-600 mt-2">
                                            {holdError}
                                        </p>
                                    )}

                                    <div className="flex items-center justify-center gap-5 mt-5 pt-4 border-t border-dashed border-clay/50">
                                        <div className="flex items-center gap-1.5 text-xs font-inter text-dark-muted">
                                            <Shield className="w-3.5 h-3.5" />
                                            Secure
                                        </div>
                                        <div className="flex items-center gap-1.5 text-xs font-inter text-dark-muted">
                                            <Tag className="w-3.5 h-3.5" />
                                            Best Price
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══ MOBILE STICKY BOOKING BAR ═══ */}
            {isSoldOut && (
                <div className="section-padding mt-8">
                    <motion.div
                        variants={prefersReducedMotion ? undefined : fadeInUp}
                        initial={prefersReducedMotion ? undefined : "hidden"}
                        animate={prefersReducedMotion ? undefined : "visible"}
                        transition={
                            prefersReducedMotion
                                ? { duration: 0 }
                                : { ...quickTransition, delay: 0.2 }
                        }
                        className="rounded-2xl border border-red-200 bg-red-50 p-6"
                    >
                        <h2 className="heading-sm font-inter text-red-800">
                            All spots are taken for this workshop
                        </h2>
                        <p className="mt-2 text-sm font-inter text-red-700">
                            Booking is closed for this event. Try one of these similar workshops
                            with seats available.
                        </p>

                        {suggestedWorkshops.length > 0 ? (
                            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                {suggestedWorkshops.map((suggestion) => (
                                    <Link
                                        key={suggestion.id}
                                        href={`/workshop/${suggestion.id}`}
                                        className="rounded-xl border border-red-100 bg-white p-4 transition-colors hover:border-terracotta/40"
                                    >
                                        <p className="line-clamp-2 text-sm font-inter font-semibold text-dark">
                                            {suggestion.title}
                                        </p>
                                        <p className="mt-1 text-xs font-inter text-dark-muted">
                                            {formatDate(suggestion.date)} &bull; {suggestion.time}
                                        </p>
                                        <p className="mt-2 text-xs font-inter text-emerald-700">
                                            {suggestion.seatsRemaining} seat
                                            {suggestion.seatsRemaining === 1 ? "" : "s"} available
                                        </p>
                                    </Link>
                                ))}
                            </div>
                        ) : (
                            <p className="mt-4 text-sm font-inter text-dark-secondary">
                                No similar workshops with open seats are available right now.
                            </p>
                        )}

                        <Link
                            href="/explore"
                            className="btn-secondary mt-5 inline-flex !py-2.5 !px-5 text-sm"
                        >
                            Explore All Workshops
                        </Link>
                    </motion.div>
                </div>
            )}

            {isPastWorkshop ? (
                <div className="section-padding mt-8 lg:hidden">
                    <motion.div
                        variants={prefersReducedMotion ? undefined : fadeInUp}
                        initial={prefersReducedMotion ? undefined : "hidden"}
                        animate={prefersReducedMotion ? undefined : "visible"}
                        transition={
                            prefersReducedMotion
                                ? { duration: 0 }
                                : { ...quickTransition, delay: 0.2 }
                        }
                        className="bg-white rounded-2xl shadow-card p-5 border border-gray-100"
                    >
                        <div className="inline-flex items-center gap-2 bg-terracotta/10 text-terracotta text-xs font-inter font-bold uppercase tracking-wider px-3 py-1.5 rounded-full mb-4">
                            Past Event
                        </div>
                        <div className="bg-cream-100 rounded-2xl p-4 border border-clay/40 mb-4">
                            <p className="text-[11px] font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                                Attendee Feedback
                            </p>
                            <p className="text-sm font-inter text-dark-secondary leading-relaxed">
                                &ldquo;
                                {workshop.feedbackHighlight ||
                                    `Rated ${workshop.rating}/5 from ${workshop.reviewCount} reviews.`}
                                &rdquo;
                            </p>
                            <p className="text-xs font-inter text-dark-muted mt-2">
                                {workshop.feedbackAuthor ||
                                    `${workshop.reviewCount} verified reviews`}
                            </p>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <button
                                onClick={() => handlePastNotify("similar")}
                                disabled={notifyLoadingMode !== null}
                                className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-inter font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${notifyState.similar ? "bg-emerald-100 text-emerald-700 border border-emerald-300" : "bg-terracotta text-white hover:bg-terracotta-600"}`}
                            >
                                <BellRing className="w-4 h-4" />
                                {notifyLoadingMode === "similar"
                                    ? "Saving..."
                                    : notifyState.similar
                                      ? "Similar Alerts On"
                                      : "Notify Similar Event"}
                            </button>
                            <button
                                onClick={() => handlePastNotify("creator")}
                                disabled={notifyLoadingMode !== null}
                                className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-inter font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${notifyState.creator ? "bg-emerald-100 text-emerald-700 border border-emerald-300" : "bg-white text-dark-secondary border border-gray-200 hover:border-terracotta hover:text-terracotta"}`}
                            >
                                <BellRing className="w-4 h-4" />
                                {notifyLoadingMode === "creator"
                                    ? "Saving..."
                                    : notifyState.creator
                                      ? "Creator Alerts On"
                                      : "Notify Creator Event"}
                            </button>
                        </div>
                        {notifyMessage && (
                            <p className="mt-3 text-xs font-inter text-emerald-700">
                                {notifyMessage}
                            </p>
                        )}
                        {notifyError && (
                            <p className="mt-2 text-xs font-inter text-red-600">{notifyError}</p>
                        )}

                        {userFeedback && !isEditingFeedback && (
                            <div className="mt-5 pt-4 border-t border-gray-100">
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-[10px] font-inter font-bold uppercase tracking-wider text-dark-muted">
                                        Your Feedback
                                    </p>
                                    <button
                                        type="button"
                                        onClick={handleStartFeedbackEdit}
                                        className="text-xs font-inter font-semibold text-terracotta hover:text-terracotta-700 transition-colors"
                                    >
                                        Edit
                                    </button>
                                </div>
                                <div className="flex items-center gap-1">
                                    {Array.from({ length: 5 }).map((_, index) => (
                                        <Star
                                            key={index}
                                            className={`w-4 h-4 ${
                                                index < (userFeedback.rating ?? 0)
                                                    ? "text-terracotta fill-terracotta"
                                                    : "text-dark-muted/40"
                                            }`}
                                        />
                                    ))}
                                    <span className="text-xs font-inter text-dark-muted ml-2">
                                        {userFeedback.rating ?? "—"} / 5
                                    </span>
                                </div>
                                <p className="mt-2 text-sm font-inter text-dark-secondary leading-relaxed">
                                    {userFeedback.comment}
                                </p>
                                {userFeedback.photos?.length > 0 && (
                                    <div className="mt-3 grid grid-cols-3 gap-2">
                                        {userFeedback.photos.map((photo, index) => (
                                            <div
                                                key={`${photo}-${index}`}
                                                className="relative aspect-square overflow-hidden rounded-lg bg-cream-100 border border-clay/30"
                                            >
                                                <Image
                                                    src={photo}
                                                    alt="Your workshop feedback"
                                                    fill
                                                    className="object-cover"
                                                    sizes="96px"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {canLeaveFeedback && (isEditingFeedback || !userFeedback) && (
                            <div className="mt-5 pt-4 border-t border-gray-100">
                                <label className="block text-[10px] font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                                    Rate this workshop
                                </label>
                                <div className="flex items-center gap-1 mb-3">
                                    {Array.from({ length: 5 }).map((_, index) => (
                                        <button
                                            key={index}
                                            type="button"
                                            onClick={() => setFeedbackRating(index + 1)}
                                            className="p-1"
                                            aria-label={`Rate ${index + 1} stars`}
                                        >
                                            <Star
                                                className={`w-4 h-4 ${
                                                    index < feedbackRating
                                                        ? "text-terracotta fill-terracotta"
                                                        : "text-dark-muted/40"
                                                }`}
                                            />
                                        </button>
                                    ))}
                                    <span className="text-xs font-inter text-dark-muted ml-2">
                                        {feedbackRating} / 5
                                    </span>
                                </div>
                                <label className="block text-[10px] font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                                    Feedback
                                </label>
                                <textarea
                                    value={feedbackDraft}
                                    onChange={(event) => setFeedbackDraft(event.target.value)}
                                    rows={4}
                                    placeholder="Share your feedback for this workshop"
                                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-inter text-dark focus:outline-none focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta/50"
                                />
                                <div className="mt-3">
                                    <label className="block text-[10px] font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                                        Upload photos
                                    </label>
                                    <div className="flex flex-wrap items-center gap-3">
                                        <label className="inline-flex items-center gap-2 rounded-full border border-clay/40 px-3 py-2 text-xs font-inter font-semibold text-dark-secondary cursor-pointer hover:border-terracotta hover:text-terracotta transition-colors">
                                            <input
                                                type="file"
                                                accept="image/*"
                                                multiple
                                                onChange={handleFeedbackPhotoUpload}
                                                disabled={feedbackUploading || feedbackLoading}
                                                className="sr-only"
                                            />
                                            {feedbackUploading ? "Uploading..." : "Add photos"}
                                        </label>
                                        <span className="text-xs font-inter text-dark-muted">
                                            {feedbackPhotos.length}/{MAX_FEEDBACK_PHOTOS}
                                        </span>
                                    </div>
                                    {feedbackPhotos.length > 0 && (
                                        <div className="mt-3 grid grid-cols-3 gap-2">
                                            {feedbackPhotos.map((photo, index) => (
                                                <div
                                                    key={`${photo}-${index}`}
                                                    className="relative aspect-square overflow-hidden rounded-lg bg-cream-100 border border-clay/30"
                                                >
                                                    <Image
                                                        src={photo}
                                                        alt="Uploaded feedback"
                                                        fill
                                                        className="object-cover"
                                                        sizes="96px"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            handleRemoveFeedbackPhoto(index)
                                                        }
                                                        className="absolute top-1 right-1 rounded-full bg-white/90 p-1 shadow-sm"
                                                        aria-label="Remove photo"
                                                    >
                                                        <X className="w-3 h-3 text-dark-muted" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="mt-4 flex items-center gap-3">
                                    <button
                                        onClick={handleFeedbackSubmit}
                                        disabled={feedbackLoading}
                                        className="flex-1 rounded-full border border-terracotta text-terracotta font-inter font-semibold text-sm px-4 py-2.5 hover:bg-terracotta hover:text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                    >
                                        {feedbackLoading ? "Submitting..." : "Submit Feedback"}
                                    </button>
                                    {userFeedback && isEditingFeedback && (
                                        <button
                                            type="button"
                                            onClick={handleCancelFeedbackEdit}
                                            className="rounded-full border border-gray-200 px-4 py-2.5 text-sm font-inter font-semibold text-dark-secondary hover:border-terracotta hover:text-terracotta transition-colors"
                                        >
                                            Cancel
                                        </button>
                                    )}
                                </div>
                                {feedbackError && (
                                    <p className="mt-2 text-xs font-inter text-red-600">
                                        {feedbackError}
                                    </p>
                                )}
                                {feedbackMessage && (
                                    <p className="mt-2 text-xs font-inter text-emerald-700">
                                        {feedbackMessage}
                                    </p>
                                )}
                            </div>
                        )}
                    </motion.div>
                </div>
            ) : (
                <div className="fixed bottom-16 left-0 right-0 z-40 bg-white/95 backdrop-blur-xl border-t border-gray-100 px-4 py-3 lg:hidden safe-area-bottom">
                    <div className="flex items-center justify-between">
                        <div>
                            <span className="font-playfair text-2xl font-bold text-dark">
                                {formatCurrency(workshop.price)}
                            </span>
                            <span className="text-sm font-inter text-dark-muted"> / person</span>
                            <p
                                className={`mt-1 text-xs font-inter ${
                                    isSoldOut ? "text-red-700" : "text-emerald-700"
                                }`}
                            >
                                {seatAvailabilityLabel}
                            </p>
                        </div>
                        {isBookingClosed ? (
                            <button
                                type="button"
                                disabled
                                className="rounded-full bg-gray-100 text-dark-muted px-6 py-3 text-sm font-inter font-semibold cursor-not-allowed"
                            >
                                Booking Closed
                            </button>
                        ) : isSoldOut ? (
                            <button
                                onClick={() => setShowWaitlistModal(true)}
                                className="rounded-full bg-white border border-terracotta text-terracotta px-6 py-3 text-sm font-inter font-semibold hover:bg-terracotta hover:text-white transition-colors"
                            >
                                Join Waitlist
                            </button>
                        ) : user ? (
                            <button
                                onClick={handleBooking}
                                disabled={bookingLoading}
                                className="btn-primary !py-3 !px-8 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                {bookingLoading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Reserving
                                    </>
                                ) : (
                                    "Book My Spot"
                                )}
                            </button>
                        ) : (
                            <Link href={loginRedirectHref} className="btn-primary !py-3 !px-8">
                                Log in to Book
                            </Link>
                        )}
                    </div>
                    {holdError && (
                        <p className="text-center text-xs font-inter text-red-600 mt-2">
                            {holdError}
                        </p>
                    )}
                    {isSoldOut && (
                        <p className="mt-2 text-center text-xs font-inter text-dark-secondary">
                            This workshop is full. Scroll up for similar workshops.
                        </p>
                    )}
                </div>
            )}

            <Footer />
            <MobileNav />

            {/* ═══ WAITLIST MODAL ═══ */}
            {showWaitlistModal && (
                <div
                    className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
                    onClick={() => setShowWaitlistModal(false)}
                >
                    <div
                        id="waitlist-modal"
                        className="bg-white rounded-2xl p-6 sm:p-8 w-full max-w-md shadow-card relative"
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                    >
                        <button
                            onClick={() => setShowWaitlistModal(false)}
                            className="absolute top-4 right-4 p-2 rounded-full hover:bg-cream-100 text-dark-muted transition-colors"
                            aria-label="Close modal"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <div className="text-center mb-6">
                            <div className="w-12 h-12 bg-terracotta/10 rounded-full flex items-center justify-center mx-auto mb-4">
                                <BellRing className="w-6 h-6 text-terracotta" />
                            </div>
                            <h3 className="heading-sm mb-2">Join the Waitlist</h3>
                            <p className="text-sm font-inter text-dark-secondary">
                                This workshop is currently full. We&apos;ll email you immediately if
                                a spot opens up.
                            </p>
                        </div>

                        {waitlistSuccess ? (
                            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                                <Check className="w-6 h-6 text-emerald-600 mx-auto mb-2" />
                                <p className="text-sm font-inter font-semibold text-emerald-800">
                                    You&apos;re on the list!
                                </p>
                                <p className="text-xs font-inter text-emerald-700 mt-1">
                                    We&apos;ll notify {waitlistEmail} if seats become available.
                                </p>
                                <button
                                    onClick={() => setShowWaitlistModal(false)}
                                    className="btn-primary w-full mt-4 !py-2.5"
                                >
                                    Close
                                </button>
                            </div>
                        ) : (
                            <form onSubmit={handleJoinWaitlist} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                                        Email Address
                                    </label>
                                    <input
                                        type="email"
                                        value={waitlistEmail}
                                        onChange={(e) => {
                                            setWaitlistEmail(e.target.value);
                                            setWaitlistError(null);
                                        }}
                                        required
                                        placeholder="Enter your email"
                                        className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter focus:outline-none focus:border-terracotta/50 focus:ring-1 focus:ring-terracotta/30"
                                    />
                                    {waitlistError && (
                                        <p className="text-xs font-inter text-red-600 mt-1.5">
                                            {waitlistError}
                                        </p>
                                    )}
                                </div>
                                <button
                                    type="submit"
                                    disabled={waitlistLoading}
                                    className="btn-primary w-full !py-3 disabled:opacity-70 disabled:cursor-not-allowed"
                                >
                                    {waitlistLoading ? "Joining..." : "Join Waitlist"}
                                </button>
                            </form>
                        )}
                    </div>
                </div>
            )}

            {/* ═══ STICKY MOBILE BOOKING BAR ═══ */}
            {!isPastWorkshop && !isBookingClosed && (
                <div className="fixed bottom-0 inset-x-0 z-40 lg:hidden">
                    <div className="bg-white/95 backdrop-blur-xl border-t border-clay/30 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] px-4 py-3">
                        <div className="flex items-center justify-between gap-4 max-w-lg mx-auto">
                            <div>
                                <span className="font-playfair text-lg font-bold text-dark">
                                    {formatCurrency(workshop.price)}
                                </span>
                                <span className="text-xs font-inter text-dark-muted ml-1">
                                    / person
                                </span>
                            </div>
                            {isSoldOut ? (
                                <button
                                    onClick={() => setShowWaitlistModal(true)}
                                    className="btn-secondary !py-2.5 !px-6 text-sm"
                                >
                                    Join Waitlist
                                </button>
                            ) : user ? (
                                <button
                                    onClick={handleBooking}
                                    disabled={bookingLoading}
                                    className="btn-primary !py-2.5 !px-6 text-sm disabled:opacity-60"
                                >
                                    {bookingLoading ? "Reserving..." : "Reserve Spot →"}
                                </button>
                            ) : (
                                <Link
                                    href={loginRedirectHref}
                                    className="btn-primary !py-2.5 !px-6 text-sm"
                                >
                                    Log in to Book
                                </Link>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
