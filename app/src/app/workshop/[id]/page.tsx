"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
    ArrowLeft,
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
    ExternalLink,
    Loader2,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import MobileNav from "@/components/MobileNav";
import { mockWorkshops } from "@/lib/data";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

export default function WorkshopDetailPage({
    params,
}: {
    params: { id: string };
}) {
    const { id } = params;
    const router = useRouter();
    const { user, session } = useAuth();
    const workshop = mockWorkshops.find((w) => w.id === id);
    const [guests, setGuests] = useState(2);
    const [activeImage, setActiveImage] = useState(0);
    const [isSaved, setIsSaved] = useState(false);
    const [showVideo, setShowVideo] = useState(false);
    const [bookingLoading, setBookingLoading] = useState(false);
    const [holdError, setHoldError] = useState<string | null>(null);

    if (!workshop) {
        return (
            <main className="min-h-screen bg-cream">
                <Navbar />
                <div className="pt-32 pb-20 section-padding text-center">
                    <h1 className="heading-lg mb-3">Workshop not found</h1>
                    <p className="text-body text-dark-muted mb-8">
                        This workshop may have been removed or the link is incorrect.
                    </p>
                    <Link href="/explore" className="btn-primary">
                        Back to Explore
                    </Link>
                </div>
                <Footer />
                <MobileNav />
            </main>
        );
    }

    const serviceFee = 99;
    const subtotal = workshop.price * guests;
    const total = subtotal + serviceFee;

    const handleBooking = async () => {
        setHoldError(null);
        if (!user) {
            const redirectPath = encodeURIComponent(`/workshop/${workshop.id}`);
            router.push(`/auth/login?redirect=${redirectPath}`);
            return;
        }

        if (!session?.access_token) {
            setHoldError("Your session expired. Please log in again.");
            return;
        }

        setBookingLoading(true);
        try {
            const response = await fetch("/api/bookings/hold", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                    workshopId: workshop.id,
                    guests,
                }),
            });

            const result = await response.json();
            if (!response.ok) {
                setHoldError(result.error || "Unable to reserve seats right now.");
                return;
            }

            const holdId = result?.hold?.id;
            if (!holdId) {
                setHoldError("Seat hold was created but could not be verified.");
                return;
            }

            router.push(
                `/booking?workshop=${workshop.id}&guests=${guests}&hold=${holdId}`
            );
        } catch {
            setHoldError("Unable to reserve seats. Please try again.");
        } finally {
            setBookingLoading(false);
        }
    };

    return (
        <main className="min-h-screen pb-24 md:pb-0">
            <Navbar />

            <div className="pt-20 sm:pt-24">
                {/* Breadcrumb */}
                <div className="section-padding mb-4">
                    <motion.nav
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex items-center gap-2 text-sm font-inter text-dark-muted"
                    >
                        <Link href="/" className="hover:text-terracotta transition-colors">
                            Home
                        </Link>
                        <ChevronRight className="w-3.5 h-3.5" />
                        <Link
                            href="/explore"
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
                            {/* Image Gallery */}
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.6 }}
                                className="relative"
                            >
                                <div className="grid grid-cols-1 sm:grid-cols-[2fr,1fr] gap-2 rounded-2xl overflow-hidden">
                                    {/* Main image */}
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
                                                <Play className="w-4 h-4 text-terracotta fill-terracotta" />
                                                Watch Video
                                            </button>
                                        )}
                                    </div>
                                    {/* Thumbnails */}
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
                                                    <Grid3X3 className="w-3.5 h-3.5" />
                                                    View All
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                {/* Action buttons */}
                                <div className="absolute top-4 right-4 flex gap-2 sm:hidden">
                                    <button className="p-2.5 bg-white/90 backdrop-blur-sm rounded-full shadow-soft">
                                        <Share2 className="w-4 h-4 text-dark" />
                                    </button>
                                    <button
                                        onClick={() => setIsSaved(!isSaved)}
                                        className="p-2.5 bg-white/90 backdrop-blur-sm rounded-full shadow-soft"
                                    >
                                        <Heart
                                            className={`w-4 h-4 ${isSaved
                                                ? "text-terracotta fill-terracotta"
                                                : "text-dark"
                                                }`}
                                        />
                                    </button>
                                </div>
                            </motion.div>

                            {/* Video Modal */}
                            {showVideo && workshop.videoUrl && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4"
                                    onClick={() => setShowVideo(false)}
                                >
                                    <motion.div
                                        initial={{ scale: 0.9 }}
                                        animate={{ scale: 1 }}
                                        className="relative w-full max-w-4xl aspect-video rounded-2xl overflow-hidden"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <iframe
                                            src={workshop.videoUrl}
                                            title={`${workshop.title} video`}
                                            className="w-full h-full"
                                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                            allowFullScreen
                                        />
                                        <button
                                            onClick={() => setShowVideo(false)}
                                            className="absolute -top-12 right-0 text-white text-sm font-inter hover:text-terracotta transition-colors"
                                        >
                                            Close ×
                                        </button>
                                    </motion.div>
                                </motion.div>
                            )}

                            {/* Title & Meta */}
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.6, delay: 0.15 }}
                                className="mt-6"
                            >
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
                                        <MapPin className="w-4 h-4 text-dark-muted" />
                                        {workshop.location}, {workshop.city}
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <Clock className="w-4 h-4 text-dark-muted" />
                                        {workshop.duration}
                                    </div>
                                </div>

                                {/* Workshop social links */}
                                {workshop.socialLinks && (
                                    <div className="flex items-center gap-3 mt-4">
                                        {workshop.socialLinks.instagram && (
                                            <a href={workshop.socialLinks.instagram} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm font-inter text-dark-muted hover:text-terracotta transition-colors bg-white px-3 py-1.5 rounded-lg border border-gray-100">
                                                <Instagram className="w-4 h-4" />
                                                <span>Instagram</span>
                                            </a>
                                        )}
                                        {workshop.socialLinks.youtube && (
                                            <a href={workshop.socialLinks.youtube} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm font-inter text-dark-muted hover:text-terracotta transition-colors bg-white px-3 py-1.5 rounded-lg border border-gray-100">
                                                <Youtube className="w-4 h-4" />
                                                <span>YouTube</span>
                                            </a>
                                        )}
                                        {workshop.socialLinks.website && (
                                            <a href={workshop.socialLinks.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm font-inter text-dark-muted hover:text-terracotta transition-colors bg-white px-3 py-1.5 rounded-lg border border-gray-100">
                                                <Globe className="w-4 h-4" />
                                                <span>Website</span>
                                            </a>
                                        )}
                                    </div>
                                )}
                            </motion.div>

                            <hr className="my-8 border-clay/30" />

                            {/* Host / Creator */}
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.5 }}
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
                                        {/* Host social links */}
                                        {workshop.hostSocialLinks && (
                                            <div className="flex items-center gap-2 mt-3">
                                                {workshop.hostSocialLinks.instagram && (
                                                    <a href={workshop.hostSocialLinks.instagram} target="_blank" rel="noopener noreferrer" className="p-2 bg-cream-100 rounded-lg hover:bg-terracotta/10 transition-colors">
                                                        <Instagram className="w-4 h-4 text-dark-muted" />
                                                    </a>
                                                )}
                                                {workshop.hostSocialLinks.youtube && (
                                                    <a href={workshop.hostSocialLinks.youtube} target="_blank" rel="noopener noreferrer" className="p-2 bg-cream-100 rounded-lg hover:bg-terracotta/10 transition-colors">
                                                        <Youtube className="w-4 h-4 text-dark-muted" />
                                                    </a>
                                                )}
                                                {workshop.hostSocialLinks.website && (
                                                    <a href={workshop.hostSocialLinks.website} target="_blank" rel="noopener noreferrer" className="p-2 bg-cream-100 rounded-lg hover:bg-terracotta/10 transition-colors flex items-center gap-1">
                                                        <Globe className="w-4 h-4 text-dark-muted" />
                                                    </a>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </motion.div>

                            <hr className="my-8 border-clay/30" />

                            {/* About */}
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.5 }}
                            >
                                <h2 className="heading-sm mb-4">About this experience</h2>
                                <div className="text-body whitespace-pre-line">
                                    {workshop.description}
                                </div>
                            </motion.div>

                            <hr className="my-8 border-clay/30" />

                            {/* What you will learn */}
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.5 }}
                            >
                                <h2 className="heading-sm mb-4">What you will learn</h2>
                                <ul className="space-y-3">
                                    {workshop.whatYouLearn.map((item, i) => (
                                        <li
                                            key={i}
                                            className="flex items-start gap-3 text-body"
                                        >
                                            <Check className="w-5 h-5 text-terracotta flex-shrink-0 mt-0.5" />
                                            {item}
                                        </li>
                                    ))}
                                </ul>
                            </motion.div>

                            <hr className="my-8 border-clay/30" />

                            {/* What is included */}
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.5 }}
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

                            {/* Where */}
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.5 }}
                            >
                                <h2 className="heading-sm mb-4">{"Where you'll be"}</h2>
                                <div className="bg-gray-100 rounded-2xl h-64 flex items-center justify-center relative overflow-hidden">
                                    <div className="absolute inset-0 opacity-20">
                                        <div
                                            className="w-full h-full"
                                            style={{
                                                backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23c76b4f' fill-opacity='0.15'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                                            }}
                                        />
                                    </div>
                                    <div className="text-center z-10">
                                        <MapPin className="w-8 h-8 text-terracotta mx-auto mb-2" />
                                        <p className="font-inter font-semibold text-dark">
                                            {workshop.location}
                                        </p>
                                        <p className="text-sm font-inter text-dark-muted mt-1">
                                            {workshop.city} &bull; Exact address sent upon booking
                                        </p>
                                    </div>
                                </div>
                            </motion.div>
                        </div>

                        {/* ═══ RIGHT COLUMN - BOOKING SIDEBAR ═══ */}
                        <div className="hidden lg:block">
                            <motion.div
                                initial={{ opacity: 0, x: 30 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.6, delay: 0.3 }}
                                className="sticky top-28 bg-white rounded-2xl shadow-card p-6 border border-gray-100"
                            >
                                {/* Price */}
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

                                {/* Date Selector */}
                                <div className="mb-4">
                                    <label className="block text-[10px] font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                                        Select Date
                                    </label>
                                    <div className="bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between cursor-pointer hover:border-terracotta/40 transition-colors">
                                        <div className="flex items-center gap-2">
                                            <Calendar className="w-4 h-4 text-dark-muted" />
                                            <span className="text-sm font-inter text-dark">
                                                {formatDate(workshop.date)} &bull; {workshop.time}
                                            </span>
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-dark-muted" />
                                    </div>
                                </div>

                                {/* Guest Counter */}
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
                                                    Math.min(workshop.seatsRemaining, guests + 1)
                                                )
                                            }
                                            className="w-9 h-9 rounded-lg border border-gray-300 flex items-center justify-center hover:border-terracotta hover:text-terracotta transition-colors"
                                        >
                                            <Plus className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>

                                {/* Price Breakdown */}
                                <div className="border-t border-gray-100 pt-4 space-y-3 mb-6">
                                    <div className="flex justify-between text-sm font-inter">
                                        <span className="text-dark-secondary">
                                            {formatCurrency(workshop.price)} &times; {guests} guests
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

                                {/* Reserve CTA */}
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
                                    ) : user ? (
                                        "Reserve Spot →"
                                    ) : (
                                        "Log in to Book →"
                                    )}
                                </button>

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

                                {/* Trust badges */}
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
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══ MOBILE STICKY BOOKING BAR ═══ */}
            <div className="fixed bottom-16 left-0 right-0 z-40 bg-white/95 backdrop-blur-xl border-t border-gray-100 px-4 py-3 lg:hidden safe-area-bottom">
                <div className="flex items-center justify-between">
                    <div>
                        <span className="font-playfair text-2xl font-bold text-dark">
                            {formatCurrency(workshop.price)}
                        </span>
                        <span className="text-sm font-inter text-dark-muted">
                            {" "}
                            / person
                        </span>
                    </div>
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
                        ) : user ? (
                            "Book My Spot"
                        ) : (
                            "Log in to Book"
                        )}
                    </button>
                </div>
                {holdError && (
                    <p className="text-center text-xs font-inter text-red-600 mt-2">
                        {holdError}
                    </p>
                )}
            </div>

            <Footer />
            <MobileNav />
        </main>
    );
}
