"use client";

import { Suspense } from "react";
import Link from "next/link";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { useReducedMotion } from "framer-motion";
import { ArrowLeft, Loader2 } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useToast } from "@/components/ToastProvider";
import { formatCurrency } from "@/lib/utils";
import { parseDurationToMinutes, type CalendarEventData } from "@/lib/calendar";
import BookingConfirmation from "./BookingConfirmation";
import BookingGuestForm from "./BookingGuestForm";
import BookingLoadingState from "./BookingLoadingState";
import BookingOrderSummary from "./BookingOrderSummary";
import BookingStepIndicator from "./BookingStepIndicator";
import type { RazorpayInstance, RazorpayOptions } from "./types";

import { useBookingWorkflow } from "./useBookingWorkflow";

function formatRemainingTime(milliseconds: number) {
    const clamped = Math.max(0, Math.floor(milliseconds / 1000));
    const minutes = Math.floor(clamped / 60);
    const seconds = clamped % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

declare global {
    interface Window {
        Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
    }
}

function BookingContent() {
    const router = useRouter();
    const prefersReducedMotion = Boolean(useReducedMotion());
    const toast = useToast();

    const {
        workshop,
        workshopLoading,
        loading,
        user,
        holdId,
        holdExpired,
        holdRemainingMs,
        isRazorpayReady,
        setIsRazorpayReady,
        step,
        submitting,
        error,
        setError,
        formErrors,
        formData,
        handleFormFieldChange,
        handleCheckout,
        isCheckoutDisabled,
        guests,
        serviceFee,
        isEbEligible,
        earlyBirdDiscountTotal,
        subtotalOriginal,
        total,
        discountAmount,
        appliedCoupon,
        showCouponInput,
        setShowCouponInput,
        couponCode,
        setCouponCode,
        isApplyingCoupon,
        couponError,
        setCouponError,
        handleApplyCoupon,
        removeCoupon,
        confirmedBooking,
    } = useBookingWorkflow();
    const stepLabels = ["Your details", "Payment", "Confirmed"];
    const holdCountdownLabel =
        typeof holdRemainingMs === "number" && holdRemainingMs > 0
            ? formatRemainingTime(holdRemainingMs)
            : null;

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
                <BookingLoadingState />
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
        const locationDetails = workshop.eventAddress
            ? `${workshop.eventAddress}, ${workshop.city}`
            : `${workshop.location}, ${workshop.city}`;
        const calendarData: CalendarEventData = {
            title: bookingWorkshopTitle,
            description: workshop.description,
            location: locationDetails,
            startDate: bookingWorkshopDate,
            startTime: bookingWorkshopTime,
            durationMinutes: parseDurationToMinutes(workshop.duration),
        };

        const attendeeName = `${formData.firstName} ${formData.lastName}`.trim() || "Guest";
        const bookingLocation = workshop.eventAddress
            ? `${workshop.eventAddress}, ${workshop.city}`
            : `${workshop.location}, ${workshop.city}`;

        return (
            <>
                {razorpayScript}
                <main className="min-h-screen bg-cream">
                    <Navbar />
                    <div className="pt-28 pb-16 section-padding">
                        <BookingConfirmation
                            bookingCover={bookingCover}
                            bookingWorkshopTitle={bookingWorkshopTitle}
                            bookingWorkshopDate={bookingWorkshopDate}
                            bookingWorkshopTime={bookingWorkshopTime}
                            bookingTotal={confirmedBooking?.total ?? total}
                            guests={guests}
                            calendarData={calendarData}
                            workshopId={workshop.id}
                            prefersReducedMotion={prefersReducedMotion}
                            onBack={() => router.back()}
                            attendeeName={attendeeName}
                            location={bookingLocation}
                            bookingId={confirmedBooking?.id || workshop.id}
                        />
                    </div>
                    <Footer />
                </main>
            </>
        );
    }

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

                    <BookingStepIndicator labels={stepLabels} step={step} />

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
                        <div className="mb-6 flex flex-col gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-inter sm:flex-row sm:items-center sm:justify-between">
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
                        <div className="pt-4">
                            <BookingOrderSummary
                                workshop={workshop}
                                guests={guests}
                                subtotalOriginal={subtotalOriginal}
                                isEbEligible={isEbEligible}
                                earlyBirdDiscountTotal={earlyBirdDiscountTotal}
                                appliedCoupon={appliedCoupon}
                                discountAmount={discountAmount}
                                serviceFee={serviceFee}
                                total={total}
                                showCouponInput={showCouponInput}
                                couponCode={couponCode}
                                isApplyingCoupon={isApplyingCoupon}
                                couponError={couponError}
                                onShowCouponInput={() => setShowCouponInput(true)}
                                onCouponCodeChange={(value) => {
                                    setCouponCode(value);
                                    setCouponError("");
                                }}
                                onApplyCoupon={() => void handleApplyCoupon()}
                                onRemoveCoupon={removeCoupon}
                            />
                        </div>
                    </details>

                    <div className="grid grid-cols-1 lg:grid-cols-[1fr,380px] gap-8 lg:gap-12">
                        <BookingGuestForm
                            formData={formData}
                            formErrors={formErrors}
                            onFieldChange={handleFormFieldChange}
                            onCheckout={() => void handleCheckout()}
                            isCheckoutDisabled={isCheckoutDisabled}
                            isRazorpayReady={isRazorpayReady}
                            submitting={submitting}
                            total={total}
                        />

                        <div
                            className={`hidden lg:block transition-opacity duration-300 ${submitting ? "opacity-50 pointer-events-none" : ""}`}
                        >
                            <div className="sticky top-28 bg-white rounded-2xl shadow-soft p-6 border border-gray-100">
                                <BookingOrderSummary
                                    workshop={workshop}
                                    guests={guests}
                                    subtotalOriginal={subtotalOriginal}
                                    isEbEligible={isEbEligible}
                                    earlyBirdDiscountTotal={earlyBirdDiscountTotal}
                                    appliedCoupon={appliedCoupon}
                                    discountAmount={discountAmount}
                                    serviceFee={serviceFee}
                                    total={total}
                                    showCouponInput={showCouponInput}
                                    couponCode={couponCode}
                                    isApplyingCoupon={isApplyingCoupon}
                                    couponError={couponError}
                                    onShowCouponInput={() => setShowCouponInput(true)}
                                    onCouponCodeChange={(value) => {
                                        setCouponCode(value);
                                        setCouponError("");
                                    }}
                                    onApplyCoupon={() => void handleApplyCoupon()}
                                    onRemoveCoupon={removeCoupon}
                                />
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
                                onClick={() => void handleCheckout()}
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
        <Suspense fallback={<BookingLoadingState />}>
            <BookingContent />
        </Suspense>
    );
}
