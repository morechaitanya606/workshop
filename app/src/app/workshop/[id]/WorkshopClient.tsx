"use client";

import { useEffect, useState } from "react";
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
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import MobileNav from "@/components/MobileNav";
import { useToast } from "@/components/ToastProvider";
import type { Workshop } from "@/lib/data";
import {
    addFavorite,
    createBookingHold,
    getFavorites,
    getWorkshopFeedback,
    getWorkshopNotifications,
    isApiClientError,
    removeFavorite,
    submitWorkshopFeedback,
    toApiErrorMessage,
    updateWorkshopNotifications,
} from "@/lib/api-client";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { trackEvent } from "@/lib/analytics";
import {
    fadeIn,
    fadeInUp,
    quickTransition,
    revealViewport,
    slideInRight,
    standardTransition,
} from "@/lib/motion-presets";
import { isDirectVideoFileUrl } from "@/lib/workshop-media";

export default function WorkshopClient({ workshop }: { workshop: Workshop }) {
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

    const today = new Date().toISOString().slice(0, 10);
    const workshopDateTime = new Date(`${workshop.date}T${workshop.time || "00:00"}:00`);

    const isPastWorkshop = (() => {
        if (Number.isNaN(workshopDateTime.getTime())) {
            return workshop.date < today;
        }
        return workshopDateTime.getTime() < Date.now();
    })();
    const isDirectVideoFile = isDirectVideoFileUrl(workshop.videoUrl);
    const accessToken = session?.access_token ?? null;

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
        if (!isPastWorkshop) return;
        if (!accessToken) {
            setNotifyState({ similar: false, creator: false });
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
                        if (feedbackResult.feedback?.comment) {
                            setFeedbackDraft(feedbackResult.feedback.comment);
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

    const serviceFee = 99;
    const subtotal = workshop.price * guests;
    const total = subtotal + serviceFee;
    const locationQuery = `${workshop.location}, ${workshop.city}`.trim();
    const encodedLocationQuery = encodeURIComponent(locationQuery);
    const mapEmbedUrl = `https://www.google.com/maps?q=${encodedLocationQuery}&output=embed`;
    const mapOpenUrl = `https://www.google.com/maps/search/?api=1&query=${encodedLocationQuery}`;
    const workshopPath = `/workshop/${workshop.id}`;
    const loginRedirectHref = `/auth/login?redirect=${encodeURIComponent(workshopPath)}`;

    const handleBooking = async () => {
        setHoldError(null);
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
            trackEvent("booking_started", {
                workshopId: workshop.id,
                guests,
                source: "workshop_detail",
            });
            toast.success(
                "Seat hold created",
                "Your seats are reserved. Continue checkout to confirm booking."
            );
            router.push(`/booking?workshop=${workshop.id}&guests=${guests}&hold=${holdId}`);
        } catch (error) {
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
            });
            setFeedbackDraft(result.feedback?.comment || trimmedFeedback);
            trackEvent("feedback_submitted", {
                workshopId: workshop.id,
            });
            setFeedbackMessage(result.message || "Thanks for sharing your feedback.");
            toast.success("Feedback saved", "Thanks for sharing your experience.");
        } catch (error) {
            const message = toApiErrorMessage(error, "Unable to save feedback.");
            setFeedbackError(message);
            toast.error("Feedback not saved", message);
        } finally {
            setFeedbackLoading(false);
        }
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
                        <Link href="/explore" className="hover:text-terracotta transition-colors">
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
                                <div className="grid grid-cols-1 sm:grid-cols-[2fr,1fr] gap-2 rounded-2xl overflow-hidden">
                                    <div className="relative aspect-[4/3] sm:aspect-auto sm:row-span-2">
                                        <Image
                                            src={workshop.galleryImages[activeImage]}
                                            alt={workshop.title}
                                            fill
                                            priority
                                            className="object-cover"
                                            sizes="(max-width: 1024px) 100vw, 60vw"
                                        />
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
                                    {workshop.galleryImages.slice(1, 3).map((img, i) => (
                                        <div
                                            key={i}
                                            className="relative aspect-[4/3] cursor-pointer hidden sm:block"
                                            onClick={() => setActiveImage(i + 1)}
                                        >
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
                                                    <Grid3X3 className="w-3.5 h-3.5" /> View All
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                <div className="absolute top-4 right-4 flex gap-2 sm:hidden">
                                    <button className="p-2.5 bg-white/90 backdrop-blur-sm rounded-full shadow-soft">
                                        <Share2 className="w-4 h-4 text-dark" />
                                    </button>
                                    <button
                                        onClick={handleToggleFavorite}
                                        disabled={favoriteLoading}
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
                                    onClick={() => setShowVideo(false)}
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
                                            onClick={() => setShowVideo(false)}
                                            className="absolute -top-12 right-0 text-white text-sm font-inter hover:text-terracotta transition-colors"
                                        >
                                            Close ×
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
                                <h1 className="heading-lg mb-3">{workshop.title}</h1>
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
                                </div>
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
                            </motion.div>

                            <hr className="my-8 border-clay/30" />

                            <motion.div
                                variants={prefersReducedMotion ? undefined : fadeInUp}
                                initial={prefersReducedMotion ? undefined : "hidden"}
                                whileInView={prefersReducedMotion ? undefined : "visible"}
                                viewport={prefersReducedMotion ? undefined : revealViewport}
                                transition={
                                    prefersReducedMotion ? { duration: 0 } : quickTransition
                                }
                                className="bg-white rounded-2xl p-6 shadow-soft"
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
                                                        href={workshop.hostSocialLinks.instagram}
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

                            <hr className="my-8 border-clay/30" />

                            <motion.div
                                variants={prefersReducedMotion ? undefined : fadeInUp}
                                initial={prefersReducedMotion ? undefined : "hidden"}
                                whileInView={prefersReducedMotion ? undefined : "visible"}
                                viewport={prefersReducedMotion ? undefined : revealViewport}
                                transition={
                                    prefersReducedMotion ? { duration: 0 } : quickTransition
                                }
                            >
                                <h2 className="heading-sm mb-4">About this experience</h2>
                                <div className="text-body whitespace-pre-line">
                                    {workshop.description}
                                </div>
                            </motion.div>

                            <hr className="my-8 border-clay/30" />

                            <motion.div
                                variants={prefersReducedMotion ? undefined : fadeInUp}
                                initial={prefersReducedMotion ? undefined : "hidden"}
                                whileInView={prefersReducedMotion ? undefined : "visible"}
                                viewport={prefersReducedMotion ? undefined : revealViewport}
                                transition={
                                    prefersReducedMotion ? { duration: 0 } : quickTransition
                                }
                            >
                                <h2 className="heading-sm mb-4">What you will learn</h2>
                                <ul className="space-y-3">
                                    {workshop.whatYouLearn.map((item, i) => (
                                        <li key={i} className="flex items-start gap-3 text-body">
                                            <Check className="w-5 h-5 text-terracotta flex-shrink-0 mt-0.5" />{" "}
                                            {item}
                                        </li>
                                    ))}
                                </ul>
                            </motion.div>

                            <hr className="my-8 border-clay/30" />

                            <motion.div
                                variants={prefersReducedMotion ? undefined : fadeInUp}
                                initial={prefersReducedMotion ? undefined : "hidden"}
                                whileInView={prefersReducedMotion ? undefined : "visible"}
                                viewport={prefersReducedMotion ? undefined : revealViewport}
                                transition={
                                    prefersReducedMotion ? { duration: 0 } : quickTransition
                                }
                            >
                                <h2 className="heading-sm mb-4">{"What's included"}</h2>
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

                            <hr className="my-8 border-clay/30" />

                            <motion.div
                                variants={prefersReducedMotion ? undefined : fadeInUp}
                                initial={prefersReducedMotion ? undefined : "hidden"}
                                whileInView={prefersReducedMotion ? undefined : "visible"}
                                viewport={prefersReducedMotion ? undefined : revealViewport}
                                transition={
                                    prefersReducedMotion ? { duration: 0 } : quickTransition
                                }
                            >
                                <h2 className="heading-sm mb-4">{"Where you'll be"}</h2>
                                <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-soft">
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
                                                {workshop.city} &bull; Exact address sent upon
                                                booking
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
                                    className="sticky top-28 bg-white rounded-2xl shadow-card p-6 border border-gray-100"
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

                                    {canLeaveFeedback && (
                                        <div className="mt-6 pt-5 border-t border-gray-100">
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
                                            <button
                                                onClick={handleFeedbackSubmit}
                                                disabled={feedbackLoading}
                                                className="mt-3 w-full rounded-full border border-terracotta text-terracotta font-inter font-semibold text-sm px-4 py-2.5 hover:bg-terracotta hover:text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                            >
                                                {feedbackLoading
                                                    ? "Submitting..."
                                                    : "Submit Feedback"}
                                            </button>
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
                                    className="sticky top-28 bg-white rounded-2xl shadow-card p-6 border border-gray-100"
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
                                        {workshop.seatsRemaining <= 5 && (
                                            <span className="text-xs font-inter font-bold text-terracotta flex items-center gap-1 bg-terracotta/10 px-2.5 py-1 rounded-full">
                                                🔥 Selling Fast
                                            </span>
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

                                    <div className="mb-6">
                                        <label className="block text-[10px] font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                                            Guests
                                        </label>
                                        <div className="bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between">
                                            <button
                                                onClick={() => setGuests(Math.max(1, guests - 1))}
                                                className="w-9 h-9 rounded-lg border border-gray-300 flex items-center justify-center hover:border-terracotta hover:text-terracotta transition-colors"
                                            >
                                                <Minus className="w-4 h-4" />
                                            </button>
                                            <span className="text-lg font-inter font-bold text-dark">
                                                {guests}
                                            </span>
                                            <button
                                                onClick={() =>
                                                    setGuests(
                                                        Math.min(
                                                            workshop.seatsRemaining,
                                                            guests + 1
                                                        )
                                                    )
                                                }
                                                className="w-9 h-9 rounded-lg border border-gray-300 flex items-center justify-center hover:border-terracotta hover:text-terracotta transition-colors"
                                            >
                                                <Plus className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="border-t border-gray-100 pt-4 space-y-3 mb-6">
                                        <div className="flex justify-between text-sm font-inter">
                                            <span className="text-dark-secondary">
                                                {formatCurrency(workshop.price)} &times; {guests}{" "}
                                                guests
                                            </span>
                                            <span className="text-dark font-medium">
                                                {formatCurrency(subtotal)}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-sm font-inter">
                                            <span className="text-dark-secondary">Service fee</span>
                                            <span className="text-dark font-medium">
                                                {formatCurrency(serviceFee)}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-base font-inter font-bold pt-3 border-t border-gray-100">
                                            <span className="text-dark">Total</span>
                                            <span className="text-dark">
                                                {formatCurrency(total)}
                                            </span>
                                        </div>
                                    </div>

                                    {user ? (
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
                                        {user
                                            ? "You won't be charged yet."
                                            : "You need to be logged in to book."}
                                    </p>
                                    {holdError && (
                                        <p className="text-center text-xs font-inter text-red-600 mt-2">
                                            {holdError}
                                        </p>
                                    )}

                                    <div className="flex items-center justify-center gap-5 mt-5 pt-4 border-t border-gray-100">
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

                        {canLeaveFeedback && (
                            <div className="mt-5 pt-4 border-t border-gray-100">
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
                                <button
                                    onClick={handleFeedbackSubmit}
                                    disabled={feedbackLoading}
                                    className="mt-3 w-full rounded-full border border-terracotta text-terracotta font-inter font-semibold text-sm px-4 py-2.5 hover:bg-terracotta hover:text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                    {feedbackLoading ? "Submitting..." : "Submit Feedback"}
                                </button>
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
                        </div>
                        {user ? (
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
                </div>
            )}

            <Footer />
            <MobileNav />
        </main>
    );
}
