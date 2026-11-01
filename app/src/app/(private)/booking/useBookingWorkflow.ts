import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/ToastProvider";
import { useAuth } from "@/lib/auth-context";
import { trackEvent } from "@/lib/analytics";
import { usePlatformSettings } from "@/lib/platform-settings-context";
import {
    confirmCheckoutPayment,
    createBookingHold,
    createCheckoutOrder,
    getWorkshopById,
    isApiClientError,
    type CheckoutOrderResponse,
    type CheckoutPayload,
} from "@/lib/api-client";
import type { Workshop } from "@/lib/data";
import type { PublicOffer } from "@/lib/offers";
import { computeQuote, parseServiceFee } from "@/lib/pricing";
import {
    BOOKINGS_CLOSED_CODE,
    closedWorkshopIdsFromSettings,
    isBookingClosed,
} from "@/lib/workshop-availability";
import type {
    AppliedCoupon,
    BookingFormData,
    ConfirmedBooking,
    FormErrors,
    PendingConfirmationPayload,
    RazorpayOrderResponse,
} from "./types";
import {
    clampGuests,
    extractAvailableSeats,
    getMaxSelectableGuests,
} from "@/components/booking/seat-logic";
import { validateBookingDetails } from "./booking-form-logic";
import {
    apiErrorCode,
    apiErrorText,
    checkCouponCode,
    CONFIRM_ATTEMPT_TIMEOUT_MS,
    fetchWorkshopOffers,
    HOLD_REQUEST_TIMEOUT_MS,
    isNetworkFailure,
    isRetryableRefusal,
    OFFLINE_MESSAGE,
    ORDER_REQUEST_TIMEOUT_MS,
    sleep,
    withTimeout,
    WORKSHOP_LOAD_TIMEOUT_MS,
} from "./booking-network";
import {
    buildBookingPrice,
    describePriceChange,
    priceLinesFromServer,
    reconcileOrder,
    type BookingPriceLines,
} from "./booking-pricing";
import {
    browserStorage,
    classifyConfirmFailure,
    clearPaymentRecovery,
    CONFIRM_RETRY_DELAYS_MS,
    findConfirmedBooking,
    findPaymentRecovery,
    isDeadHoldFailure,
    isRefundedFailure,
    refundNoticeText,
    saveConfirmedBooking,
    savePaymentRecovery,
} from "./payment-recovery";

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

/**
 * - not_found: the workshop really does not exist (404, or no id in the link);
 * - unavailable: it could not be loaded (offline, slow, server error): show Retry, never
 *   "Workshop not found".
 */
export type WorkshopLoadError = "not_found" | "unavailable";

/**
 * Where the confirmation of a paid order stands (see payment-recovery.ts):
 * - idle: nothing paid and unconfirmed;
 * - queued: a saved payment was found on load and is confirmed as soon as the session is known;
 * - confirming / retrying: a confirm request is in flight, or waiting for the next attempt;
 * - stalled: the automatic retries ran out (offline); retried on "online", when the tab comes
 *   back, or with the Retry button;
 * - signin: the session expired; the payment is kept until the customer logs in again;
 * - support: the server could neither book nor refund; the customer must contact support.
 */
export type ConfirmStatus =
    | "idle"
    | "queued"
    | "confirming"
    | "retrying"
    | "stalled"
    | "signin"
    | "support";

/** The total changed between the summary and the order the server created. */
export type PriceChange = {
    previousTotal: number | null;
    newTotal: number;
    reason: string;
};

type KeyedServerLines = { key: string; lines: BookingPriceLines };
type KeyedPriceChange = { key: string; change: PriceChange };
type ReviewedOrder = { key: string; order: RazorpayOrderResponse };

const CONFIRM_FALLBACK_MESSAGE =
    "Payment succeeded, but booking confirmation could not be completed.";
const STALLED_MESSAGE =
    "Payment received. We could not confirm your booking yet because the connection is slow or offline, or our server is busy. We will keep trying, or tap Retry confirmation. You will not be charged again. If it keeps failing on a good connection, contact support.";
const SIGNIN_MESSAGE =
    "Payment received. Your session expired: log in again to finish confirming your booking. You will not be charged twice.";

function isPaise(value: unknown): value is number {
    return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function useBookingWorkflow() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user, session, loading } = useAuth();
    const userId = user?.id ?? null;
    const toast = useToast();
    const { settings } = usePlatformSettings();

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
    const [workshopLoading, setWorkshopLoading] = useState(Boolean(workshopId));
    const [workshopError, setWorkshopError] = useState<WorkshopLoadError | null>(
        workshopId ? null : "not_found"
    );
    const [workshopAttempt, setWorkshopAttempt] = useState(0);
    const [draftGuests, setDraftGuestsState] = useState<number | null>(null);
    const [isUpdatingSeats, setIsUpdatingSeats] = useState(false);
    const [seatError, setSeatError] = useState<string | null>(null);
    // What the hold route last said is really bookable (it already excludes other people's
    // holds, which the workshop row's seats_remaining does not).
    const [liveSeatsRemaining, setLiveSeatsRemaining] = useState<number | null>(null);
    const [isRazorpayReady, setIsRazorpayReady] = useState(false);
    const [nowMs, setNowMs] = useState(() => Date.now());
    const [isOffline, setIsOffline] = useState(false);

    const [step, setStep] = useState(1);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    /** A non-error message about the price (a removed coupon code). */
    const [notice, setNotice] = useState<string | null>(null);
    const [formErrors, setFormErrors] = useState<FormErrors>({});
    const [confirmedBooking, setConfirmedBooking] = useState<ConfirmedBooking | null>(null);
    const [confirmedGuests, setConfirmedGuests] = useState<number | null>(null);
    const [confirmedAttendeeName, setConfirmedAttendeeName] = useState<string | null>(null);
    const [pendingConfirmation, setPendingConfirmation] =
        useState<PendingConfirmationPayload | null>(null);
    const [confirmStatus, setConfirmStatus] = useState<ConfirmStatus>("idle");
    const [storageChecked, setStorageChecked] = useState(false);
    // True when a paid order's confirm payload could not be written to this browser (blocked or
    // full storage): the page then asks the customer to keep it open until confirmed.
    const [recoveryUnsaved, setRecoveryUnsaved] = useState(false);
    // Set when the server refunded a payment it could not turn into a booking: what to tell the
    // customer, until they reserve seats again.
    const [refundNotice, setRefundNotice] = useState<string | null>(null);
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
    const [offers, setOffers] = useState<PublicOffer[]>([]);
    const [closedByServer, setClosedByServer] = useState(false);
    const [serverLines, setServerLines] = useState<KeyedServerLines | null>(null);
    const [priceChange, setPriceChange] = useState<KeyedPriceChange | null>(null);

    const hasTriedPrefilledCouponRef = useRef(false);
    const mountedRef = useRef(true);
    const sessionRef = useRef(session);
    const checkoutInFlightRef = useRef(false);
    const confirmInFlightRef = useRef(false);
    const reviewedOrderRef = useRef<ReviewedOrder | null>(null);
    const pendingConfirmationRef = useRef<PendingConfirmationPayload | null>(null);
    const pendingGuestsRef = useRef<number | null>(null);
    const confirmStatusRef = useRef<ConfirmStatus>("idle");
    const lastCheckedGuestsRef = useRef(guests);
    // The access token the server last answered 401 for: it is not tried again, a new one is.
    const rejectedTokenRef = useRef<string | null>(null);
    const stalledRoundsRef = useRef(0);
    // Counts the rounds that ended stalled. A round that renders nothing in between (everything
    // batched) leaves confirmStatus at "stalled", so the status alone cannot restart the timer.
    const [stallRound, setStallRound] = useState(0);

    // Kept in a ref so an effect in flight is never cancelled just because a new toast
    // object arrived.
    const toastRef = useRef(toast);
    useEffect(() => {
        toastRef.current = toast;
    }, [toast]);
    useEffect(() => {
        sessionRef.current = session;
    }, [session]);
    useEffect(() => {
        pendingConfirmationRef.current = pendingConfirmation;
    }, [pendingConfirmation]);
    useEffect(() => {
        confirmStatusRef.current = confirmStatus;
    }, [confirmStatus]);
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    // Settings come from the server-rendered root layout (no client fetch). A missing service
    // fee is shown as a placeholder, never as a guessed 99; a missing closed list means open.
    const serviceFee = useMemo(
        () =>
            settings?.service_fee === undefined || settings?.service_fee === null
                ? null
                : parseServiceFee(settings.service_fee),
        [settings]
    );
    const closedBySettings = useMemo(
        () => isBookingClosed(workshopId, closedWorkshopIdsFromSettings(settings)),
        [settings, workshopId]
    );
    const bookingsClosed = closedBySettings || closedByServer;

    // The clock for the hold timer (every second) and for the price (offers end): read after
    // mount only, so nothing time-based is ever server-rendered.
    useEffect(() => {
        const holdTicking = Boolean(holdExpiresAtMs && holdExpiresAtMs > Date.now());
        setNowMs(Date.now());
        const timer = window.setInterval(() => setNowMs(Date.now()), holdTicking ? 1000 : 30_000);
        return () => window.clearInterval(timer);
    }, [holdExpiresAtMs]);

    useEffect(() => {
        if (!loading && !user) {
            const holdExpiresQuery = holdExpiresAtParam
                ? `&holdExpiresAt=${encodeURIComponent(holdExpiresAtParam)}`
                : "";
            const couponQuery = prefilledCouponCode
                ? `&coupon=${encodeURIComponent(prefilledCouponCode)}`
                : "";
            const redirectPath = encodeURIComponent(
                `/booking?workshop=${workshopId}&guests=${guests}${holdId ? `&hold=${holdId}` : ""}${holdExpiresQuery}${couponQuery}`
            );
            router.push(`/auth/login?redirect=${redirectPath}`);
        }
    }, [
        guests,
        holdExpiresAtParam,
        holdId,
        loading,
        prefilledCouponCode,
        router,
        user,
        workshopId,
    ]);

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

    // A payment that was taken but not confirmed (dropped connection, closed tab) and a booking
    // confirmed earlier for this hold both survive a refresh (payment-recovery.ts). Only this
    // account's own: the signed-in user must be known before anything is picked up.
    useEffect(() => {
        if (loading || !userId) return;
        const storage = browserStorage();
        const now = Date.now();
        const confirmed = urlHoldId ? findConfirmedBooking(storage, urlHoldId, now, userId) : null;
        if (confirmed && confirmed.workshopId === workshopId) {
            setConfirmedBooking(confirmed.booking);
            setConfirmedGuests(confirmed.guests);
            setConfirmedAttendeeName(confirmed.attendeeName || null);
            setStep(3);
        } else if (!pendingConfirmationRef.current) {
            const entry = findPaymentRecovery(storage, workshopId, now, userId);
            if (entry) {
                pendingGuestsRef.current = entry.guests;
                pendingConfirmationRef.current = entry.payload;
                setPendingConfirmation(entry.payload);
                setConfirmStatus("queued");
                setStep(2);
            }
        }
        setStorageChecked(true);
    }, [loading, urlHoldId, userId, workshopId]);

    useEffect(() => {
        let cancelled = false;

        if (!workshopId) {
            setWorkshopLoading(false);
            setWorkshopError("not_found");
            return;
        }

        setWorkshopLoading(true);
        setWorkshopError(null);
        withTimeout(getWorkshopById(workshopId), WORKSHOP_LOAD_TIMEOUT_MS)
            .then((result) => {
                if (cancelled) return;
                if (result?.workshop) {
                    setWorkshop(result.workshop);
                } else {
                    setWorkshopError("not_found");
                }
            })
            .catch((loadError: unknown) => {
                if (cancelled) return;
                // Only a real "no such workshop" is not-found; anything else is worth a retry.
                const notFound =
                    isApiClientError(loadError) &&
                    (loadError.status === 404 || loadError.status === 400);
                setWorkshopError(notFound ? "not_found" : "unavailable");
            })
            .finally(() => {
                if (!cancelled) setWorkshopLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [workshopId, workshopAttempt]);

    const retryWorkshop = useCallback(() => setWorkshopAttempt((attempt) => attempt + 1), []);

    // Public offers for this workshop. Optional: a failure or a slow answer means no offers. A
    // workshop whose bookings are closed shows none.
    useEffect(() => {
        if (!workshopId || bookingsClosed) {
            setOffers([]);
            return;
        }
        const controller = new AbortController();
        void fetchWorkshopOffers(workshopId, { signal: controller.signal }).then((list) => {
            if (!controller.signal.aborted) setOffers(list);
        });
        return () => controller.abort();
    }, [bookingsClosed, workshopId]);

    const price = useMemo(
        () =>
            workshop
                ? buildBookingPrice({
                      workshop,
                      guests,
                      offers,
                      applied: appliedCoupon,
                      serviceFee,
                      now: nowMs,
                  })
                : null,
        [appliedCoupon, guests, nowMs, offers, serviceFee, workshop]
    );

    // Everything an order is priced from. A server quote or a reviewed order only stands while
    // these are unchanged.
    const sentCouponCode = price?.sendTypedCode && appliedCoupon ? appliedCoupon.code : "";
    const orderKey = `${holdId}|${guests}|${sentCouponCode}`;
    const activeServerLines =
        serverLines && serverLines.key === orderKey ? serverLines.lines : null;
    const activePriceChange =
        priceChange && priceChange.key === orderKey ? priceChange.change : null;
    const lines: BookingPriceLines | null = activeServerLines ?? price;
    const total = lines?.total ?? null;

    const handleApplyCoupon = useCallback(
        async (overrideCode?: string) => {
            const nextCode = (overrideCode ?? couponCode).trim().toUpperCase();
            if (!nextCode || !workshop) return;
            setIsApplyingCoupon(true);
            setCouponError("");
            setNotice(null);

            const subtotal = computeQuote({
                workshop,
                guests,
                serviceFee: 0,
                now: Date.now(),
            }).subtotalAfterEarlyBird;
            const result = await checkCouponCode({
                code: nextCode,
                workshopId: workshop.id,
                subtotal,
                guests,
                accessToken: sessionRef.current?.access_token,
            });
            if (!mountedRef.current) return;

            if (result.ok) {
                setAppliedCoupon(result.coupon);
                setCouponCode("");
                setShowCouponInput(false);
            } else {
                setCouponCode(nextCode);
                setCouponError(result.message);
                setShowCouponInput(true);
            }
            setIsApplyingCoupon(false);
        },
        [couponCode, guests, workshop]
    );

    const removeCoupon = () => {
        setAppliedCoupon(null);
        setCouponError("");
    };

    useEffect(() => {
        if (
            !prefilledCouponCode ||
            hasTriedPrefilledCouponRef.current ||
            !workshop ||
            !session?.access_token ||
            bookingsClosed
        ) {
            return;
        }

        hasTriedPrefilledCouponRef.current = true;
        void handleApplyCoupon(prefilledCouponCode);
    }, [bookingsClosed, handleApplyCoupon, prefilledCouponCode, session?.access_token, workshop]);

    // A code was checked for the old seat count (seat minimums, minimum order): check it again
    // for the new one. Only a definite "no" removes it; an unanswered check keeps it (checkout
    // re-validates anyway and answers COUPON_NO_LONGER_VALID).
    useEffect(() => {
        if (lastCheckedGuestsRef.current === guests) return;
        if (!appliedCoupon) {
            lastCheckedGuestsRef.current = guests;
            return;
        }
        if (!workshop) return;

        let cancelled = false;
        const code = appliedCoupon.code;
        const subtotal = computeQuote({
            workshop,
            guests,
            serviceFee: 0,
            now: Date.now(),
        }).subtotalAfterEarlyBird;
        setIsApplyingCoupon(true);
        void checkCouponCode({
            code,
            workshopId: workshop.id,
            subtotal,
            guests,
            accessToken: sessionRef.current?.access_token,
        }).then((result) => {
            if (cancelled || !mountedRef.current) return;
            // Marked as checked only once answered: a check cut short by a re-render runs again.
            lastCheckedGuestsRef.current = guests;
            setIsApplyingCoupon(false);
            if (result.ok) {
                setAppliedCoupon(result.coupon);
            } else if (result.reason === "rejected") {
                setAppliedCoupon(null);
                setCouponCode(code);
                setShowCouponInput(true);
                const message = `${code} does not apply to ${guests} ${
                    guests === 1 ? "seat" : "seats"
                }: ${result.message}`;
                setCouponError(message);
                toastRef.current.info("Coupon removed", message);
            }
        });
        return () => {
            cancelled = true;
            setIsApplyingCoupon(false);
        };
    }, [appliedCoupon, guests, workshop]);

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

    const awaitingConfirmation = Boolean(pendingConfirmation);

    const isCheckoutDisabled =
        submitting ||
        isUpdatingSeats ||
        isApplyingCoupon ||
        seatChangePending ||
        bookingsClosed ||
        awaitingConfirmation ||
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

    /** The admin closed bookings: stop here, before any payment step. */
    const showBookingsClosed = () => {
        setClosedByServer(true);
        setStep(1);
        setError(null);
        reviewedOrderRef.current = null;
    };

    /**
     * The server says the hold is gone. Forget it (here and in the address) so the page offers
     * "Hold my seats" instead of a Pay or Try again that cannot work, and a refresh does not
     * bring the dead hold back.
     */
    const dropHold = (forGuests: number) => {
        reviewedOrderRef.current = null;
        setHoldOverride({ id: "", guests: forGuests, expiresAtMs: null });
        const params = new URLSearchParams({ workshop: workshopId, guests: String(forGuests) });
        router.replace(`/booking?${params.toString()}`, { scroll: false });
    };

    /**
     * Re-reserves seats for `nextGuests` (default: the draft count). Used when the customer
     * changes the number of chairs, and to recover a missing or expired hold. The hold route
     * releases the caller's previous hold atomically, and rolls that release back if the new
     * request is rejected, so a failure here leaves the existing hold untouched.
     */
    const reholdSeats = async (nextGuests: number = selectedGuests) => {
        if (!workshop || isUpdatingSeats || bookingsClosed) return false;
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
            const result = await withTimeout(
                createBookingHold(session.access_token, {
                    workshopId: workshop.id,
                    guests: requested,
                }),
                HOLD_REQUEST_TIMEOUT_MS
            );
            // The customer left while the hold was being made: never pull them back with a
            // router.replace.
            if (!mountedRef.current) return false;
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
            setNotice(null);
            setRefundNotice(null);
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
            if (!mountedRef.current) return false;
            if (apiErrorCode(holdError) === BOOKINGS_CLOSED_CODE) {
                showBookingsClosed();
                return false;
            }
            const available = extractAvailableSeats(holdError);
            if (available !== null) {
                setLiveSeatsRemaining(available);
                setDraftGuestsState((current) =>
                    current === null
                        ? null
                        : clampGuests(current, getMaxSelectableGuests(available, guests))
                );
            }
            const message = apiErrorText(
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

    const finishConfirmation = (
        payload: PendingConfirmationPayload,
        result: CheckoutOrderResponse
    ) => {
        const storage = browserStorage();
        const booking = result.booking ?? null;
        const bookedGuests = pendingGuestsRef.current ?? guests;
        const attendeeName = `${payload.firstName} ${payload.lastName}`.trim();
        clearPaymentRecovery(storage, payload.holdId, payload.razorpayOrderId);
        if (booking) {
            saveConfirmedBooking(
                storage,
                {
                    workshopId: payload.workshopId,
                    holdId: payload.holdId,
                    guests: bookedGuests,
                    attendeeName,
                    ...(userId ? { userId } : {}),
                    booking,
                },
                Date.now()
            );
        }
        if (!mountedRef.current) return;

        pendingGuestsRef.current = null;
        pendingConfirmationRef.current = null;
        setPendingConfirmation(null);
        setRecoveryUnsaved(false);
        setConfirmStatus("idle");
        setConfirmedBooking(booking);
        setConfirmedGuests(bookedGuests);
        setConfirmedAttendeeName(attendeeName || null);
        setError(null);
        trackEvent("booking_completed", {
            workshopId: payload.workshopId,
            bookingId: booking?.id || null,
            total: booking?.total ?? null,
        });
        toast.success(
            "Booking confirmed",
            "Payment verified and your workshop booking is confirmed."
        );
        setStep(3);
        // A payment recovered from another hold: point the URL at it, so a refresh shows this
        // confirmation again.
        if (payload.holdId !== holdId) {
            const params = new URLSearchParams({
                workshop: payload.workshopId,
                guests: String(bookedGuests),
                hold: payload.holdId,
            });
            router.replace(`/booking?${params.toString()}`, { scroll: false });
        }
    };

    /**
     * Confirms a paid order, retrying on its own while the network is down (backoff 2, 5, 10 s;
     * each attempt times out). The payment stays saved until a definitive answer. Safe to call
     * again: the server is idempotent and a second call while one runs is ignored.
     */
    const runConfirmation = async (payload: PendingConfirmationPayload) => {
        if (confirmInFlightRef.current) return;
        confirmInFlightRef.current = true;
        pendingConfirmationRef.current = payload;
        setPendingConfirmation(payload);
        setStep(2);
        setSubmitting(true);
        setError(null);

        try {
            for (let attempt = 0; attempt <= CONFIRM_RETRY_DELAYS_MS.length; attempt += 1) {
                if (attempt > 0) {
                    setConfirmStatus("retrying");
                    await sleep(CONFIRM_RETRY_DELAYS_MS[attempt - 1]);
                    if (!mountedRef.current) return;
                }

                const accessToken = sessionRef.current?.access_token;
                if (!accessToken) {
                    rejectedTokenRef.current = null;
                    setConfirmStatus("signin");
                    setError(SIGNIN_MESSAGE);
                    return;
                }

                setConfirmStatus("confirming");
                try {
                    const result = await withTimeout(
                        confirmCheckoutPayment(accessToken, payload),
                        CONFIRM_ATTEMPT_TIMEOUT_MS
                    );
                    // Only the server's own "confirmed" / "already_confirmed" is a booking. An
                    // empty 200 (a proxy or captive portal's page, parsed as {}) must never clear
                    // the saved payment and announce a booking that does not exist.
                    if (result?.mode !== "confirmed" && result?.mode !== "already_confirmed") {
                        continue;
                    }
                    finishConfirmation(payload, result);
                    return;
                } catch (confirmError) {
                    if (!mountedRef.current) return;
                    const kind = classifyConfirmFailure(confirmError);
                    if (kind === "retry") continue;

                    if (kind === "final") {
                        clearPaymentRecovery(
                            browserStorage(),
                            payload.holdId,
                            payload.razorpayOrderId
                        );
                        const heldGuests = pendingGuestsRef.current ?? guests;
                        pendingGuestsRef.current = null;
                        pendingConfirmationRef.current = null;
                        setPendingConfirmation(null);
                        setRecoveryUnsaved(false);
                        setConfirmStatus("idle");
                        setStep(1);
                        const message = apiErrorText(confirmError, CONFIRM_FALLBACK_MESSAGE);
                        setError(message);
                        const refunded = isRefundedFailure(confirmError);
                        if (refunded) {
                            // Definitive: the money is already on its way back, so nothing is
                            // retried and the customer starts again.
                            setRefundNotice(refundNoticeText(message));
                            toast.info("Payment refunded", message);
                        } else {
                            toast.error("Booking not confirmed", message);
                        }
                        if (refunded || isDeadHoldFailure(confirmError)) dropHold(heldGuests);
                        return;
                    }
                    if (kind === "signin") {
                        rejectedTokenRef.current = accessToken;
                        setConfirmStatus("signin");
                        setError(SIGNIN_MESSAGE);
                        return;
                    }
                    setConfirmStatus("support");
                    setError(
                        isApiClientError(confirmError) && confirmError.message
                            ? confirmError.message
                            : CONFIRM_FALLBACK_MESSAGE
                    );
                    return;
                }
            }

            setConfirmStatus("stalled");
            setStallRound((round) => round + 1);
            setError(STALLED_MESSAGE);
            // Once per stall: the automatic rounds that follow stay quiet.
            if (stalledRoundsRef.current === 0)
                toast.error("Confirmation pending", STALLED_MESSAGE);
        } finally {
            confirmInFlightRef.current = false;
            if (mountedRef.current) setSubmitting(false);
        }
    };

    const runConfirmationRef = useRef(runConfirmation);
    useEffect(() => {
        runConfirmationRef.current = runConfirmation;
    });

    // A saved payment found on load is confirmed as soon as the session is known.
    useEffect(() => {
        if (confirmStatus !== "queued" || !pendingConfirmation || !session?.access_token) return;
        void runConfirmationRef.current(pendingConfirmation);
    }, [confirmStatus, pendingConfirmation, session?.access_token]);

    // The session came back while "log in again" was showing (restored late, refreshed, or the
    // customer logged in again here): confirm with it. A token the server already refused is
    // not tried again, so a 401 cannot loop.
    useEffect(() => {
        const token = session?.access_token;
        if (confirmStatus !== "signin" || !pendingConfirmation || !token) return;
        if (token === rejectedTokenRef.current) return;
        void runConfirmationRef.current(pendingConfirmation);
    }, [confirmStatus, pendingConfirmation, session?.access_token]);

    // Try the unconfirmed payment again (back online, back on this tab, or a stalled round is
    // due). A second call while one runs is ignored; "support" waits for a person.
    const resumeConfirmation = useCallback(() => {
        if (document.visibilityState === "hidden") return;
        const pending = pendingConfirmationRef.current;
        if (pending && !confirmInFlightRef.current && confirmStatusRef.current !== "support") {
            void runConfirmationRef.current(pending);
        }
    }, []);

    // Back online, or back to this tab.
    useEffect(() => {
        const updateOnline = () => setIsOffline(!navigator.onLine);
        const onOnline = () => {
            updateOnline();
            resumeConfirmation();
        };
        updateOnline();
        window.addEventListener("online", onOnline);
        window.addEventListener("offline", updateOnline);
        document.addEventListener("visibilitychange", resumeConfirmation);
        return () => {
            window.removeEventListener("online", onOnline);
            window.removeEventListener("offline", updateOnline);
            document.removeEventListener("visibilitychange", resumeConfirmation);
        };
    }, [resumeConfirmation]);

    // Still stalled after the quick retries: keep trying every 30 s, then every minute or two,
    // while the page is open ("online" never fires for a connection that is merely bad).
    useEffect(() => {
        if (confirmStatus === "idle") stalledRoundsRef.current = 0;
        if (confirmStatus !== "stalled") return;
        const delay = Math.min(30_000 * 2 ** stalledRoundsRef.current, 120_000);
        const timer = window.setTimeout(() => {
            stalledRoundsRef.current += 1;
            resumeConfirmation();
        }, delay);
        return () => window.clearTimeout(timer);
    }, [confirmStatus, stallRound, resumeConfirmation]);

    // A paid order that could not be saved to this browser is lost if the page closes.
    useEffect(() => {
        if (!awaitingConfirmation || !recoveryUnsaved) return;
        const warn = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = "";
        };
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, [awaitingConfirmation, recoveryUnsaved]);

    useEffect(() => {
        if (workshopError !== "unavailable") return;
        const onOnline = () => setWorkshopAttempt((attempt) => attempt + 1);
        window.addEventListener("online", onOnline);
        return () => window.removeEventListener("online", onOnline);
    }, [workshopError]);

    const openRazorpay = (order: RazorpayOrderResponse, checkoutPayload: CheckoutPayload) => {
        const RazorpayCheckout = window.Razorpay;
        if (!workshop || !RazorpayCheckout) {
            const message = "Razorpay checkout is unavailable right now.";
            setError(message);
            toast.error("Checkout unavailable", message);
            setStep(1);
            setSubmitting(false);
            return;
        }

        let paid = false;
        setStep(2);
        setSubmitting(true);
        const checkout = new RazorpayCheckout({
            key: order.keyId,
            amount: order.amount,
            currency: order.currency,
            name: order.name || "Only Workshops",
            description: order.description || workshop.title,
            order_id: order.id,
            prefill: order.prefill,
            handler: (payment) => {
                paid = true;
                const confirmationPayload: PendingConfirmationPayload = {
                    ...checkoutPayload,
                    razorpayOrderId: payment.razorpay_order_id,
                    razorpayPaymentId: payment.razorpay_payment_id,
                    razorpaySignature: payment.razorpay_signature,
                };
                // Saved BEFORE confirming: if the connection drops now, a refresh (or coming
                // back online) still confirms this payment instead of offering Pay again. When
                // the browser will not store it, the page keeps it in memory and warns.
                const stored = savePaymentRecovery(browserStorage(), confirmationPayload, {
                    guests,
                    nowMs: Date.now(),
                    userId,
                });
                setRecoveryUnsaved(!stored);
                pendingGuestsRef.current = guests;
                void runConfirmation(confirmationPayload);
            },
            modal: {
                ondismiss: () => {
                    if (paid || pendingConfirmationRef.current) return;
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
            if (paid || pendingConfirmationRef.current) return;
            const message = "Payment failed. Please try again.";
            setError(message);
            toast.error("Payment failed", message);
            setStep(1);
            setSubmitting(false);
        });

        checkout.open();
    };

    const handleCheckout = async () => {
        if (!workshop || checkoutInFlightRef.current) return;

        if (pendingConfirmation) {
            await runConfirmation(pendingConfirmation);
            return;
        }
        if (bookingsClosed) return;

        setError(null);
        setNotice(null);
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

        const checkoutPayload: CheckoutPayload = {
            holdId,
            workshopId: workshop.id,
            firstName: trimFormData.firstName,
            lastName: trimFormData.lastName,
            email: trimFormData.email,
            phone: trimFormData.phone,
            notes: formData.notes,
            ...(sentCouponCode ? { couponCode: sentCouponCode } : {}),
        };

        // A fresh tap after the total changed: pay the order the server already priced, at
        // the amount now on screen. The booking is made from the payload sent with the payment,
        // so it carries the details as they are NOW (the customer may have corrected them while
        // looking at the new total); the key guarantees the same hold, seats and code.
        const reviewed = reviewedOrderRef.current;
        reviewedOrderRef.current = null;
        if (reviewed && reviewed.key === orderKey && activePriceChange) {
            setPriceChange(null);
            trackEvent("checkout_started", { workshopId: workshop.id, guests });
            openRazorpay(
                {
                    ...reviewed.order,
                    prefill: {
                        name: `${checkoutPayload.firstName} ${checkoutPayload.lastName}`.trim(),
                        email: checkoutPayload.email,
                        contact: checkoutPayload.phone || undefined,
                    },
                },
                checkoutPayload
            );
            return;
        }

        checkoutInFlightRef.current = true;
        setPriceChange(null);
        setStep(2);
        setSubmitting(true);
        trackEvent("checkout_started", {
            workshopId: workshop.id,
            guests,
        });

        // What the customer saw when they tapped Pay, to compare with the server's price.
        const shownLines = lines;
        const shownTotal = shownLines?.total ?? null;
        const key = orderKey;

        try {
            const orderResult = await withTimeout(
                createCheckoutOrder(session.access_token, checkoutPayload),
                ORDER_REQUEST_TIMEOUT_MS
            );
            const order = orderResult.order as RazorpayOrderResponse | undefined;

            if (!order?.id || !order?.keyId || !isPaise(order.amount)) {
                const message = "Payment order was not created correctly.";
                setError(message);
                toast.error("Checkout failed", message);
                setStep(1);
                setSubmitting(false);
                return;
            }

            // The server's quote is the truth: show it, and if it is not what the customer
            // agreed to, show the new amount and wait for a fresh tap before opening Razorpay.
            const reconciliation = reconcileOrder({
                shownTotal,
                orderAmountPaise: order.amount,
                quote: orderResult.quote,
            });
            const fallbackLines: BookingPriceLines = shownLines ?? {
                listUnitPrice: workshop.price,
                guests,
                listSubtotal: reconciliation.total,
                earlyBirdDiscount: 0,
                earlyBirdEndsAt: null,
                offerLine: null,
                serviceFee: null,
                subtotal: reconciliation.total,
                total: reconciliation.total,
                savings: 0,
            };
            const confirmedLines = priceLinesFromServer(reconciliation, fallbackLines);
            setServerLines({ key, lines: confirmedLines });

            if (reconciliation.changed) {
                reviewedOrderRef.current = { key, order };
                setPriceChange({
                    key,
                    change: {
                        previousTotal: reconciliation.previousTotal,
                        newTotal: reconciliation.total,
                        reason: describePriceChange(fallbackLines, confirmedLines),
                    },
                });
                setStep(1);
                setSubmitting(false);
                trackEvent("checkout_price_changed", {
                    workshopId: workshop.id,
                    shownTotal,
                    total: reconciliation.total,
                });
                return;
            }

            openRazorpay(order, checkoutPayload);
        } catch (checkoutError) {
            setStep(1);
            setSubmitting(false);
            const code = apiErrorCode(checkoutError);
            if (code === BOOKINGS_CLOSED_CODE) {
                showBookingsClosed();
                return;
            }
            if (isDeadHoldFailure(checkoutError)) {
                // The server released this hold (it ran out, or was replaced): reserving again is
                // the only way on, and nothing has been charged.
                const message = `${apiErrorText(
                    checkoutError,
                    "Your seat hold has expired. Please reserve seats again."
                )} You have not been charged.`;
                setError(message);
                toast.error("Seat hold expired", message);
                dropHold(guests);
                return;
            }
            if (code === "COUPON_NO_LONGER_VALID") {
                const removed = appliedCoupon?.code ?? sentCouponCode;
                const reason = apiErrorText(
                    checkoutError,
                    "This coupon code no longer applies to your booking."
                );
                setAppliedCoupon(null);
                setCouponCode("");
                setCouponError(removed ? `${removed}: ${reason}` : reason);
                setNotice(
                    `${reason} We removed the code${removed ? ` ${removed}` : ""}. Check the new total, then tap Pay to continue.`
                );
                toast.info("Coupon removed", reason);
                return;
            }
            // Razorpay opens only after this request succeeds, so nothing has been charged. Say
            // so where a customer on a bad connection would worry. The selection (details, seats,
            // code) is untouched: "Try again" repeats the same checkout.
            const retryable =
                isNetworkFailure(checkoutError) ||
                isRetryableRefusal(checkoutError) ||
                (isApiClientError(checkoutError) && checkoutError.status >= 500);
            const reason = apiErrorText(
                checkoutError,
                "Unable to start checkout right now. Please try again."
            );
            const message = retryable ? `${reason} You have not been charged.` : reason;
            setError(message);
            if (isNetworkFailure(checkoutError)) {
                toast.error("Connection problem", `${OFFLINE_MESSAGE} You have not been charged.`);
            } else {
                toast.error(retryable ? "Please try again" : "Checkout failed", message);
            }
        } finally {
            checkoutInFlightRef.current = false;
        }
    };

    const handleRetryCheckout = async () => {
        if (pendingConfirmation) {
            await runConfirmation(pendingConfirmation);
            return;
        }

        await handleCheckout();
    };

    return {
        workshop,
        workshopId,
        workshopLoading,
        workshopError,
        retryWorkshop,
        loading,
        user,
        nowMs,
        isOffline,
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
        notice,
        formErrors,
        formData,
        handleFormFieldChange,
        handleCheckout,
        handleRetryCheckout,
        canRetryCheckout:
            Boolean(pendingConfirmation) || (!holdExpired && Boolean(holdId) && !bookingsClosed),
        retryCheckoutLabel: pendingConfirmation ? "Retry confirmation" : "Try again",
        isCheckoutDisabled,
        validateDetails: validateForm,
        storageChecked,
        /** True after mount: offer end dates and other clock-based text may render. */
        mounted: storageChecked,
        awaitingConfirmation,
        confirmStatus,
        /** A saved payment is queued, in flight or between attempts (a spinner is honest). */
        confirmBusy:
            confirmStatus === "queued" ||
            confirmStatus === "confirming" ||
            confirmStatus === "retrying",
        /** The paid order could not be saved to this browser: keep the page open. */
        recoveryUnsaved,
        /** The server refunded a payment it could not book: tell the customer, then start again. */
        refundNotice,
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
        serviceFee,
        /** The lines to render: the server's quote once an order exists, else the local quote. */
        priceLines: lines,
        /** The local quote (pricing.ts), with the offers list and the typed-code note. */
        price,
        total,
        priceChange: activePriceChange,
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
        confirmedGuests: confirmedGuests ?? guests,
        confirmedAttendeeName,
    };
}
