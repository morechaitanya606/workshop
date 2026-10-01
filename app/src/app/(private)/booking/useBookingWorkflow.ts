import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/ToastProvider";
import { useAuth } from "@/lib/auth-context";
import { trackEvent } from "@/lib/analytics";
import {
    confirmCheckoutPayment,
    createBookingHold,
    createCheckoutOrder,
    getWorkshopById,
    toApiErrorMessage,
    type CheckoutPayload,
} from "@/lib/api-client";
import type { Workshop } from "@/lib/data";
import type {
    AppliedCoupon,
    BookingFormData,
    ConfirmedBooking,
    FormErrors,
    RazorpayOrderResponse,
} from "./types";
import { computeEarlyBirdDiscount } from "@/lib/booking-time";
import {
    clampGuests,
    extractAvailableSeats,
    getMaxSelectableGuests,
} from "@/components/booking/seat-logic";
import { validateBookingDetails } from "./booking-form-logic";

type HoldOverride = {
    id: string;
    guests: number;
    expiresAtMs: number | null;
};

function parseTimestamp(value: string | null) {
    if (!value) return null;
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? null : timestamp;
}

type PendingConfirmationPayload = CheckoutPayload & {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
};

export function useBookingWorkflow() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user, session, loading } = useAuth();
    const toast = useToast();

    const workshopId = searchParams.get("workshop") || "";
    const urlHoldId = searchParams.get("hold") || "";
    const holdExpiresAtParam = searchParams.get("holdExpiresAt") || "";
    const prefilledCouponCode = searchParams.get("coupon")?.trim().toUpperCase() || "";
    const guestsParam = Number.parseInt(searchParams.get("guests") || "1", 10);
    const urlGuests = Number.isFinite(guestsParam) ? Math.max(1, guestsParam) : 1;

    // Changing the seat count here means asking the hold route for a new hold (it releases the
    // caller's previous one in the same transaction). The result lives in this override so
    // the page reacts immediately; the URL is kept in step for refreshes.
    const [holdOverride, setHoldOverride] = useState<HoldOverride | null>(null);
    const holdId = holdOverride?.id ?? urlHoldId;
    const guests = holdOverride?.guests ?? urlGuests;
    const holdExpiresAtMs = holdOverride
        ? holdOverride.expiresAtMs
        : parseTimestamp(holdExpiresAtParam);

    const [workshop, setWorkshop] = useState<Workshop | null>(null);
    const [draftGuests, setDraftGuestsState] = useState<number | null>(null);
    const [isUpdatingSeats, setIsUpdatingSeats] = useState(false);
    const [seatError, setSeatError] = useState<string | null>(null);
    // What the hold route last said is really bookable (it already excludes other people's
    // holds, which the workshop row's seats_remaining does not).
    const [liveSeatsRemaining, setLiveSeatsRemaining] = useState<number | null>(null);
    const [workshopLoading, setWorkshopLoading] = useState(Boolean(workshopId));
    const [isRazorpayReady, setIsRazorpayReady] = useState(false);
    const [nowMs, setNowMs] = useState(() => Date.now());

    const [step, setStep] = useState(1);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [formErrors, setFormErrors] = useState<FormErrors>({});
    const [confirmedBooking, setConfirmedBooking] = useState<ConfirmedBooking | null>(null);
    const [pendingConfirmationPayload, setPendingConfirmationPayload] =
        useState<PendingConfirmationPayload | null>(null);
    const [formData, setFormData] = useState<BookingFormData>({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        notes: "",
    });
    const [couponCode, setCouponCode] = useState(prefilledCouponCode);
    const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
    const [couponError, setCouponError] = useState("");
    const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);
    const [showCouponInput, setShowCouponInput] = useState(Boolean(prefilledCouponCode));
    const [serviceFee, setServiceFee] = useState(99);
    const hasTriedPrefilledCouponRef = useRef(false);

    useEffect(() => {
        fetch("/api/settings")
            .then((res) => res.json())
            .then((data) => {
                if (data?.settings?.service_fee !== undefined) {
                    setServiceFee(data.settings.service_fee);
                }
            })
            .catch(() => {});
    }, []);

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
    }, [guests, holdExpiresAtParam, holdId, loading, router, user, workshopId]);

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
                if (!cancelled) {
                    setWorkshop(null);
                }
            } finally {
                if (!cancelled) {
                    setWorkshopLoading(false);
                }
            }
        };

        void fetchWorkshop();

        return () => {
            cancelled = true;
        };
    }, [workshopId]);

    // Shared with the checkout route so the quoted price and the server-side price cannot
    // drift. Local-midnight day maths used to be off by one against the UTC-based SQL, which
    // is exactly the class of mismatch that fails confirmation after capture.
    const earlyBirdDiscountTotal = computeEarlyBirdDiscount({
        price: workshop?.price || 0,
        guests,
        enabled: workshop?.earlyBirdEnabled,
        discountType: workshop?.earlyBirdDiscountType,
        discountValue: workshop?.earlyBirdDiscountValue,
        daysAfterListing: workshop?.earlyBirdDaysAfterListing,
        createdAt: workshop?.createdAt,
    });
    const isEbEligible = earlyBirdDiscountTotal > 0;

    const subtotalOriginal = (workshop?.price || 0) * guests;
    const subtotal = Math.max(0, subtotalOriginal - earlyBirdDiscountTotal);

    let discountAmount = 0;
    if (appliedCoupon) {
        // Mirrors the server and the SQL exactly: multiply first, then round and clamp.
        // Dividing first drifts by a rupee on some percentages, which would quote the buyer
        // a total that differs from what is actually charged.
        const rawDiscount =
            appliedCoupon.type === "percentage"
                ? (subtotal * Number(appliedCoupon.discount)) / 100
                : Number(appliedCoupon.discount);
        discountAmount = Math.min(subtotal, Math.max(0, Math.round(rawDiscount)));
    }

    const total = Math.max(0, subtotal - discountAmount) + serviceFee;

    const handleApplyCoupon = useCallback(
        async (overrideCode?: string) => {
            const nextCode = (overrideCode ?? couponCode).trim().toUpperCase();
            if (!nextCode) return;
            setIsApplyingCoupon(true);
            setCouponError("");

            try {
                const res = await fetch("/api/coupons/validate", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        ...(session?.access_token
                            ? { Authorization: `Bearer ${session.access_token}` }
                            : {}),
                    },
                    body: JSON.stringify({
                        code: nextCode,
                        workshopId,
                        subtotal,
                    }),
                });
                const data = await res.json();

                if (res.ok && data.valid) {
                    setAppliedCoupon({
                        code: nextCode,
                        discount: data.discount,
                        type: data.type,
                    });
                    setCouponCode("");
                    setShowCouponInput(false);
                } else {
                    setCouponError(data.message || "Invalid or expired coupon code");
                    setShowCouponInput(true);
                }
            } catch {
                setCouponError("Failed to apply coupon");
                setShowCouponInput(true);
            } finally {
                setIsApplyingCoupon(false);
            }
        },
        [couponCode, session?.access_token, subtotal, workshopId]
    );

    const removeCoupon = () => {
        setAppliedCoupon(null);
        setCouponError("");
    };

    useEffect(() => {
        if (!prefilledCouponCode || hasTriedPrefilledCouponRef.current || !workshop) {
            return;
        }

        hasTriedPrefilledCouponRef.current = true;
        void handleApplyCoupon(prefilledCouponCode);
    }, [handleApplyCoupon, prefilledCouponCode, workshop]);

    const holdRemainingMs = holdExpiresAtMs ? holdExpiresAtMs - nowMs : null;
    const holdExpired = typeof holdRemainingMs === "number" && holdRemainingMs <= 0;

    const trimFormData = {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
    };

    // Seat picking. `seatsRemaining` excludes the customer's own hold's effect on the workshop
    // row (holds are tracked separately), so "yours" chairs are drawn out of it.
    const seatsRemaining = liveSeatsRemaining ?? workshop?.seatsRemaining ?? 0;
    const maxSelectableGuests = getMaxSelectableGuests(seatsRemaining, guests);
    const selectedGuests = draftGuests ?? guests;
    const seatChangePending = selectedGuests !== guests;

    const setDraftGuests = useCallback(
        (next: number) => {
            const clamped = clampGuests(next, maxSelectableGuests);
            setSeatError(null);
            setDraftGuestsState(clamped === guests ? null : clamped);
        },
        [guests, maxSelectableGuests]
    );

    const resetDraftGuests = useCallback(() => {
        setSeatError(null);
        setDraftGuestsState(null);
    }, []);

    const isCheckoutDisabled =
        submitting ||
        isUpdatingSeats ||
        seatChangePending ||
        !isRazorpayReady ||
        !trimFormData.firstName ||
        !trimFormData.lastName ||
        !trimFormData.email ||
        !trimFormData.phone ||
        !holdId ||
        holdExpired;

    const validateForm = () => {
        const nextErrors: FormErrors = validateBookingDetails(trimFormData);

        setFormErrors(nextErrors);
        return Object.keys(nextErrors).length === 0;
    };

    useEffect(() => {
        if (!holdExpired) return;
        setError((prev) => prev || "Your seat hold has expired. Please reserve seats again.");
    }, [holdExpired]);

    const handleFormFieldChange = (field: keyof BookingFormData, value: string) => {
        setFormData((prev) => ({
            ...prev,
            [field]: value,
        }));

        if (field !== "notes") {
            setFormErrors((prev) => ({
                ...prev,
                [field]: undefined,
            }));
        }
    };

    /**
     * Re-reserves seats for `nextGuests` (default: the draft count). Used when the customer
     * changes the number of chairs, and to recover a missing or expired hold. The hold route
     * releases the caller's previous hold atomically, and rolls that release back if the new
     * request is rejected, so a failure here leaves the existing hold untouched.
     */
    const reholdSeats = async (nextGuests: number = selectedGuests) => {
        if (!workshop || isUpdatingSeats) return false;
        if (!session?.access_token) {
            const message = "Your session expired. Please log in again.";
            setSeatError(message);
            toast.error("Session expired", message);
            return false;
        }

        const requested = clampGuests(nextGuests, maxSelectableGuests);
        setIsUpdatingSeats(true);
        setSeatError(null);

        try {
            const result = await createBookingHold(session.access_token, {
                workshopId: workshop.id,
                guests: requested,
            });
            const hold = result?.hold;
            if (!hold?.id) {
                const message = "Seat hold was created but could not be verified.";
                setSeatError(message);
                toast.error("Seat hold failed", message);
                return false;
            }

            const nextHold: HoldOverride = {
                id: hold.id,
                guests: Number(hold.guests) > 0 ? Number(hold.guests) : requested,
                expiresAtMs: parseTimestamp(hold.expires_at || null),
            };
            setHoldOverride(nextHold);
            setDraftGuestsState(null);
            setError(null);
            setNowMs(Date.now());
            trackEvent("booking_seats_changed", {
                workshopId: workshop.id,
                guests: nextHold.guests,
                previousGuests: guests,
            });

            const params = new URLSearchParams({
                workshop: workshop.id,
                guests: String(nextHold.guests),
                hold: nextHold.id,
            });
            if (prefilledCouponCode) params.set("coupon", prefilledCouponCode);
            if (hold.expires_at) params.set("holdExpiresAt", hold.expires_at);
            router.replace(`/booking?${params.toString()}`, { scroll: false });
            return true;
        } catch (holdError) {
            const available = extractAvailableSeats(holdError);
            if (available !== null) {
                setLiveSeatsRemaining(available);
                setDraftGuestsState((current) =>
                    current === null
                        ? null
                        : clampGuests(current, getMaxSelectableGuests(available, guests))
                );
            }
            const message = toApiErrorMessage(
                holdError,
                "Unable to update your seats. Please try again."
            );
            setSeatError(message);
            toast.error("Could not update seats", message);
            return false;
        } finally {
            setIsUpdatingSeats(false);
        }
    };

    const confirmPayment = async (confirmationPayload: PendingConfirmationPayload) => {
        if (!session?.access_token) {
            const message = "Your session expired. Please log in again.";
            setError(message);
            toast.error("Session expired", message);
            setSubmitting(false);
            return;
        }
        if (!workshop) return;

        setStep(2);
        setSubmitting(true);
        setError(null);

        try {
            const confirmResult = await confirmCheckoutPayment(
                session.access_token,
                confirmationPayload
            );

            setPendingConfirmationPayload(null);
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
        } catch (confirmationError) {
            setPendingConfirmationPayload(confirmationPayload);
            const message = toApiErrorMessage(
                confirmationError,
                "Payment succeeded, but booking confirmation could not be completed."
            );
            setError(message);
            toast.error("Verification pending", message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleCheckout = async () => {
        if (!workshop) return;

        if (pendingConfirmationPayload) {
            await confirmPayment(pendingConfirmationPayload);
            return;
        }

        setError(null);
        setPendingConfirmationPayload(null);
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
            ...(appliedCoupon ? { couponCode: appliedCoupon.code } : {}),
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
                    const confirmationPayload = {
                        ...checkoutPayload,
                        razorpayOrderId: payment.razorpay_order_id,
                        razorpayPaymentId: payment.razorpay_payment_id,
                        razorpaySignature: payment.razorpay_signature,
                    };

                    setPendingConfirmationPayload(confirmationPayload);
                    await confirmPayment(confirmationPayload);
                },
                modal: {
                    ondismiss: () => {
                        const message = "Payment was cancelled before completion.";
                        setPendingConfirmationPayload(null);
                        setError(message);
                        toast.info("Payment cancelled", message);
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
                setPendingConfirmationPayload(null);
                setError(message);
                toast.error("Payment failed", message);
                setStep(1);
                setSubmitting(false);
            });

            checkout.open();
        } catch (checkoutError) {
            const message = toApiErrorMessage(
                checkoutError,
                "Unable to start checkout right now. Please try again."
            );
            setPendingConfirmationPayload(null);
            setError(message);
            toast.error("Checkout failed", message);
            setStep(1);
            setSubmitting(false);
        }
    };

    const handleRetryCheckout = async () => {
        if (pendingConfirmationPayload) {
            await confirmPayment(pendingConfirmationPayload);
            return;
        }

        await handleCheckout();
    };

    return {
        workshop,
        workshopLoading,
        loading,
        user,
        nowMs,
        holdExpiresAtMs,
        holdId,
        holdExpired,
        holdRemainingMs,
        isRazorpayReady,
        setIsRazorpayReady,
        step,
        setStep,
        submitting,
        error,
        setError,
        formErrors,
        formData,
        handleFormFieldChange,
        handleCheckout,
        handleRetryCheckout,
        canRetryCheckout: Boolean(pendingConfirmationPayload) || (!holdExpired && Boolean(holdId)),
        retryCheckoutLabel: pendingConfirmationPayload ? "Retry confirmation" : "Try again",
        isCheckoutDisabled,
        validateDetails: validateForm,
        awaitingConfirmation: Boolean(pendingConfirmationPayload),
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
    };
}
