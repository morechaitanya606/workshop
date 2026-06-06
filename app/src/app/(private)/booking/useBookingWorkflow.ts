import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/ToastProvider";
import { useAuth } from "@/lib/auth-context";
import { trackEvent } from "@/lib/analytics";
import {
    confirmCheckoutPayment,
    createCheckoutOrder,
    getWorkshopById,
    toApiErrorMessage,
} from "@/lib/api-client";
import type { Workshop } from "@/lib/data";
import type {
    AppliedCoupon,
    BookingFormData,
    ConfirmedBooking,
    FormErrors,
    RazorpayOrderResponse,
} from "./types";

function parseTimestamp(value: string | null) {
    if (!value) return null;
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? null : timestamp;
}

export function useBookingWorkflow() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user, session, loading } = useAuth();
    const toast = useToast();

    const workshopId = searchParams.get("workshop") || "";
    const holdId = searchParams.get("hold") || "";
    const holdExpiresAtParam = searchParams.get("holdExpiresAt") || "";
    const prefilledCouponCode = searchParams.get("coupon")?.trim().toUpperCase() || "";
    const guestsParam = Number.parseInt(searchParams.get("guests") || "1", 10);
    const guests = Number.isFinite(guestsParam) ? Math.max(1, guestsParam) : 1;
    const holdExpiresAtMs = parseTimestamp(holdExpiresAtParam);

    const [workshop, setWorkshop] = useState<Workshop | null>(null);
    const [workshopLoading, setWorkshopLoading] = useState(Boolean(workshopId));
    const [isRazorpayReady, setIsRazorpayReady] = useState(false);
    const [nowMs, setNowMs] = useState(() => Date.now());

    const [step, setStep] = useState(1);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [formErrors, setFormErrors] = useState<FormErrors>({});
    const [confirmedBooking, setConfirmedBooking] = useState<ConfirmedBooking | null>(null);
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

    const isEbActive =
        Boolean(workshop?.earlyBirdEnabled) && (workshop?.earlyBirdDiscountValue || 0) > 0;
    const workshopCreatedAt = workshop?.createdAt ? new Date(workshop.createdAt) : null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysSinceCreated = workshopCreatedAt
        ? Math.ceil((today.getTime() - workshopCreatedAt.getTime()) / (1000 * 60 * 60 * 24))
        : 999;
    const isEbEligible =
        isEbActive && daysSinceCreated <= (workshop?.earlyBirdDaysAfterListing || 0);

    let earlyBirdDiscountTotal = 0;
    if (isEbEligible && workshop) {
        if (workshop.earlyBirdDiscountType === "percentage") {
            earlyBirdDiscountTotal = Math.floor(
                ((workshop.price || 0) * guests * (workshop.earlyBirdDiscountValue || 0)) / 100
            );
        } else {
            earlyBirdDiscountTotal = (workshop.earlyBirdDiscountValue || 0) * guests;
        }
    }

    const subtotalOriginal = (workshop?.price || 0) * guests;
    const subtotal = Math.max(0, subtotalOriginal - earlyBirdDiscountTotal);

    let discountAmount = 0;
    if (appliedCoupon) {
        if (appliedCoupon.type === "percentage") {
            discountAmount = subtotal * (appliedCoupon.discount / 100);
        } else {
            discountAmount = appliedCoupon.discount;
        }
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
                        const message = "Payment was cancelled before completion.";
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
            setError(message);
            toast.error("Checkout failed", message);
            setStep(1);
            setSubmitting(false);
        }
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
    };
}
