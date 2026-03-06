"use client";

import { useEffect, useState, Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import Script from "next/script";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
    ArrowLeft,
    Calendar,
    Clock,
    MapPin,
    Users,
    Shield,
    Check,
    Star,
    Loader2,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { mockWorkshops } from "@/lib/data";
import type { Workshop } from "@/lib/data";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

const SERVICE_FEE = 99;

type ConfirmedBooking = {
    id: string;
    total: number;
    workshop?: {
        title?: string;
        date?: string;
        time?: string;
        cover_image?: string;
    };
};

type RazorpayOrderResponse = {
    id: string;
    amount: number;
    currency: string;
    keyId: string;
    name?: string;
    description?: string;
    prefill?: {
        name?: string;
        email?: string;
        contact?: string;
    };
};

type RazorpaySuccessResponse = {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
};

type RazorpayOptions = {
    key: string;
    amount: number;
    currency: string;
    name: string;
    description?: string;
    order_id: string;
    prefill?: {
        name?: string;
        email?: string;
        contact?: string;
    };
    handler: (response: RazorpaySuccessResponse) => void;
    modal?: {
        ondismiss?: () => void;
    };
    theme?: {
        color?: string;
    };
};

type RazorpayInstance = {
    open: () => void;
    on: (event: string, handler: (response: unknown) => void) => void;
};

declare global {
    interface Window {
        Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
    }
}

function BookingContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user, session, loading } = useAuth();

    const workshopId = searchParams.get("workshop") || "";
    const holdId = searchParams.get("hold") || "";
    const guestsParam = Number.parseInt(searchParams.get("guests") || "1", 10);
    const guests = Number.isFinite(guestsParam) ? Math.max(1, guestsParam) : 1;

    const fallbackWorkshop =
        mockWorkshops.find((item) => item.id === workshopId) || null;
    const [workshop, setWorkshop] = useState<Workshop | null>(fallbackWorkshop);
    const [workshopLoading, setWorkshopLoading] = useState(Boolean(workshopId));
    const [isRazorpayReady, setIsRazorpayReady] = useState(false);

    const [step, setStep] = useState(1);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [confirmedBooking, setConfirmedBooking] = useState<ConfirmedBooking | null>(
        null
    );
    const [formData, setFormData] = useState({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        notes: "",
    });

    useEffect(() => {
        if (!loading && !user) {
            const redirectPath = encodeURIComponent(
                `/booking?workshop=${workshopId}&guests=${guests}${holdId ? `&hold=${holdId}` : ""}`
            );
            router.push(`/auth/login?redirect=${redirectPath}`);
        }
    }, [loading, user, router, workshopId, guests, holdId]);

    useEffect(() => {
        if (typeof window !== "undefined" && window.Razorpay) {
            setIsRazorpayReady(true);
        }
    }, []);

    useEffect(() => {
        if (!user) return;
        const fullName = user.user_metadata?.full_name || "";
        const [firstName, ...rest] = fullName.split(" ");
        setFormData((prev) => ({
            ...prev,
            firstName: prev.firstName || firstName || "",
            lastName: prev.lastName || rest.join(" ") || "",
            email: prev.email || user.email || "",
        }));
    }, [user]);

    useEffect(() => {
        let cancelled = false;
        const fetchWorkshop = async () => {
            if (!workshopId) {
                setWorkshopLoading(false);
                return;
            }

            try {
                const response = await fetch(`/api/workshops/${workshopId}`, {
                    cache: "no-store",
                });
                const result = await response.json();
                if (!cancelled && response.ok && result.workshop) {
                    setWorkshop(result.workshop as Workshop);
                }
            } catch {
                // fallback workshop is already set if available
            } finally {
                if (!cancelled) {
                    setWorkshopLoading(false);
                }
            }
        };

        fetchWorkshop();
        return () => {
            cancelled = true;
        };
    }, [workshopId]);

    const subtotal = (workshop?.price || 0) * guests;
    const total = subtotal + SERVICE_FEE;

    const handleCheckout = async () => {
        if (!workshop) return;
        setError(null);

        if (!holdId) {
            setError(
                "Seat hold is missing or expired. Please go back and reserve seats again."
            );
            return;
        }

        if (!session?.access_token) {
            setError("Your session expired. Please log in again.");
            return;
        }

        if (!isRazorpayReady || !window.Razorpay) {
            setError("Payment gateway is still loading. Please try again in a moment.");
            return;
        }

        setSubmitting(true);

        const checkoutPayload = {
            holdId,
            workshopId: workshop.id,
            firstName: formData.firstName,
            lastName: formData.lastName,
            email: formData.email,
            phone: formData.phone,
            notes: formData.notes,
        };

        try {
            const orderResponse = await fetch("/api/bookings/checkout", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify(checkoutPayload),
            });

            const orderResult = await orderResponse.json();
            if (!orderResponse.ok) {
                setError(orderResult.error || "Unable to initialize payment.");
                setSubmitting(false);
                return;
            }

            const order = orderResult.order as RazorpayOrderResponse | undefined;
            if (!order?.id || !order?.keyId) {
                setError("Payment order was not created correctly.");
                setSubmitting(false);
                return;
            }

            const RazorpayCheckout = window.Razorpay;
            if (!RazorpayCheckout) {
                setError("Razorpay checkout is unavailable right now.");
                setSubmitting(false);
                return;
            }

            const checkout = new RazorpayCheckout({
                key: order.keyId,
                amount: order.amount,
                currency: order.currency,
                name: order.name || "OnlyWorkshop",
                description: order.description || workshop.title,
                order_id: order.id,
                prefill: order.prefill,
                handler: async (payment) => {
                    try {
                        const confirmResponse = await fetch("/api/bookings/checkout", {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                Authorization: `Bearer ${session.access_token}`,
                            },
                            body: JSON.stringify({
                                ...checkoutPayload,
                                razorpayOrderId: payment.razorpay_order_id,
                                razorpayPaymentId: payment.razorpay_payment_id,
                                razorpaySignature: payment.razorpay_signature,
                            }),
                        });

                        const confirmResult = await confirmResponse.json();
                        if (!confirmResponse.ok) {
                            setError(
                                confirmResult.error ||
                                    "Payment succeeded, but booking confirmation failed."
                            );
                            return;
                        }

                        setConfirmedBooking(confirmResult.booking || null);
                        setStep(3);
                    } catch {
                        setError(
                            "Payment succeeded, but booking confirmation could not be completed."
                        );
                    } finally {
                        setSubmitting(false);
                    }
                },
                modal: {
                    ondismiss: () => {
                        setSubmitting(false);
                    },
                },
                theme: {
                    color: "#C76B4A",
                },
            });

            checkout.on("payment.failed", () => {
                setError("Payment failed. Please try again.");
                setSubmitting(false);
            });

            checkout.open();
        } catch {
            setError("Unable to start checkout right now. Please try again.");
            setSubmitting(false);
        }
    };

    const razorpayScript = (
        <Script
            src="https://checkout.razorpay.com/v1/checkout.js"
            strategy="afterInteractive"
            onLoad={() => setIsRazorpayReady(true)}
            onError={() => {
                setError(
                    "Failed to load Razorpay checkout. Refresh the page and try again."
                );
            }}
        />
    );

    if (loading || !user || workshopLoading) {
        return (
            <>
                {razorpayScript}
                <main className="min-h-screen flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-terracotta" />
                </main>
            </>
        );
    }

    if (!workshop) {
        return (
            <>
                {razorpayScript}
                <main className="min-h-screen bg-cream">
                    <Navbar />
                    <div className="pt-28 pb-16 section-padding text-center">
                        <h1 className="heading-lg mb-3">Workshop not found</h1>
                        <p className="text-body text-dark-muted mb-8">
                            The workshop in this booking link is unavailable.
                        </p>
                        <Link href="/explore" className="btn-primary">
                            Back to Explore
                        </Link>
                    </div>
                    <Footer />
                </main>
            </>
        );
    }

    if (step === 3) {
        const bookingWorkshopTitle = confirmedBooking?.workshop?.title || workshop.title;
        const bookingWorkshopDate = confirmedBooking?.workshop?.date || workshop.date;
        const bookingWorkshopTime = confirmedBooking?.workshop?.time || workshop.time;
        const bookingCover =
            confirmedBooking?.workshop?.cover_image || workshop.coverImage;

        return (
            <>
                {razorpayScript}
                <main className="min-h-screen bg-cream">
                    <Navbar />
                    <div className="pt-28 pb-16 section-padding">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="max-w-lg mx-auto text-center"
                        >
                            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                                <Check className="w-10 h-10 text-emerald-600" />
                            </div>
                            <h1 className="heading-lg mb-3">Booking Confirmed</h1>
                            <p className="text-body text-dark-muted mb-8">
                                Your booking for <strong>{bookingWorkshopTitle}</strong> is
                                confirmed.
                            </p>
                            <div className="bg-white rounded-2xl p-6 shadow-soft mb-8 text-left">
                                <div className="flex gap-4">
                                    <div className="relative w-20 h-20 rounded-xl overflow-hidden flex-shrink-0">
                                        <Image
                                            src={bookingCover}
                                            alt={bookingWorkshopTitle}
                                            fill
                                            className="object-cover"
                                        />
                                    </div>
                                    <div>
                                        <h3 className="font-playfair font-semibold text-dark">
                                            {bookingWorkshopTitle}
                                        </h3>
                                        <p className="text-sm font-inter text-dark-muted mt-1">
                                            {formatDate(bookingWorkshopDate)}{" "}
                                            <span aria-hidden>&middot;</span>{" "}
                                            {bookingWorkshopTime}
                                        </p>
                                        <p className="text-sm font-inter text-dark-muted">
                                            {guests} guests{" "}
                                            <span aria-hidden>&middot;</span>{" "}
                                            {formatCurrency(confirmedBooking?.total || total)}
                                        </p>
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-3 justify-center">
                                <Link href="/dashboard" className="btn-primary">
                                    View My Bookings
                                </Link>
                                <Link href="/explore" className="btn-secondary">
                                    Explore More
                                </Link>
                            </div>
                        </motion.div>
                    </div>
                </main>
            </>
        );
    }

    return (
        <>
            {razorpayScript}
            <main className="min-h-screen bg-cream">
                <Navbar />
                <div className="pt-24 pb-16 section-padding">
                    <Link
                        href={`/workshop/${workshop.id}`}
                        className="inline-flex items-center gap-2 text-sm font-inter text-dark-muted hover:text-terracotta transition-colors mb-6"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back to workshop
                    </Link>

                    {!holdId && (
                        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-inter">
                            Seat hold is missing. Please go back and click
                            &quot;Reserve Spot&quot; again.
                        </div>
                    )}
                    {error && (
                        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-inter">
                            {error}
                        </div>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-[1fr,380px] gap-8 lg:gap-12">
                        <div className="bg-white rounded-2xl p-6 shadow-soft space-y-5">
                            <h2 className="heading-sm">Guest Information</h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <input
                                    value={formData.firstName}
                                    onChange={(event) =>
                                        setFormData({
                                            ...formData,
                                            firstName: event.target.value,
                                        })
                                    }
                                    placeholder="First name"
                                    className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta"
                                />
                                <input
                                    value={formData.lastName}
                                    onChange={(event) =>
                                        setFormData({
                                            ...formData,
                                            lastName: event.target.value,
                                        })
                                    }
                                    placeholder="Last name"
                                    className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta"
                                />
                            </div>
                            <input
                                value={formData.email}
                                onChange={(event) =>
                                    setFormData({
                                        ...formData,
                                        email: event.target.value,
                                    })
                                }
                                placeholder="Email"
                                className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta"
                            />
                            <input
                                value={formData.phone}
                                onChange={(event) =>
                                    setFormData({
                                        ...formData,
                                        phone: event.target.value,
                                    })
                                }
                                placeholder="Phone number (optional)"
                                className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta"
                            />
                            <textarea
                                value={formData.notes}
                                onChange={(event) =>
                                    setFormData({
                                        ...formData,
                                        notes: event.target.value,
                                    })
                                }
                                rows={3}
                                placeholder="Special requests (optional)"
                                className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta resize-none"
                            />
                            <button
                                onClick={handleCheckout}
                                disabled={
                                    submitting ||
                                    !isRazorpayReady ||
                                    !formData.firstName ||
                                    !formData.lastName ||
                                    !formData.email ||
                                    !holdId
                                }
                                className="btn-primary w-full sm:w-auto !py-3.5 !px-8 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {submitting ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        Processing...
                                    </>
                                ) : !isRazorpayReady ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        Loading payment...
                                    </>
                                ) : (
                                    <>Confirm & Pay {formatCurrency(total)}</>
                                )}
                            </button>
                        </div>

                        <div className="hidden lg:block">
                            <div className="sticky top-28 bg-white rounded-2xl shadow-soft p-6 border border-gray-100">
                                <h3 className="text-sm font-inter font-bold text-dark-muted uppercase tracking-wider mb-4">
                                    Order Summary
                                </h3>
                                <div className="flex gap-3 mb-4">
                                    <div className="relative w-24 h-24 rounded-xl overflow-hidden flex-shrink-0">
                                        <Image
                                            src={workshop.coverImage}
                                            alt={workshop.title}
                                            fill
                                            className="object-cover"
                                        />
                                    </div>
                                    <div>
                                        <h4 className="font-playfair font-semibold text-dark text-sm leading-tight">
                                            {workshop.title}
                                        </h4>
                                        <div className="flex items-center gap-1 mt-1">
                                            <Star className="w-3 h-3 text-terracotta fill-terracotta" />
                                            <span className="text-xs font-inter font-semibold text-dark">
                                                {workshop.rating}
                                            </span>
                                            <span className="text-xs font-inter text-dark-muted">
                                                ({workshop.reviewCount})
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-3 py-4 border-t border-gray-100">
                                    <div className="flex items-center gap-2 text-sm font-inter text-dark-secondary">
                                        <Calendar className="w-4 h-4 text-dark-muted" />
                                        {formatDate(workshop.date)}{" "}
                                        <span aria-hidden>&middot;</span>{" "}
                                        {workshop.time}
                                    </div>
                                    <div className="flex items-center gap-2 text-sm font-inter text-dark-secondary">
                                        <Clock className="w-4 h-4 text-dark-muted" />
                                        {workshop.duration}
                                    </div>
                                    <div className="flex items-center gap-2 text-sm font-inter text-dark-secondary">
                                        <MapPin className="w-4 h-4 text-dark-muted" />
                                        {workshop.location}, {workshop.city}
                                    </div>
                                    <div className="flex items-center gap-2 text-sm font-inter text-dark-secondary">
                                        <Users className="w-4 h-4 text-dark-muted" />
                                        {guests} guests
                                    </div>
                                </div>
                                <div className="space-y-2 pt-4 border-t border-gray-100">
                                    <div className="flex justify-between text-sm font-inter">
                                        <span className="text-dark-secondary">
                                            {formatCurrency(workshop.price)} x {guests} guests
                                        </span>
                                        <span className="text-dark font-medium">
                                            {formatCurrency(subtotal)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-sm font-inter">
                                        <span className="text-dark-secondary">Service fee</span>
                                        <span className="text-dark font-medium">
                                            {formatCurrency(SERVICE_FEE)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-base font-inter font-bold pt-3 border-t border-gray-100">
                                        <span className="text-dark">Total</span>
                                        <span className="text-dark">
                                            {formatCurrency(total)}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 bg-cream-100 rounded-xl px-4 py-3 mt-4">
                                    <Shield className="w-5 h-5 text-emerald-600" />
                                    <span className="text-sm font-inter text-dark-secondary">
                                        Razorpay payment is verified before booking confirmation.
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <Footer />
            </main>
        </>
    );
}

export default function BookingPage() {
    return (
        <Suspense
            fallback={
                <main className="min-h-screen flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-terracotta" />
                </main>
            }
        >
            <BookingContent />
        </Suspense>
    );
}
