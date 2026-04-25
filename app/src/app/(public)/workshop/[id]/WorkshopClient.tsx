"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import dynamic from "next/dynamic";
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
    Tag,
    Check,
    ChevronRight,
    ArrowRight,
    Instagram,
    Youtube,
    Globe,
} from "lucide-react";
import Footer from "@/components/Footer";
import { useToast } from "@/components/ToastProvider";
import type { AppliedCoupon } from "@/app/(private)/booking/types";
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
import { formatCurrency, formatDate, formatTime, getInitials } from "@/lib/utils";
import { BOOKING_CUTOFF_HOURS, getWorkshopDateTime, isBookingClosedNow } from "@/lib/booking-time";
import { useAuth } from "@/lib/auth-context";
import { trackEvent } from "@/lib/analytics";
import {
    fadeInUp,
    quickTransition,
    revealViewport,
    staggerContainer,
    standardTransition,
} from "@/lib/motion-presets";
import type { PlatformSettingsType } from "@/lib/workshop-page-data";
import WorkshopGallery from "./WorkshopGallery";
import WorkshopBookingSidebar from "./WorkshopBookingSidebar";
import WorkshopPastEventSidebar from "./WorkshopPastEventSidebar";
import WorkshopWaitlistModal from "./WorkshopWaitlistModal";
import WorkshopMobileBookingBar from "./WorkshopMobileBookingBar";

const SocialShareButtons = dynamic(() => import("@/components/SocialShareButtons"), {
    loading: () => (
        <div className="flex gap-2">
            <div className="h-10 w-10 rounded-full bg-cream-200 animate-pulse" />
            <div className="h-10 w-10 rounded-full bg-cream-200 animate-pulse" />
            <div className="h-10 w-10 rounded-full bg-cream-200 animate-pulse" />
        </div>
    ),
});

const WorkshopFAQ = dynamic(() => import("@/components/WorkshopFAQ"), {
    loading: () => (
        <div className="card-section">
            <span className="eyebrow-label">FAQ</span>
            <div className="mt-4 space-y-3">
                <div className="h-14 rounded-xl bg-cream-100 animate-pulse" />
                <div className="h-14 rounded-xl bg-cream-100 animate-pulse" />
                <div className="h-14 rounded-xl bg-cream-100 animate-pulse" />
            </div>
        </div>
    ),
});

const WorkshopCard = dynamic(() => import("@/components/WorkshopCard"), {
    loading: () => (
        <div className="rounded-3xl border border-clay/30 bg-white p-6 shadow-card">
            <div className="aspect-[4/3] rounded-2xl bg-cream-100 animate-pulse" />
            <div className="mt-4 h-5 w-2/3 rounded bg-cream-100 animate-pulse" />
            <div className="mt-2 h-4 w-1/2 rounded bg-cream-100 animate-pulse" />
        </div>
    ),
});

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
export interface WorkshopClientProps {
    workshop: Workshop;
    similarWorkshops?: Workshop[];
    platformSettings?: PlatformSettingsType;
    todayIso: string;
}

export default function WorkshopClient({
    workshop,
    similarWorkshops = [],
    platformSettings,
    todayIso,
}: WorkshopClientProps) {
    const router = useRouter();
    const prefersReducedMotion = useReducedMotion();
    const { user, session } = useAuth();
    const toast = useToast();

    const [guests, setGuests] = useState(2);
    const [activeImage, setActiveImage] = useState(0);
    const [isSaved, setIsSaved] = useState(false);
    const [isMounted, setIsMounted] = useState(false);
    const [favoriteLoading, setFavoriteLoading] = useState(false);
    const [showVideo, setShowVideo] = useState(false);
    const [bookingLoading, setBookingLoading] = useState(false);
    const [holdError, setHoldError] = useState<string | null>(null);
    const [couponCode, setCouponCode] = useState("");
    const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
    const [couponError, setCouponError] = useState<string | null>(null);
    const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);
    const [showCouponInput, setShowCouponInput] = useState(false);
    const [couponSubtotalSnapshot, setCouponSubtotalSnapshot] = useState<number | null>(null);
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

    // Waitlist state
    const [showWaitlistModal, setShowWaitlistModal] = useState(false);
    const [waitlistEmail, setWaitlistEmail] = useState("");
    const [waitlistLoading, setWaitlistLoading] = useState(false);
    const [waitlistError, setWaitlistError] = useState<string | null>(null);
    const [waitlistSuccess, setWaitlistSuccess] = useState(false);

    const todayDate = new Date(`${todayIso}T00:00:00.000Z`);
    const workshopDateTime = getWorkshopDateTime(workshop.date, workshop.time);

    const isPastWorkshop = (() => {
        if (!workshopDateTime) {
            return workshop.date < todayIso;
        }
        return workshopDateTime.getTime() < Date.now();
    })();
    const isBookingClosed = isPastWorkshop || isBookingClosedNow(workshop.date, workshop.time);
    const availableSeatCount = liveAvailableSeatCount ?? workshop.seatsRemaining;
    const isSoldOut = availableSeatCount <= 0;

    // Early Bird Offer Calculation
    const ebOffer = platformSettings?.early_bird_offer;
    const isEbActive = ebOffer?.enabled && ebOffer.discount_value > 0;
    const workshopDate = new Date(workshop.date);
    const daysUntilWorkshop = Math.ceil(
        (workshopDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    const isEbEligible = Boolean(isEbActive && daysUntilWorkshop >= (ebOffer.days_before || 0));

    let earlyBirdDiscountPerGuest = 0;
    if (isEbEligible && ebOffer) {
        if (ebOffer.discount_type === "percentage") {
            earlyBirdDiscountPerGuest = Math.floor((workshop.price * ebOffer.discount_value) / 100);
        } else {
            earlyBirdDiscountPerGuest = ebOffer.discount_value;
        }
    }

    const currentPricePerGuest = workshop.price - earlyBirdDiscountPerGuest;
    const subtotal = currentPricePerGuest * guests;
    const couponDiscountAmount = appliedCoupon
        ? appliedCoupon.type === "percentage"
            ? subtotal * (appliedCoupon.discount / 100)
            : appliedCoupon.discount
        : 0;
    const serviceFee = platformSettings?.service_fee ?? 99;
    const total = Math.max(0, subtotal - couponDiscountAmount) + serviceFee;

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
                item.date >= todayIso &&
                (item.category === workshop.category || item.city === workshop.city)
        )
        .slice(0, 3);

    const accessToken = session?.access_token ?? null;
    const formattedWorkshopTime = (() => {
        if (!workshop.time) {
            return "Time will be shared soon";
        }

        try {
            const nextValue = formatTime(workshop.time);
            return nextValue === "Invalid Date" ? workshop.time : nextValue;
        } catch {
            return workshop.time;
        }
    })();

    useEffect(() => {
        setIsMounted(true);
    }, []);

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
                        setCanLeaveFeedback(Boolean(feedbackResult.canLeaveFeedback));
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
                    if (!cancelled) {
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
    }, [accessToken, isPastWorkshop, workshop.id]);

    useEffect(() => {
        setLiveAvailableSeatCount(null);
        setWaitlistSuccess(false);
        setShowWaitlistModal(false);
    }, [workshop.id]);

    useEffect(() => {
        if (!appliedCoupon || couponSubtotalSnapshot === subtotal) {
            return;
        }

        setCouponCode(appliedCoupon.code);
        setAppliedCoupon(null);
        setCouponSubtotalSnapshot(null);
        setShowCouponInput(true);
        setCouponError("Guest count changed. Please reapply your coupon.");
    }, [appliedCoupon, couponSubtotalSnapshot, subtotal]);

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
            ? (document.querySelector('[role="dialog"][aria-label]') as HTMLElement | null)
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

    const handleApplyCoupon = async () => {
        const nextCode = couponCode.trim();
        if (!nextCode) {
            return;
        }

        setIsApplyingCoupon(true);
        setCouponError(null);

        try {
            const response = await fetch("/api/coupons/validate", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
                },
                body: JSON.stringify({
                    code: nextCode,
                    workshopId: workshop.id,
                    subtotal,
                }),
            });
            const data = await response.json();

            if (response.ok && data.valid) {
                setAppliedCoupon({
                    code: nextCode.toUpperCase(),
                    discount: data.discount,
                    type: data.type,
                });
                setCouponSubtotalSnapshot(subtotal);
                setCouponCode("");
                setCouponError(null);
                setShowCouponInput(false);
                return;
            }

            setAppliedCoupon(null);
            setCouponSubtotalSnapshot(null);
            setCouponError(data.message || "Invalid or expired coupon code.");
        } catch {
            setAppliedCoupon(null);
            setCouponSubtotalSnapshot(null);
            setCouponError("Failed to apply coupon. Please try again.");
        } finally {
            setIsApplyingCoupon(false);
        }
    };

    const handleRemoveCoupon = () => {
        setAppliedCoupon(null);
        setCouponSubtotalSnapshot(null);
        setCouponCode("");
        setCouponError(null);
        setShowCouponInput(false);
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
            if (appliedCoupon?.code) {
                bookingParams.set("coupon", appliedCoupon.code);
            }
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
        <div className="min-h-full pb-44 min-[900px]:pb-0">
            <div className="pt-20 sm:pt-24">
                <div className="section-padding mb-4">
                    <motion.nav
                        variants={prefersReducedMotion ? undefined : fadeInUp}
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
                    <div className="grid grid-cols-1 items-start gap-8 min-[900px]:grid-cols-[minmax(0,1fr),320px] xl:grid-cols-[minmax(0,1fr),380px] xl:gap-12">
                        {/* ═══ LEFT COLUMN ═══ */}
                        <div>
                            <WorkshopGallery
                                workshop={workshop}
                                activeImage={activeImage}
                                setActiveImage={setActiveImage}
                                showVideo={showVideo}
                                setShowVideo={setShowVideo}
                                isSaved={isSaved}
                                favoriteLoading={favoriteLoading}
                                onToggleFavorite={handleToggleFavorite}
                            />

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
                                <div className="mt-4 grid grid-cols-2 gap-3 min-[900px]:hidden">
                                    <div className="rounded-2xl border border-clay/40 bg-white/95 px-4 py-3 shadow-soft">
                                        <p className="text-[10px] font-inter font-bold uppercase tracking-[0.18em] text-dark-muted">
                                            Price
                                        </p>
                                        <div className="mt-1 flex items-baseline gap-1.5">
                                            <span className="font-playfair text-2xl font-bold text-dark">
                                                {formatCurrency(currentPricePerGuest)}
                                            </span>
                                            <span className="text-xs font-inter text-dark-muted">
                                                / person
                                            </span>
                                        </div>
                                        {isEbEligible && (
                                            <p className="mt-1 text-[11px] font-inter text-emerald-700">
                                                Was {formatCurrency(workshop.price)}
                                            </p>
                                        )}
                                    </div>
                                    <div className="rounded-2xl border border-clay/40 bg-white/95 px-4 py-3 shadow-soft">
                                        <p className="flex items-center gap-1.5 text-[10px] font-inter font-bold uppercase tracking-[0.18em] text-dark-muted">
                                            <Calendar className="h-3.5 w-3.5" />
                                            Date
                                        </p>
                                        <p className="mt-1 text-sm font-inter font-semibold text-dark">
                                            {formatDate(workshop.date)}
                                        </p>
                                        <p className="mt-1 text-[11px] font-inter text-dark-muted">
                                            {workshop.location}
                                        </p>
                                    </div>
                                    <div className="rounded-2xl border border-clay/40 bg-white/95 px-4 py-3 shadow-soft">
                                        <p className="flex items-center gap-1.5 text-[10px] font-inter font-bold uppercase tracking-[0.18em] text-dark-muted">
                                            <Clock className="h-3.5 w-3.5" />
                                            Time
                                        </p>
                                        <p className="mt-1 text-sm font-inter font-semibold text-dark">
                                            {formattedWorkshopTime}
                                        </p>
                                        <p className="mt-1 text-[11px] font-inter text-dark-muted">
                                            {workshop.duration}
                                        </p>
                                    </div>
                                    <div className="rounded-2xl border border-clay/40 bg-white/95 px-4 py-3 shadow-soft">
                                        <p className="flex items-center gap-1.5 text-[10px] font-inter font-bold uppercase tracking-[0.18em] text-dark-muted">
                                            <Tag className="h-3.5 w-3.5" />
                                            Seats
                                        </p>
                                        <p
                                            className={`mt-1 text-sm font-inter font-semibold ${
                                                isSoldOut || isBookingClosed
                                                    ? "text-red-700"
                                                    : "text-emerald-700"
                                            }`}
                                        >
                                            {seatAvailabilityLabel}
                                        </p>
                                    </div>
                                </div>
                                {!isPastWorkshop && (
                                    <div className="mt-4 min-[900px]:hidden">
                                        {isBookingClosed ? (
                                            <button
                                                type="button"
                                                disabled
                                                className="w-full rounded-full bg-gray-100 px-5 py-3.5 text-sm font-inter font-semibold text-dark-muted cursor-not-allowed"
                                            >
                                                Booking Closed
                                            </button>
                                        ) : isSoldOut ? (
                                            <button
                                                type="button"
                                                onClick={() => setShowWaitlistModal(true)}
                                                className="btn-secondary w-full !py-3.5 text-sm"
                                            >
                                                Join Waitlist
                                            </button>
                                        ) : user ? (
                                            <button
                                                type="button"
                                                onClick={handleBooking}
                                                disabled={bookingLoading}
                                                className="btn-primary w-full !py-3.5 text-sm disabled:opacity-60"
                                            >
                                                {bookingLoading ? "Reserving..." : "Reserve Spot"}
                                            </button>
                                        ) : (
                                            <Link
                                                href={loginRedirectHref}
                                                className="btn-primary block w-full text-center !py-3.5 text-sm"
                                            >
                                                Log in to Reserve
                                            </Link>
                                        )}
                                    </div>
                                )}
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
                        <div className="hidden min-[900px]:block min-[900px]:self-start">
                            {isPastWorkshop ? (
                                <WorkshopPastEventSidebar
                                    workshopDate={workshop.date}
                                    formattedWorkshopTime={formattedWorkshopTime}
                                    workshopLocation={workshop.location}
                                    workshopCity={workshop.city}
                                    workshopRating={workshop.rating}
                                    workshopReviewCount={workshop.reviewCount}
                                    feedbackHighlight={workshop.feedbackHighlight}
                                    feedbackAuthor={workshop.feedbackAuthor}
                                    notifyState={notifyState}
                                    notifyLoadingMode={notifyLoadingMode}
                                    notifyMessage={notifyMessage}
                                    notifyError={notifyError}
                                    onPastNotify={handlePastNotify}
                                    userFeedback={userFeedback}
                                    isEditingFeedback={isEditingFeedback}
                                    canLeaveFeedback={canLeaveFeedback}
                                    feedbackDraft={feedbackDraft}
                                    setFeedbackDraft={setFeedbackDraft}
                                    feedbackRating={feedbackRating}
                                    setFeedbackRating={setFeedbackRating}
                                    feedbackPhotos={feedbackPhotos}
                                    feedbackUploading={feedbackUploading}
                                    feedbackLoading={feedbackLoading}
                                    feedbackError={feedbackError}
                                    feedbackMessage={feedbackMessage}
                                    maxFeedbackPhotos={MAX_FEEDBACK_PHOTOS}
                                    onStartFeedbackEdit={handleStartFeedbackEdit}
                                    onCancelFeedbackEdit={handleCancelFeedbackEdit}
                                    onFeedbackSubmit={handleFeedbackSubmit}
                                    onFeedbackPhotoUpload={handleFeedbackPhotoUpload}
                                    onRemoveFeedbackPhoto={handleRemoveFeedbackPhoto}
                                />
                            ) : (
                                <WorkshopBookingSidebar
                                    workshopPrice={workshop.price}
                                    currentPricePerGuest={currentPricePerGuest}
                                    workshopDate={workshop.date}
                                    formattedWorkshopTime={formattedWorkshopTime}
                                    workshopLocation={workshop.location}
                                    maxSeats={workshop.maxSeats}
                                    guests={guests}
                                    setGuests={setGuests}
                                    availableSeatCount={availableSeatCount}
                                    seatAvailabilityLabel={seatAvailabilityLabel}
                                    isSoldOut={isSoldOut}
                                    isBookingClosed={isBookingClosed}
                                    isEbEligible={isEbEligible}
                                    subtotal={subtotal}
                                    serviceFee={serviceFee}
                                    total={total}
                                    appliedCoupon={appliedCoupon}
                                    couponDiscountAmount={couponDiscountAmount}
                                    couponCode={couponCode}
                                    setCouponCode={setCouponCode}
                                    couponError={couponError}
                                    setCouponError={setCouponError}
                                    showCouponInput={showCouponInput}
                                    setShowCouponInput={setShowCouponInput}
                                    isApplyingCoupon={isApplyingCoupon}
                                    onApplyCoupon={() => void handleApplyCoupon()}
                                    onRemoveCoupon={handleRemoveCoupon}
                                    user={user}
                                    bookingLoading={bookingLoading}
                                    holdError={holdError}
                                    loginRedirectHref={loginRedirectHref}
                                    onBooking={handleBooking}
                                    onShowWaitlist={() => setShowWaitlistModal(true)}
                                />
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══ SOLD OUT SUGGESTIONS ═══ */}
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

            {/* ═══ MOBILE PAST-EVENT PANEL ═══ */}
            {isPastWorkshop && (
                <div className="section-padding mt-8 min-[900px]:hidden">
                    <WorkshopPastEventSidebar
                        workshopDate={workshop.date}
                        formattedWorkshopTime={formattedWorkshopTime}
                        workshopLocation={workshop.location}
                        workshopCity={workshop.city}
                        workshopRating={workshop.rating}
                        workshopReviewCount={workshop.reviewCount}
                        feedbackHighlight={workshop.feedbackHighlight}
                        feedbackAuthor={workshop.feedbackAuthor}
                        notifyState={notifyState}
                        notifyLoadingMode={notifyLoadingMode}
                        notifyMessage={notifyMessage}
                        notifyError={notifyError}
                        onPastNotify={handlePastNotify}
                        userFeedback={userFeedback}
                        isEditingFeedback={isEditingFeedback}
                        canLeaveFeedback={canLeaveFeedback}
                        feedbackDraft={feedbackDraft}
                        setFeedbackDraft={setFeedbackDraft}
                        feedbackRating={feedbackRating}
                        setFeedbackRating={setFeedbackRating}
                        feedbackPhotos={feedbackPhotos}
                        feedbackUploading={feedbackUploading}
                        feedbackLoading={feedbackLoading}
                        feedbackError={feedbackError}
                        feedbackMessage={feedbackMessage}
                        maxFeedbackPhotos={MAX_FEEDBACK_PHOTOS}
                        onStartFeedbackEdit={handleStartFeedbackEdit}
                        onCancelFeedbackEdit={handleCancelFeedbackEdit}
                        onFeedbackSubmit={handleFeedbackSubmit}
                        onFeedbackPhotoUpload={handleFeedbackPhotoUpload}
                        onRemoveFeedbackPhoto={handleRemoveFeedbackPhoto}
                    />
                </div>
            )}

            {/* ═══ RELATED WORKSHOPS SECTION ═══ */}
            {similarWorkshops && similarWorkshops.length > 0 && (
                <section className="section-padding py-16 lg:py-24 bg-cream-50">
                    <div className="max-w-[1200px] mx-auto">
                        <div className="flex items-center justify-between mb-8 sm:mb-12">
                            <div>
                                <h2 className="heading-md md:heading-lg text-dark mb-3">
                                    Similar Workshops You Might Love
                                </h2>
                                <p className="text-body text-dark-muted">
                                    Continue your creative journey with these related experiences.
                                </p>
                            </div>
                            <Link
                                href="/explore"
                                className="hidden sm:inline-flex items-center gap-2 text-sm font-inter font-semibold text-terracotta hover:text-terracotta/80 transition-colors"
                            >
                                Browse all <ArrowRight className="w-4 h-4" />
                            </Link>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
                            {similarWorkshops.slice(0, 3).map((ws, idx) => (
                                <WorkshopCard
                                    key={ws.id}
                                    workshop={ws}
                                    todayIso={todayIso}
                                    index={idx}
                                    animateOnScroll
                                />
                            ))}
                        </div>

                        <div className="mt-8 text-center sm:hidden">
                            <Link href="/explore" className="btn-secondary w-full">
                                Browse all workshops
                            </Link>
                        </div>
                    </div>
                </section>
            )}

            <Footer />

            {/* ═══ WAITLIST MODAL ═══ */}
            <WorkshopWaitlistModal
                showWaitlistModal={showWaitlistModal}
                setShowWaitlistModal={setShowWaitlistModal}
                waitlistEmail={waitlistEmail}
                setWaitlistEmail={setWaitlistEmail}
                waitlistLoading={waitlistLoading}
                waitlistError={waitlistError}
                setWaitlistError={setWaitlistError}
                waitlistSuccess={waitlistSuccess}
                onJoinWaitlist={handleJoinWaitlist}
            />

            {/* ═══ MOBILE STICKY BOOKING BAR ═══ */}
            <WorkshopMobileBookingBar
                isPastWorkshop={isPastWorkshop}
                isBookingClosed={isBookingClosed}
                isSoldOut={isSoldOut}
                isEbEligible={isEbEligible}
                workshopPrice={workshop.price}
                currentPricePerGuest={currentPricePerGuest}
                workshopDate={workshop.date}
                formattedWorkshopTime={formattedWorkshopTime}
                seatAvailabilityLabel={seatAvailabilityLabel}
                user={user}
                bookingLoading={bookingLoading}
                holdError={holdError}
                loginRedirectHref={loginRedirectHref}
                isMounted={isMounted}
                onBooking={handleBooking}
                onShowWaitlist={() => setShowWaitlistModal(true)}
            />
        </div>
    );
}
