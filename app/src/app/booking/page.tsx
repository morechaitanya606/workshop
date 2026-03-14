"use client";

import { useEffect, useState, Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import Script from "next/script";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
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
    CalendarPlus,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useToast } from "@/components/ToastProvider";
import { mockWorkshops } from "@/lib/data";
import type { Workshop } from "@/lib/data";
import {
    confirmCheckoutPayment,
    createCheckoutOrder,
    getWorkshopById,
    toApiErrorMessage,
} from "@/lib/api-client";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { trackEvent } from "@/lib/analytics";
import { scaleIn, standardTransition } from "@/lib/motion-presets";
import { downloadICSFile, generateGoogleCalendarUrl, parseDurationToMinutes, type CalendarEventData } from "@/lib/calendar";

const SERVICE_FEE = 99;

function parseTimestamp(value: string) {
    if (!value) return null;
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? null : timestamp;
}

function formatRemainingTime(milliseconds: number) {
    const clamped = Math.max(0, Math.floor(milliseconds / 1000));
    const minutes = Math.floor(clamped / 60);
    const seconds = clamped % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

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

type FormErrors = {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
};

declare global {
    interface Window {
        Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
    }
}

function BookingContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const prefersReducedMotion = useReducedMotion();
    const { user, session, loading } = useAuth();
    const toast = useToast();

    const workshopId = searchParams.get("workshop") || "";
    const holdId = searchParams.get("hold") || "";
    const holdExpiresAtParam = searchParams.get("holdExpiresAt") || "";
    const guestsParam = Number.parseInt(searchParams.get("guests") || "1", 10);
    const guests = Number.isFinite(guestsParam) ? Math.max(1, guestsParam) : 1;
    const holdExpiresAtMs = parseTimestamp(holdExpiresAtParam);

    const fallbackWorkshop = mockWorkshops.find((item) => item.id === workshopId) || null;
    const [workshop, setWorkshop] = useState<Workshop | null>(fallbackWorkshop);
    const [workshopLoading, setWorkshopLoading] = useState(Boolean(workshopId));
    const [isRazorpayReady, setIsRazorpayReady] = useState(false);
    const [nowMs, setNowMs] = useState(() => Date.now());

    const [step, setStep] = useState(1);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [formErrors, setFormErrors] = useState<FormErrors>({});
    const [confirmedBooking, setConfirmedBooking] = useState<ConfirmedBooking | null>(null);
    const [formData, setFormData] = useState({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        notes: "",
    });

    useEffect(() => {
        if (!holdExpiresAtMs || holdExpiresAtMs <= Date.now()) {
            return;
        }

        setNowMs(Date.now());
        const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [holdExpiresAtMs]);

    useEffect(() => {
        if (!loading && !user) {
            const holdExpiresQuery = holdExpiresAtParam
                ? `&holdExpiresAt=${encodeURIComponent(holdExpiresAtParam)}`
                : "";
            const redirectPath = encodeURIComponent(
                `/booking?workshop=${workshopId}&guests=${guests}${holdId ? `&hold=${holdId}` : ""}${holdExpiresQuery}`
            );
            router.push(`/auth/login?redirect=${redirectPath}`);
        }
    }, [loading, user, router, workshopId, guests, holdId, holdExpiresAtParam, holdExpiresAtMs]);

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
                const result = await getWorkshopById(workshopId);
                if (!cancelled && result.workshop) {
                    setWorkshop(result.workshop);
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
    const holdRemainingMs = holdExpiresAtMs ? holdExpiresAtMs - nowMs : null;
    const holdExpired = typeof holdRemainingMs === "number" && holdRemainingMs <= 0;
    const holdCountdownLabel =
        typeof holdRemainingMs === "number" && holdRemainingMs > 0
            ? formatRemainingTime(holdRemainingMs)
            : null;
    const stepLabels = ["Guest info", "Payment", "Confirmation"];
    const trimFormData = {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
    };
    const isCheckoutDisabled =
        submitting ||
        !isRazorpayReady ||
        !trimFormData.firstName ||
        !trimFormData.lastName ||
        !trimFormData.email ||
        !trimFormData.phone ||
        !holdId ||
        holdExpired;

    const validateForm = () => {
        const nextErrors: FormErrors = {};
        if (!trimFormData.firstName) {
            nextErrors.firstName = "First name is required.";
        }
        if (!trimFormData.lastName) {
            nextErrors.lastName = "Last name is required.";
        }
        if (!trimFormData.email) {
            nextErrors.email = "Email is required.";
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimFormData.email)) {
            nextErrors.email = "Enter a valid email address.";
        }

        if (!trimFormData.phone) {
            nextErrors.phone = "Phone number is required.";
        } else {
            const phoneDigits = trimFormData.phone.replace(/\D/g, "");
            if (!/^\d{10}$/.test(phoneDigits)) {
                nextErrors.phone = "Enter a valid 10-digit phone number.";
            }
        }

        setFormErrors(nextErrors);
        return Object.keys(nextErrors).length === 0;
    };

    const inputClassName = (hasError: boolean) =>
        `w-full bg-cream-100 border rounded-xl px-4 py-3 text-sm font-inter text-dark outline-none ${
            hasError
                ? "border-red-400 focus:border-red-500"
                : "border-gray-200 focus:border-terracotta"
        }`;

    useEffect(() => {
        if (!holdExpired) return;
        setError((prev) => prev || "Your seat hold has expired. Please reserve seats again.");
    }, [holdExpired]);

    const handleCheckout = async () => {
        if (!workshop) return;
        setError(null);
        if (!validateForm()) {
            toast.info("Review form details", "Please fix the highlighted fields.");
            setStep(1);
            return;
        }

        if (!holdId) {
            const message =
                "Seat hold is missing or expired. Please go back and reserve seats again.";
            setError(message);
            toast.error("Seat hold missing", message);
            return;
        }
        if (holdExpired) {
            const message = "Your seat hold has expired. Please reserve seats again.";
            setError(message);
            toast.error("Seat hold expired", message);
            return;
        }

        if (!session?.access_token) {
            const message = "Your session expired. Please log in again.";
            setError(message);
            toast.error("Session expired", message);
            return;
        }

        if (!isRazorpayReady || !window.Razorpay) {
            const message = "Payment gateway is still loading. Please try again in a moment.";
            setError(message);
            toast.info("Payment loading", message);
            return;
        }

        setStep(2);
        setSubmitting(true);
        trackEvent("checkout_started", {
            workshopId: workshop.id,
            guests,
        });

        const checkoutPayload = {
            holdId,
            workshopId: workshop.id,
            firstName: trimFormData.firstName,
            lastName: trimFormData.lastName,
            email: trimFormData.email,
            phone: trimFormData.phone,
            notes: formData.notes,
        };

        try {
            const orderResult = await createCheckoutOrder(session.access_token, checkoutPayload);

            const order = orderResult.order as RazorpayOrderResponse | undefined;
            if (!order?.id || !order?.keyId) {
                const message = "Payment order was not created correctly.";
                setError(message);
                toast.error("Checkout failed", message);
                setSubmitting(false);
                return;
            }

            const RazorpayCheckout = window.Razorpay;
            if (!RazorpayCheckout) {
                const message = "Razorpay checkout is unavailable right now.";
                setError(message);
                toast.error("Checkout unavailable", message);
                setSubmitting(false);
                return;
            }

            const checkout = new RazorpayCheckout({
                key: order.keyId,
                amount: order.amount,
                currency: order.currency,
                name: order.name || "Only Workshops",
                description: order.description || workshop.title,
                order_id: order.id,
                prefill: order.prefill,
                handler: async (payment) => {
                    try {
                        const confirmResult = await confirmCheckoutPayment(session.access_token, {
                            ...checkoutPayload,
                            razorpayOrderId: payment.razorpay_order_id,
                            razorpayPaymentId: payment.razorpay_payment_id,
                            razorpaySignature: payment.razorpay_signature,
                        });

                        setConfirmedBooking(confirmResult.booking || null);
                        trackEvent("booking_completed", {
                            workshopId: workshop.id,
                            bookingId: confirmResult.booking?.id || null,
                            total,
                        });
                        toast.success(
                            "Booking confirmed",
                            "Payment verified and your workshop booking is confirmed."
                        );
                        setStep(3);
                    } catch {
                        const message =
                            "Payment succeeded, but booking confirmation could not be completed.";
                        setError(message);
                        toast.error("Verification pending", message);
                    } finally {
                        setSubmitting(false);
                    }
                },
                modal: {
                    ondismiss: () => {
                        setStep(1);
                        setSubmitting(false);
                    },
                },
                theme: {
                    color: "#C76B4A",
                },
            });

            checkout.on("payment.failed", () => {
                const message = "Payment failed. Please try again.";
                setError(message);
                toast.error("Payment failed", message);
                setStep(1);
                setSubmitting(false);
            });

            checkout.open();
        } catch (error) {
            const message = toApiErrorMessage(
                error,
                "Unable to start checkout right now. Please try again."
            );
            setError(message);
            toast.error("Checkout failed", message);
            setStep(1);
            setSubmitting(false);
        }
    };

    const razorpayScript = (
        <Script
            src="https://checkout.razorpay.com/v1/checkout.js"
            strategy="afterInteractive"
            onLoad={() => setIsRazorpayReady(true)}
            onError={() => {
                const message = "Failed to load Razorpay checkout. Refresh the page and try again.";
                setError(message);
                toast.error("Razorpay failed to load", message);
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
        const bookingCover = confirmedBooking?.workshop?.cover_image || workshop.coverImage;
        const locationDetails = workshop.eventAddress ? `${workshop.eventAddress}, ${workshop.city}` : `${workshop.location}, ${workshop.city}`;

        const calendarData: CalendarEventData = {
            title: bookingWorkshopTitle,
            description: workshop.description,
            location: locationDetails,
            startDate: bookingWorkshopDate,
            startTime: bookingWorkshopTime,
            durationMinutes: parseDurationToMinutes(workshop.duration),
        };

        return (
            <>
                {razorpayScript}
                <main className="min-h-screen bg-cream">
                    <Navbar />
                    <div className="pt-28 pb-16 section-padding">
                        <motion.div
                            variants={prefersReducedMotion ? undefined : scaleIn}
                            initial={prefersReducedMotion ? undefined : "hidden"}
                            animate={prefersReducedMotion ? undefined : "visible"}
                            transition={prefersReducedMotion ? { duration: 0 } : standardTransition}
                            className="max-w-lg mx-auto text-center"
                        >
                            <motion.div
                                variants={prefersReducedMotion ? undefined : scaleIn}
                                initial={prefersReducedMotion ? undefined : "hidden"}
                                animate={prefersReducedMotion ? undefined : "visible"}
                                transition={
                                    prefersReducedMotion
                                        ? { duration: 0 }
                                        : { ...standardTransition, delay: 0.1 }
                                }
                                className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6"
                            >
                                <Check className="w-10 h-10 text-emerald-600" />
                            </motion.div>
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
                                            <span aria-hidden>&middot;</span> {bookingWorkshopTime}
                                        </p>
                                        <p className="text-sm font-inter text-dark-muted">
                                            {guests} guests <span aria-hidden>&middot;</span>{" "}
                                            {formatCurrency(confirmedBooking?.total || total)}
                                        </p>
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-3 justify-center mb-6">
                                <Link href="/profile" className="btn-primary">
                                    View My Tickets
                                </Link>
                                <Link href="/explore" className="btn-secondary">
                                    Explore More
                                </Link>
                            </div>

                            <div className="border-t border-gray-100 pt-6 mt-2">
                                <h3 className="text-sm font-inter font-bold text-dark-muted uppercase tracking-wider mb-4 text-center">
                                    Add to Calendar
                                </h3>
                                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                                    <button
                                        onClick={() => downloadICSFile(calendarData, `${workshop.id}.ics`)}
                                        className="btn-secondary inline-flex items-center gap-2"
                                    >
                                        <CalendarPlus className="w-4 h-4" />
                                        Apple / Outlook (.ics)
                                    </button>
                                    <a
                                        href={generateGoogleCalendarUrl(calendarData)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="btn-secondary inline-flex items-center gap-2"
                                    >
                                        <CalendarPlus className="w-4 h-4" />
                                        Google Calendar
                                    </a>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </main>
            </>
        );
    }

    const orderSummaryCard = (
        <>
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
                    {formatDate(workshop.date)} <span aria-hidden>&middot;</span> {workshop.time}
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
                    <span className="text-dark font-medium">{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm font-inter">
                    <span className="text-dark-secondary">Service fee</span>
                    <span className="text-dark font-medium">{formatCurrency(SERVICE_FEE)}</span>
                </div>
                <div className="flex justify-between text-base font-inter font-bold pt-3 border-t border-gray-100">
                    <span className="text-dark">Total</span>
                    <span className="text-dark">{formatCurrency(total)}</span>
                </div>
            </div>
            <div className="flex items-center gap-2 bg-cream-100 rounded-xl px-4 py-3 mt-4">
                <Shield className="w-5 h-5 text-emerald-600" />
                <span className="text-sm font-inter text-dark-secondary">
                    Razorpay payment is verified before booking confirmation.
                </span>
            </div>
        </>
    );

    return (
        <>
            {razorpayScript}
            <main className="min-h-screen bg-cream">
                <Navbar />
                <div className="pt-24 pb-32 sm:pb-16 section-padding">
                    <Link
                        href={`/workshop/${workshop.id}`}
                        className="inline-flex items-center gap-2 text-sm font-inter text-dark-muted hover:text-terracotta transition-colors mb-6"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back to workshop
                    </Link>

                    <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-4 shadow-soft">
                        <ol className="grid grid-cols-3 gap-2">
                            {stepLabels.map((label, index) => {
                                const stepNumber = index + 1;
                                const isDone = step > stepNumber;
                                const isActive = step === stepNumber;
                                return (
                                    <li
                                        key={label}
                                        className="flex items-center gap-2 text-xs font-inter sm:text-sm"
                                    >
                                        <span
                                            className={`inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold ${
                                                isDone
                                                    ? "border-emerald-300 bg-emerald-100 text-emerald-700"
                                                    : isActive
                                                      ? "border-terracotta bg-terracotta text-white"
                                                      : "border-gray-200 bg-white text-dark-muted"
                                            }`}
                                        >
                                            {isDone ? (
                                                <Check className="h-3.5 w-3.5" />
                                            ) : (
                                                stepNumber
                                            )}
                                        </span>
                                        <span
                                            className={
                                                isActive || isDone ? "text-dark" : "text-dark-muted"
                                            }
                                        >
                                            {label}
                                        </span>
                                    </li>
                                );
                            })}
                        </ol>
                    </div>

                    {!holdId && (
                        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-inter">
                            Seat hold is missing. Please go back and click &quot;Reserve Spot&quot;
                            again.
                        </div>
                    )}
                    {holdId && holdCountdownLabel && !holdExpired && (
                        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-inter text-amber-900">
                            Seat hold expires in{" "}
                            <span className="font-semibold">{holdCountdownLabel}</span>. Complete
                            payment before the timer ends.
                        </div>
                    )}
                    {holdExpired && (
                        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-inter text-red-700">
                            Your seat hold expired. Go back and reserve seats again.
                        </div>
                    )}
                    {error && (
                        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-inter">
                            <span>{error}</span>
                            {!holdExpired && holdId && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setError(null);
                                        void handleCheckout();
                                    }}
                                    className="inline-flex items-center justify-center rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                                >
                                    Try again
                                </button>
                            )}
                        </div>
                    )}

                    <details className="mb-6 rounded-2xl border border-gray-200 bg-white p-4 shadow-soft lg:hidden">
                        <summary className="cursor-pointer list-none text-sm font-inter font-semibold text-dark flex items-center justify-between gap-3">
                            <span>Order summary</span>
                            <span>{formatCurrency(total)}</span>
                        </summary>
                        <div className="pt-4">{orderSummaryCard}</div>
                    </details>

                    <div className="grid grid-cols-1 lg:grid-cols-[1fr,380px] gap-8 lg:gap-12">
                        <div className="bg-white rounded-2xl p-6 shadow-soft space-y-5">
                            <h2 className="heading-sm">Guest Information</h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="mb-1.5 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                        First name <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        value={formData.firstName}
                                        onChange={(event) => {
                                            setFormData({
                                                ...formData,
                                                firstName: event.target.value,
                                            });
                                            setFormErrors((prev) => ({
                                                ...prev,
                                                firstName: undefined,
                                            }));
                                        }}
                                        placeholder="First name"
                                        autoComplete="given-name"
                                        aria-invalid={Boolean(formErrors.firstName)}
                                        className={inputClassName(Boolean(formErrors.firstName))}
                                    />
                                    {formErrors.firstName && (
                                        <p className="mt-1 text-xs font-inter text-red-600">
                                            {formErrors.firstName}
                                        </p>
                                    )}
                                </div>
                                <div>
                                    <label className="mb-1.5 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                        Last name <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        value={formData.lastName}
                                        onChange={(event) => {
                                            setFormData({
                                                ...formData,
                                                lastName: event.target.value,
                                            });
                                            setFormErrors((prev) => ({
                                                ...prev,
                                                lastName: undefined,
                                            }));
                                        }}
                                        placeholder="Last name"
                                        autoComplete="family-name"
                                        aria-invalid={Boolean(formErrors.lastName)}
                                        className={inputClassName(Boolean(formErrors.lastName))}
                                    />
                                    {formErrors.lastName && (
                                        <p className="mt-1 text-xs font-inter text-red-600">
                                            {formErrors.lastName}
                                        </p>
                                    )}
                                </div>
                            </div>
                            <div>
                                <label className="mb-1.5 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                    Email <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={(event) => {
                                        setFormData({
                                            ...formData,
                                            email: event.target.value,
                                        });
                                        setFormErrors((prev) => ({ ...prev, email: undefined }));
                                    }}
                                    placeholder="Email"
                                    autoComplete="email"
                                    aria-invalid={Boolean(formErrors.email)}
                                    className={inputClassName(Boolean(formErrors.email))}
                                />
                                {formErrors.email && (
                                    <p className="mt-1 text-xs font-inter text-red-600">
                                        {formErrors.email}
                                    </p>
                                )}
                            </div>
                            <div>
                                <label className="mb-1.5 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                    Phone number <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="tel"
                                    value={formData.phone}
                                    onChange={(event) => {
                                        setFormData({
                                            ...formData,
                                            phone: event.target.value,
                                        });
                                        setFormErrors((prev) => ({ ...prev, phone: undefined }));
                                    }}
                                    placeholder="10-digit phone number"
                                    autoComplete="tel"
                                    inputMode="numeric"
                                    aria-invalid={Boolean(formErrors.phone)}
                                    className={inputClassName(Boolean(formErrors.phone))}
                                />
                                {formErrors.phone ? (
                                    <p className="mt-1 text-xs font-inter text-red-600">
                                        {formErrors.phone}
                                    </p>
                                ) : (
                                    <p className="mt-1 text-xs font-inter text-dark-muted">
                                        Enter 10 digits without spaces.
                                    </p>
                                )}
                            </div>
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
                                disabled={isCheckoutDisabled}
                                className="btn-primary hidden sm:inline-flex w-full sm:w-auto !py-3.5 !px-8 disabled:opacity-50 disabled:cursor-not-allowed"
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

                        <div
                            className={`hidden lg:block transition-opacity duration-300 ${submitting ? "opacity-50 pointer-events-none" : ""}`}
                        >
                            <div className="sticky top-28 bg-white rounded-2xl shadow-soft p-6 border border-gray-100">
                                {orderSummaryCard}
                            </div>
                        </div>
                    </div>
                </div>
                <div className="sm:hidden fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 backdrop-blur">
                    <div className="section-padding py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                        <div
                            className={`flex items-center gap-3 transition-opacity duration-300 ${
                                submitting ? "opacity-60 pointer-events-none" : ""
                            }`}
                        >
                            <div className="min-w-0">
                                <p className="text-[11px] font-inter font-semibold uppercase tracking-wide text-dark-muted">
                                    Total
                                </p>
                                <p className="text-sm font-inter font-semibold text-dark truncate">
                                    {formatCurrency(total)} for {guests}{" "}
                                    {guests === 1 ? "guest" : "guests"}
                                </p>
                            </div>
                            <button
                                onClick={handleCheckout}
                                disabled={isCheckoutDisabled}
                                className="btn-primary flex-1 !py-3 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {submitting ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        Processing...
                                    </>
                                ) : !isRazorpayReady ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        Loading...
                                    </>
                                ) : (
                                    <>Confirm & Pay</>
                                )}
                            </button>
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
