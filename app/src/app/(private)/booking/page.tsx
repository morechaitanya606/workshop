"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { useReducedMotion } from "framer-motion";
import { ArrowLeft, Loader2 } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SeatMap from "@/components/booking/SeatMap";
import { useToast } from "@/components/ToastProvider";
import { parseDurationToMinutes, type CalendarEventData } from "@/lib/calendar";
import BookingConfirmation from "./BookingConfirmation";
import BookingGuestForm from "./BookingGuestForm";
import BookingHoldTimer, { HoldTimerChip } from "./BookingHoldTimer";
import BookingLoadingState from "./BookingLoadingState";
import BookingMobileBar from "./BookingMobileBar";
import BookingOrderSummary from "./BookingOrderSummary";
import BookingReview from "./BookingReview";
import BookingStepIndicator from "./BookingStepIndicator";
import type { RazorpayInstance, RazorpayOptions } from "./types";

import { useBookingWorkflow } from "./useBookingWorkflow";

declare global {
    interface Window {
        Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
    }
}

type BookingView = "details" | "review";

function BookingContent() {
    const router = useRouter();
    const prefersReducedMotion = Boolean(useReducedMotion());
    const toast = useToast();
    const [view, setView] = useState<BookingView>("details");
    const contentRef = useRef<HTMLDivElement>(null);
    const hasMountedRef = useRef(false);

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
        handleRetryCheckout,
        canRetryCheckout,
        retryCheckoutLabel,
        isCheckoutDisabled,
        validateDetails,
        awaitingConfirmation,
        guests,
        selectedGuests,
        seatsRemaining,
        maxSelectableGuests,
        seatChangePending,
        setDraftGuests,
        resetDraftGuests,
        isUpdatingSeats,
        seatError,
        reholdSeats,
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

    const stepLabels = ["Details", "Review & pay", "Confirmation"];
    // The hook's step 2 means "payment in flight"; the page's review view is also step 2.
    const displayStep = step === 3 ? 3 : step === 2 || view === "review" ? 2 : 1;

    // Checkout re-validates the form; if that finds a problem, send the customer back to it.
    useEffect(() => {
        if (Object.values(formErrors).some(Boolean)) setView("details");
    }, [formErrors]);

    // Move focus to the new step's content so keyboard and screen-reader users land on it.
    useEffect(() => {
        if (!hasMountedRef.current) {
            hasMountedRef.current = true;
            return;
        }
        contentRef.current?.focus({ preventScroll: true });
    }, [view]);

    const goToView = (next: BookingView) => {
        setView(next);
        window.scrollTo({ top: 0, behavior: prefersReducedMotion ? "auto" : "smooth" });
    };

    const handleContinue = () => {
        const valid = validateDetails();
        if (valid) goToView("review");
        return valid;
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
                        <div className="mx-auto max-w-3xl">
                            <BookingStepIndicator labels={stepLabels} step={3} />
                        </div>
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

    const seatsLocked = submitting || awaitingConfirmation || step === 2;
    const holdReady = Boolean(holdId) && !holdExpired;
    // The duplicate "seat hold expired" error is already covered by the timer panel.
    const showGenericError =
        Boolean(error) && !(holdExpired && !awaitingConfirmation && /seat hold/i.test(error || ""));

    const detailsCtaLabel = isUpdatingSeats
        ? "Updating seats..."
        : seatChangePending
          ? "Update seats first"
          : !holdReady
            ? "Hold your seats first"
            : "Continue to review";
    const detailsCtaDisabled = isUpdatingSeats || seatChangePending || !holdReady;

    const summary = (
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
    );

    const seatChangeBar = (
        <div aria-live="polite">
            {seatError && (
                <p
                    role="alert"
                    className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-inter text-red-700"
                >
                    {seatError}
                </p>
            )}
            {seatChangePending && (
                <div className="mt-3 flex flex-col gap-3 rounded-xl border border-terracotta-200 bg-terracotta-50 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm font-inter text-terracotta-900">
                        Change from{" "}
                        <strong>
                            {guests} {guests === 1 ? "seat" : "seats"}
                        </strong>{" "}
                        to{" "}
                        <strong>
                            {selectedGuests} {selectedGuests === 1 ? "seat" : "seats"}
                        </strong>
                        ? Your hold restarts with a fresh timer.
                    </p>
                    <div className="flex shrink-0 items-center gap-2">
                        <button
                            type="button"
                            onClick={resetDraftGuests}
                            disabled={isUpdatingSeats}
                            className="rounded-full px-3.5 py-2 text-sm font-inter font-semibold text-dark-secondary transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta disabled:opacity-50"
                        >
                            Undo
                        </button>
                        <button
                            type="button"
                            onClick={() => void reholdSeats()}
                            disabled={isUpdatingSeats}
                            className="inline-flex items-center justify-center gap-2 rounded-full bg-terracotta px-4 py-2 text-sm font-inter font-semibold text-white transition-colors hover:bg-terracotta-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:ring-offset-2 disabled:opacity-60"
                        >
                            {isUpdatingSeats && (
                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                            )}
                            Update seats
                        </button>
                    </div>
                </div>
            )}
        </div>
    );

    return (
        <>
            {razorpayScript}
            <main className="min-h-screen bg-cream">
                <Navbar />
                <div className="pt-24 pb-44 section-padding lg:pb-16">
                    <div className="mx-auto max-w-6xl">
                        <Link
                            href={`/workshop/${workshop.id}`}
                            className="mb-5 inline-flex items-center gap-2 rounded text-sm font-inter text-dark-muted transition-colors hover:text-terracotta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
                        >
                            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                            Back to workshop
                        </Link>

                        <h1 className="sr-only">Book {workshop.title}</h1>
                        <BookingStepIndicator labels={stepLabels} step={displayStep} />

                        <BookingHoldTimer
                            remainingMs={holdRemainingMs}
                            hasHold={Boolean(holdId)}
                            expired={holdExpired}
                            busy={isUpdatingSeats}
                            paid={awaitingConfirmation}
                            onReserveAgain={() => void reholdSeats()}
                        />

                        {showGenericError && (
                            <div
                                role="alert"
                                className="mb-6 flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-inter text-red-700 sm:flex-row sm:items-center sm:justify-between"
                            >
                                <span>{error}</span>
                                {canRetryCheckout && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setError(null);
                                            void handleRetryCheckout();
                                        }}
                                        className="inline-flex items-center justify-center rounded-full border border-red-300 bg-white px-4 py-1.5 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                                    >
                                        {retryCheckoutLabel}
                                    </button>
                                )}
                            </div>
                        )}

                        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-12">
                            <div
                                ref={contentRef}
                                tabIndex={-1}
                                className="min-w-0 space-y-6 outline-none"
                            >
                                {view === "details" ? (
                                    <>
                                        <div className="card-section !p-4 sm:!p-6">
                                            <SeatMap
                                                maxSeats={workshop.maxSeats}
                                                seatsRemaining={seatsRemaining}
                                                guests={selectedGuests}
                                                maxGuests={maxSelectableGuests}
                                                onGuestsChange={setDraftGuests}
                                                disabled={seatsLocked || isUpdatingSeats}
                                                disabledReason={
                                                    seatsLocked
                                                        ? "Seats are locked while your payment is in progress."
                                                        : undefined
                                                }
                                                footer={seatChangeBar}
                                            />
                                        </div>
                                        <div className="card-section !p-4 sm:!p-6">
                                            <BookingGuestForm
                                                formData={formData}
                                                formErrors={formErrors}
                                                onFieldChange={handleFormFieldChange}
                                                onContinue={handleContinue}
                                                isBusy={isUpdatingSeats}
                                                continueDisabled={detailsCtaDisabled}
                                                continueLabel={detailsCtaLabel}
                                            />
                                        </div>
                                    </>
                                ) : (
                                    <div className="card-section !p-4 sm:!p-6">
                                        <BookingReview
                                            guests={guests}
                                            formData={formData}
                                            onEditSeats={() => goToView("details")}
                                            onEditDetails={() => goToView("details")}
                                            onPay={() => void handleCheckout()}
                                            isCheckoutDisabled={isCheckoutDisabled}
                                            isRazorpayReady={isRazorpayReady}
                                            submitting={submitting}
                                            awaitingConfirmation={awaitingConfirmation}
                                            total={total}
                                        />
                                    </div>
                                )}
                            </div>

                            <aside
                                aria-label="Order summary"
                                className={`hidden transition-opacity duration-300 lg:block ${
                                    submitting ? "pointer-events-none opacity-50" : ""
                                }`}
                            >
                                <div className="sticky top-28 rounded-2xl border border-clay/40 bg-white p-6 shadow-soft">
                                    {summary}
                                    {holdRemainingMs !== null && holdRemainingMs > 0 && (
                                        <div className="mt-4 flex justify-center border-t border-clay/40 pt-3">
                                            <HoldTimerChip remainingMs={holdRemainingMs} />
                                        </div>
                                    )}
                                </div>
                            </aside>
                        </div>
                    </div>
                </div>

                <BookingMobileBar
                    total={total}
                    guests={guests}
                    holdRemainingMs={holdRemainingMs}
                    mode={view === "details" ? "details" : "pay"}
                    busy={isUpdatingSeats}
                    disabled={view === "details" ? detailsCtaDisabled : isCheckoutDisabled}
                    ctaLabel={view === "details" ? detailsCtaLabel : undefined}
                    isRazorpayReady={isRazorpayReady}
                    submitting={submitting}
                    awaitingConfirmation={awaitingConfirmation}
                    onPay={() => void handleCheckout()}
                >
                    {summary}
                </BookingMobileBar>

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
