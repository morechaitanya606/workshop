"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { useReducedMotion } from "framer-motion";
import { ArrowLeft, CircleSlash, Loader2, WifiOff } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SeatMap from "@/components/booking/SeatMap";
import { useToast } from "@/components/ToastProvider";
import { parseDurationToMinutes, type CalendarEventData } from "@/lib/calendar";
import { usePlatformSettings } from "@/lib/platform-settings-context";
import { BOOKINGS_CLOSED_MESSAGE } from "@/lib/workshop-availability";
import { googleMapsLinkOf, isWebUrl } from "@/lib/workshop-media";
import BookingConfirmation from "./BookingConfirmation";
import BookingGuestForm, { BookingContinueButton } from "./BookingGuestForm";
import BookingHoldTimer, { HoldTimerChip } from "./BookingHoldTimer";
import BookingLoadingState from "./BookingLoadingState";
import BookingMobileBar, { MOBILE_SUMMARY_ID } from "./BookingMobileBar";
import BookingOrderSummary from "./BookingOrderSummary";
import BookingReview from "./BookingReview";
import BookingStepIndicator from "./BookingStepIndicator";
import type { RazorpayInstance, RazorpayOptions } from "./types";

import { useBookingWorkflow, type ConfirmStatus } from "./useBookingWorkflow";

declare global {
    interface Window {
        Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
    }
}

type BookingView = "details" | "review";

/** Title and line for the "payment received" panel, by confirmation state. */
function recoveryCopy(status: ConfirmStatus): { title: string; busy: boolean } {
    switch (status) {
        case "stalled":
            return { title: "Payment received, waiting for a connection", busy: false };
        case "signin":
            return { title: "Payment received, please log in again", busy: false };
        case "support":
            return { title: "Payment received, but we need to check it", busy: false };
        default:
            return { title: "Payment received, confirming your booking...", busy: true };
    }
}

function BookingContent() {
    const router = useRouter();
    const prefersReducedMotion = Boolean(useReducedMotion());
    const toast = useToast();
    const { settings } = usePlatformSettings();
    const [view, setView] = useState<BookingView>("details");
    const contentRef = useRef<HTMLDivElement>(null);
    const recoveryRef = useRef<HTMLDivElement>(null);
    const hasMountedRef = useRef(false);

    const {
        workshop,
        workshopId,
        workshopLoading,
        workshopError,
        retryWorkshop,
        loading,
        user,
        isOffline,
        holdId,
        holdExpired,
        holdRemainingMs,
        isRazorpayReady,
        setIsRazorpayReady,
        step,
        submitting,
        error,
        setError,
        notice,
        formErrors,
        formData,
        handleFormFieldChange,
        handleCheckout,
        handleRetryCheckout,
        canRetryCheckout,
        retryCheckoutLabel,
        isCheckoutDisabled,
        validateDetails,
        mounted,
        awaitingConfirmation,
        confirmStatus,
        confirmBusy,
        recoveryUnsaved,
        bookingsClosed,
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
        priceLines,
        price,
        total,
        priceChange,
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
        confirmedGuests,
        confirmedAttendeeName,
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

    // A paid order is being confirmed, or needs the customer (offline, log in, support): the
    // panel sits at the top of the page, and on a phone the customer is usually scrolled down at
    // the bottom bar, so bring it into view when it appears and when it asks for something.
    const recoveryNeedsAction =
        confirmStatus === "stalled" || confirmStatus === "signin" || confirmStatus === "support";
    useEffect(() => {
        if (!awaitingConfirmation) return;
        recoveryRef.current?.scrollIntoView?.({
            block: "center",
            behavior: prefersReducedMotion ? "auto" : "smooth",
        });
    }, [awaitingConfirmation, recoveryNeedsAction, prefersReducedMotion]);

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

    // Also until this browser's saved payment / confirmation has been looked up (`mounted`): the
    // "closed" or details screens must never flash for a customer who has already paid.
    if (loading || !user || workshopLoading || !mounted) {
        return (
            <>
                {razorpayScript}
                <BookingLoadingState />
            </>
        );
    }

    if (!workshop) {
        // A slow or dropped connection is not "not found": offer a retry (it also retries by
        // itself when the browser comes back online).
        const unavailable = workshopError === "unavailable";
        return (
            <>
                {razorpayScript}
                <main className="min-h-screen bg-cream">
                    <Navbar />
                    <div className="pt-28 pb-16 section-padding text-center">
                        {unavailable ? (
                            <>
                                <WifiOff
                                    className="mx-auto mb-4 h-10 w-10 text-dark-muted"
                                    aria-hidden="true"
                                />
                                <h1 className="heading-lg mb-3">We could not load this booking</h1>
                                <p className="text-body mx-auto mb-8 max-w-md text-dark-muted">
                                    {isOffline
                                        ? "You seem to be offline. We will try again when you are back online."
                                        : "The connection is slow or the server did not answer in time. Your seat hold is still safe for now."}
                                </p>
                                <div className="flex flex-col justify-center gap-3 sm:flex-row">
                                    <button
                                        type="button"
                                        onClick={retryWorkshop}
                                        className="btn-primary"
                                    >
                                        Retry
                                    </button>
                                    {workshopId && (
                                        <Link
                                            href={`/workshop/${workshopId}`}
                                            className="btn-secondary"
                                        >
                                            Back to workshop
                                        </Link>
                                    )}
                                </div>
                            </>
                        ) : (
                            <>
                                <h1 className="heading-lg mb-3">Workshop not found</h1>
                                <p className="text-body text-dark-muted mb-8">
                                    The workshop in this booking link is unavailable.
                                </p>
                                <Link href="/explore" className="btn-primary">
                                    Back to Explore
                                </Link>
                            </>
                        )}
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
        // A pasted Google Maps link is not an address: print the venue and city, and put the
        // link in the calendar notes where it stays clickable for directions.
        const hasTextAddress = Boolean(workshop.eventAddress) && !isWebUrl(workshop.eventAddress);
        const directionsLink = googleMapsLinkOf(workshop.eventAddress);
        const locationDetails = hasTextAddress
            ? `${workshop.eventAddress}, ${workshop.city}`
            : `${workshop.location}, ${workshop.city}`;
        const calendarData: CalendarEventData = {
            title: bookingWorkshopTitle,
            description: directionsLink
                ? `${workshop.description}\n\nDirections: ${directionsLink}`
                : workshop.description,
            location: locationDetails,
            startDate: bookingWorkshopDate,
            startTime: bookingWorkshopTime,
            durationMinutes: parseDurationToMinutes(workshop.duration),
        };

        const attendeeName =
            confirmedAttendeeName || `${formData.firstName} ${formData.lastName}`.trim() || "Guest";

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
                            bookingTotal={confirmedBooking?.total ?? total ?? 0}
                            guests={confirmedGuests}
                            calendarData={calendarData}
                            workshopId={workshop.id}
                            prefersReducedMotion={prefersReducedMotion}
                            onBack={() => router.back()}
                            attendeeName={attendeeName}
                            location={locationDetails}
                            bookingId={confirmedBooking?.id ?? ""}
                        />
                    </div>
                    <Footer />
                </main>
            </>
        );
    }

    const backToWorkshop = (
        <Link
            href={`/workshop/${workshop.id}`}
            className="mb-5 inline-flex items-center gap-2 rounded text-sm font-inter text-dark-muted transition-colors hover:text-terracotta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
        >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to workshop
        </Link>
    );

    // The admin closed bookings: never show the payment step. A payment already taken for an
    // order created before the switch is still confirmed (the recovery panel below).
    if (bookingsClosed && !awaitingConfirmation) {
        return (
            <>
                {razorpayScript}
                <main className="min-h-screen bg-cream">
                    <Navbar />
                    <div className="pt-24 pb-16 section-padding">
                        <div className="mx-auto max-w-xl">
                            {backToWorkshop}
                            <div className="card-section !p-6 text-center" role="status">
                                <CircleSlash
                                    className="mx-auto mb-4 h-10 w-10 text-dark-muted"
                                    aria-hidden="true"
                                />
                                <h1 className="heading-sm mb-2">
                                    Bookings for this workshop are closed
                                </h1>
                                <p className="text-body-sm mb-1 text-dark-muted">
                                    {workshop.title}
                                </p>
                                <p className="text-body-sm mb-6 text-dark-muted">
                                    {BOOKINGS_CLOSED_MESSAGE} You have not been charged.
                                </p>
                                <div className="flex flex-col justify-center gap-3 sm:flex-row">
                                    <Link href={`/workshop/${workshop.id}`} className="btn-primary">
                                        Back to the workshop
                                    </Link>
                                    <Link href="/explore" className="btn-secondary">
                                        Explore other workshops
                                    </Link>
                                </div>
                            </div>
                        </div>
                    </div>
                    <Footer />
                </main>
            </>
        );
    }

    const seatsLocked = submitting || awaitingConfirmation || step === 2;
    const holdReady = Boolean(holdId) && !holdExpired;
    // The duplicate "seat hold expired" error is already covered by the timer panel, and a
    // paid order's messages live in the recovery panel.
    const showGenericError =
        Boolean(error) && !awaitingConfirmation && !(holdExpired && /seat hold/i.test(error || ""));
    const recovery = recoveryCopy(confirmStatus);
    const loginHref = `/auth/login?redirect=${encodeURIComponent(
        `/booking?workshop=${workshop.id}`
    )}`;

    const detailsCtaLabel = isUpdatingSeats
        ? "Updating seats..."
        : seatChangePending
          ? "Update seats first"
          : !holdReady
            ? "Hold your seats first"
            : "Continue to review";
    const detailsCtaDisabled = isUpdatingSeats || seatChangePending || !holdReady;
    const communityUrl = settings.whatsapp_community_url?.trim() || undefined;

    const summary = (
        <BookingOrderSummary
            workshop={workshop}
            lines={priceLines}
            offerItems={price?.offerItems ?? []}
            typedCodeNote={price?.typedCodeNote ?? null}
            appliedCode={appliedCoupon?.code ?? null}
            mounted={mounted}
            bookingsClosed={bookingsClosed}
            communityUrl={communityUrl}
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
            onApplyOfferCode={(code) => void handleApplyCoupon(code)}
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
            {/* The fixed checkout bar (below lg) is reserved under the footer, not above it:
                176px above the footer left an empty band and the bar still hid the footer. The
                bar grows by a "You save" row when a discount applies. */}
            <main
                className={`min-h-screen bg-cream lg:pb-0 ${
                    (priceLines?.savings ?? 0) > 0
                        ? "pb-[calc(5.75rem+env(safe-area-inset-bottom,0px))]"
                        : "pb-[calc(4.75rem+env(safe-area-inset-bottom,0px))]"
                }`}
            >
                <Navbar />
                <div className="pt-24 pb-8 md:pb-16 section-padding">
                    <div className="mx-auto max-w-6xl">
                        {backToWorkshop}

                        <h1 className="sr-only">Book {workshop.title}</h1>
                        <BookingStepIndicator labels={stepLabels} step={displayStep} />

                        {awaitingConfirmation && (
                            <div
                                ref={recoveryRef}
                                role={recovery.busy ? "status" : "alert"}
                                className="mb-6 scroll-mt-24 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3.5 text-sm font-inter text-emerald-900"
                            >
                                <p className="flex items-center gap-2 font-semibold">
                                    {recovery.busy && (
                                        <Loader2
                                            className="h-4 w-4 shrink-0 animate-spin"
                                            aria-hidden="true"
                                        />
                                    )}
                                    {recovery.title}
                                </p>
                                <p className="mt-1 text-emerald-800">
                                    {recovery.busy
                                        ? "Please keep this page open. You will not be charged again."
                                        : error ||
                                          "We will keep trying. You will not be charged again."}
                                </p>
                                {recoveryUnsaved && (
                                    <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
                                        This browser would not save your payment details. Keep this
                                        page open until your booking is confirmed: do not refresh or
                                        close it.
                                    </p>
                                )}
                                {confirmStatus === "stalled" && (
                                    <button
                                        type="button"
                                        onClick={() => void handleRetryCheckout()}
                                        disabled={submitting}
                                        className="mt-3 inline-flex items-center justify-center rounded-full border border-emerald-400 bg-white px-4 py-1.5 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50"
                                    >
                                        {retryCheckoutLabel}
                                    </button>
                                )}
                                {confirmStatus === "signin" && (
                                    <Link
                                        href={loginHref}
                                        className="mt-3 inline-flex items-center justify-center rounded-full border border-emerald-400 bg-white px-4 py-1.5 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-100"
                                    >
                                        Log in again
                                    </Link>
                                )}
                                {confirmStatus === "support" && (
                                    <Link
                                        href="/contact"
                                        className="mt-3 inline-flex items-center justify-center rounded-full border border-emerald-400 bg-white px-4 py-1.5 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-100"
                                    >
                                        Contact support
                                    </Link>
                                )}
                            </div>
                        )}

                        {isOffline && !awaitingConfirmation && (
                            <p
                                role="status"
                                className="mb-6 flex items-center gap-2 rounded-2xl border border-clay/60 bg-white px-4 py-3 text-sm font-inter text-dark-secondary"
                            >
                                <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
                                You are offline. Your details are kept; reconnect to continue.
                            </p>
                        )}

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
                                {canRetryCheckout && view === "review" && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setError(null);
                                            void handleRetryCheckout();
                                        }}
                                        disabled={isCheckoutDisabled}
                                        className="inline-flex items-center justify-center rounded-full border border-red-300 bg-white px-4 py-1.5 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50"
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
                                {/* Phones and tablets have no side column: the full order
                                    summary is the first card, so the workshop, date, price
                                    breakdown and total are always in view. The bottom bar's
                                    total scrolls back up to it. */}
                                <section
                                    id={MOBILE_SUMMARY_ID}
                                    aria-label="Order summary"
                                    className={`card-section !p-4 sm:!p-6 scroll-mt-24 lg:hidden ${
                                        submitting ? "pointer-events-none opacity-50" : ""
                                    }`}
                                >
                                    {summary}
                                </section>
                                {view === "details" ? (
                                    <>
                                        {/* Host first, then your details, then the table/seat picker. */}
                                        <div className="card-section !p-4 sm:!p-6">
                                            <div className="flex items-start gap-4">
                                                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full ring-2 ring-terracotta/20">
                                                    <Image
                                                        src={workshop.hostAvatar}
                                                        alt={workshop.hostName}
                                                        fill
                                                        sizes="56px"
                                                        className="object-cover"
                                                    />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-[11px] font-inter font-bold uppercase tracking-wider text-dark-muted">
                                                        Your host
                                                    </p>
                                                    <p className="font-playfair text-lg font-semibold text-dark">
                                                        {workshop.hostName}
                                                    </p>
                                                    {workshop.hostExperience && (
                                                        <p className="text-xs font-inter font-semibold text-terracotta">
                                                            {workshop.hostExperience}
                                                        </p>
                                                    )}
                                                    {workshop.hostBio && (
                                                        <p className="mt-1 line-clamp-3 text-sm font-inter leading-relaxed text-dark-muted">
                                                            {workshop.hostBio}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
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
                                                showContinueButton={false}
                                            />
                                        </div>
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
                                        <BookingContinueButton
                                            isBusy={isUpdatingSeats}
                                            disabled={detailsCtaDisabled || awaitingConfirmation}
                                            label={detailsCtaLabel}
                                        />
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
                                            confirmBusy={confirmBusy}
                                            total={total}
                                            priceChange={priceChange}
                                            notice={notice}
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
                    savings={priceLines?.savings ?? 0}
                    guests={guests}
                    holdRemainingMs={holdRemainingMs}
                    mode={view === "details" && !awaitingConfirmation ? "details" : "pay"}
                    busy={isUpdatingSeats}
                    disabled={
                        awaitingConfirmation ||
                        (view === "details" ? detailsCtaDisabled : isCheckoutDisabled)
                    }
                    ctaLabel={view === "details" ? detailsCtaLabel : undefined}
                    isRazorpayReady={isRazorpayReady}
                    submitting={submitting}
                    awaitingConfirmation={awaitingConfirmation}
                    confirmBusy={confirmBusy}
                    onPay={() => void handleCheckout()}
                />

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
