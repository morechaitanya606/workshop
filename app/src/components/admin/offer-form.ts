/**
 * Pure helpers for the admin offer editor (src/components/admin/OfferEditor.tsx): the form
 * state, the owner's four presets, IST date entry, and the payload sent to /api/coupons.
 *
 * Dates: the admin types IST wall-clock times (datetime-local, no zone), sent with +05:30.
 * For an advertised offer (Listed, Auto, Community) the admin enters the end customers SEE, and
 * the coupon is stored valid until that end plus OFFER_END_GRACE_MINUTES, so a payment started
 * just before the shown end still confirms. A hidden code ends exactly when entered.
 */

import type { AdminCoupon, AdminCouponDisplayInput, AdminCouponRulesInput } from "@/lib/api-client";
import {
    OFFER_LABEL_MAX_LENGTH,
    OFFER_MIN_GUESTS_MAX,
    offerLabelConflicts,
    offerLabelRevealsCode,
    type OfferVisibility,
} from "@/lib/offers";
import { OFFER_END_GRACE_MINUTES } from "@/lib/pricing";

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const GRACE_MS = OFFER_END_GRACE_MINUTES * 60 * 1000;
const LOCAL_DATETIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** Whether an offer reaches this workshop: it covers every workshop, or lists this one. */
export function offerAppliesToWorkshop(
    coupon: Pick<AdminCoupon, "applicable_workshop_ids">,
    workshopId: string
): boolean {
    const ids = coupon.applicable_workshop_ids ?? [];
    return ids.length === 0 || ids.includes(workshopId);
}

export const OFFER_VISIBILITY_OPTIONS: Array<{
    value: OfferVisibility;
    label: string;
    help: string;
}> = [
    {
        value: "hidden",
        label: "Hidden code",
        help: "Not shown anywhere. Works only when a customer types the code at checkout.",
    },
    {
        value: "listed",
        label: "Listed with Apply",
        help: "Shown under Available offers with its code and a one-tap Apply button.",
    },
    {
        value: "auto",
        label: "Auto price drop",
        help: "Applied automatically when it is the best price. Cards show the lower price. No code is shown.",
    },
    {
        value: "community",
        label: "Community teaser",
        help: "Pages show a teaser for WhatsApp community members. Share the code only inside the community.",
    },
];

export function isAdvertised(visibility: OfferVisibility): boolean {
    return visibility !== "hidden";
}

/** "2026-10-31T23:59" (IST wall clock) -> "2026-10-31T23:59:00+05:30", or null when invalid. */
export function istLocalToIso(local: string): string | null {
    const match = LOCAL_DATETIME.exec(local.trim());
    if (!match) return null;
    const [, y, mo, d, h, mi] = match;
    const iso = `${y}-${mo}-${d}T${h}:${mi}:00+05:30`;
    const ms = new Date(iso).getTime();
    if (Number.isNaN(ms)) return null;
    // Reject impossible dates that Date silently rolls over (31 Feb).
    return isoToIstLocal(new Date(ms).toISOString()) === `${y}-${mo}-${d}T${h}:${mi}` ? iso : null;
}

/** Any ISO instant -> the IST wall clock for a datetime-local input ("" when unreadable). */
export function isoToIstLocal(iso: string | null | undefined): string {
    if (!iso) return "";
    const ms = new Date(iso).getTime();
    if (Number.isNaN(ms)) return "";
    return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 16);
}

/** The stored valid_until for an end entered by the admin (advertised ends get the grace). */
export function validUntilFromEnteredEnd(
    local: string,
    visibility: OfferVisibility
): string | null {
    const iso = istLocalToIso(local);
    if (!iso) return null;
    if (!isAdvertised(visibility)) return iso;
    return isoWithIstOffset(new Date(iso).getTime() + GRACE_MS);
}

/** The end to show in the editor for a stored valid_until (advertised: minus the grace). */
export function enteredEndFromValidUntil(
    validUntil: string | null | undefined,
    visibility: OfferVisibility
): string {
    if (!validUntil) return "";
    const ms = new Date(validUntil).getTime();
    if (Number.isNaN(ms)) return "";
    return isoToIstLocal(new Date(isAdvertised(visibility) ? ms - GRACE_MS : ms).toISOString());
}

function isoWithIstOffset(ms: number): string {
    return `${new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 19)}+05:30`;
}

/** "31 Oct 2026, 11:59 pm IST" for helper text. */
export function formatIst(iso: string | null | undefined): string {
    if (!iso) return "";
    const ms = new Date(iso).getTime();
    if (Number.isNaN(ms)) return "";
    return `${new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
    }).format(new Date(ms))} IST`;
}

export type OfferFormState = {
    code: string;
    discountType: "percentage" | "fixed";
    discountValue: string;
    visibility: OfferVisibility;
    label: string;
    /** IST wall clock, datetime-local format; "" = from now. */
    startsAt: string;
    /** IST wall clock as entered: the ADVERTISED end for advertised offers; "" = no end. */
    endsAt: string;
    showEndDate: boolean;
    /** "" = no seat minimum. */
    minGuests: string;
    /** "" = unlimited. */
    maxUses: string;
    /** "" = none. */
    minOrderAmount: string;
    /** null = all workshops. */
    workshopIds: string[] | null;
};

export const EMPTY_OFFER_FORM: OfferFormState = {
    code: "",
    discountType: "percentage",
    discountValue: "",
    visibility: "hidden",
    label: "",
    startsAt: "",
    endsAt: "",
    showEndDate: false,
    minGuests: "",
    maxUses: "",
    minOrderAmount: "",
    workshopIds: null,
};

export type OfferPresetId = "limited_time" | "community" | "public" | "group";

export const OFFER_PRESETS: Array<{
    id: OfferPresetId;
    title: string;
    description: string;
    apply: (form: OfferFormState) => OfferFormState;
}> = [
    {
        id: "limited_time",
        title: "Limited-time 10%",
        description: "Applied automatically until the end date, then the price goes back up.",
        apply: (form) => ({
            ...form,
            discountType: "percentage",
            discountValue: "10",
            visibility: "auto",
            label: "Limited-time offer",
            showEndDate: true,
            minGuests: "",
            maxUses: "",
        }),
    },
    {
        id: "community",
        title: "Community price drop",
        description: "Pages show a teaser; share the code only in the WhatsApp community.",
        apply: (form) => ({
            ...form,
            visibility: "community",
            label: "Community price drop",
            maxUses: "",
        }),
    },
    {
        id: "public",
        title: "Public coupon",
        description: "Listed under Available offers with one-tap Apply.",
        apply: (form) => ({ ...form, visibility: "listed" }),
    },
    {
        id: "group",
        title: "Group offer",
        description: "Applied automatically to bookings of 2 or more seats.",
        apply: (form) => ({
            ...form,
            visibility: "auto",
            label: "Group offer",
            minGuests: "2",
            maxUses: "",
        }),
    },
];

/** The editor's state for an existing coupon. */
export function formFromCoupon(coupon: AdminCoupon): OfferFormState {
    const visibility = coupon.visibility ?? "hidden";
    const numberText = (value: number | null | undefined) =>
        value === null || value === undefined || !Number.isFinite(Number(value))
            ? ""
            : String(Number(value));
    return {
        code: coupon.code,
        discountType: coupon.discount_type,
        discountValue: numberText(coupon.discount_value),
        visibility,
        label: coupon.label ?? "",
        startsAt: isoToIstLocal(coupon.valid_from),
        endsAt: enteredEndFromValidUntil(coupon.valid_until, visibility),
        showEndDate: coupon.show_end_date === true,
        minGuests: coupon.min_guests && coupon.min_guests > 1 ? String(coupon.min_guests) : "",
        maxUses: numberText(coupon.max_uses),
        minOrderAmount:
            coupon.min_order_amount && Number(coupon.min_order_amount) > 0
                ? numberText(coupon.min_order_amount)
                : "",
        workshopIds: coupon.applicable_workshop_ids?.length
            ? [...coupon.applicable_workshop_ids]
            : null,
    };
}

export type OfferFormCheck = {
    /** Field -> message; the form must not be sent while any is present. */
    errors: Partial<Record<keyof OfferFormState, string>>;
    /** Advice only. */
    warnings: string[];
};

function parseWhole(text: string): number | null {
    if (!text.trim()) return null;
    const value = Number(text);
    return Number.isInteger(value) ? value : Number.NaN;
}

/** Client-side checks, mirroring the server (which re-checks everything). */
export function checkOfferForm(
    form: OfferFormState,
    { isNew }: { isNew: boolean }
): OfferFormCheck {
    const errors: OfferFormCheck["errors"] = {};
    const warnings: string[] = [];
    const code = form.code.trim().toUpperCase();

    if (isNew && !/^[A-Z0-9_-]{3,32}$/.test(code)) {
        errors.code = "Use 3 to 32 letters, digits, - or _.";
    }

    const value = Number(form.discountValue);
    if (!form.discountValue.trim() || !Number.isFinite(value) || value <= 0) {
        errors.discountValue = "Enter an amount above 0.";
    } else if (form.discountType === "percentage" && value > 100) {
        errors.discountValue = "A percentage cannot exceed 100.";
    } else if (value > 1_000_000) {
        errors.discountValue = "That amount is too large.";
    }

    const label = form.label.trim();
    if (label.length > OFFER_LABEL_MAX_LENGTH) {
        errors.label = `Keep the label to ${OFFER_LABEL_MAX_LENGTH} characters or fewer.`;
    } else if (label && form.visibility !== "listed" && offerLabelRevealsCode(label, code)) {
        errors.label =
            "The label contains the coupon code, and labels are public. Remove the code, or make the offer Listed.";
    }

    const minGuests = parseWhole(form.minGuests);
    if (
        minGuests !== null &&
        (Number.isNaN(minGuests) || minGuests < 2 || minGuests > OFFER_MIN_GUESTS_MAX)
    ) {
        errors.minGuests = `Minimum seats must be a whole number from 2 to ${OFFER_MIN_GUESTS_MAX}, or empty.`;
    }

    const maxUses = parseWhole(form.maxUses);
    if (maxUses !== null && (Number.isNaN(maxUses) || maxUses < 1)) {
        errors.maxUses = "Max uses must be a whole number of 1 or more, or empty.";
    }

    const minOrder = form.minOrderAmount.trim() ? Number(form.minOrderAmount) : null;
    if (minOrder !== null && (!Number.isFinite(minOrder) || minOrder < 0)) {
        errors.minOrderAmount = "Minimum order must be 0 or more, or empty.";
    }

    const startIso = form.startsAt ? istLocalToIso(form.startsAt) : null;
    if (form.startsAt && !startIso) errors.startsAt = "Enter a valid start date and time.";
    const endIso = form.endsAt ? istLocalToIso(form.endsAt) : null;
    if (form.endsAt && !endIso) errors.endsAt = "Enter a valid end date and time.";
    if (startIso && endIso && new Date(endIso) <= new Date(startIso)) {
        errors.endsAt = "The end must be after the start.";
    }
    if (form.showEndDate && !form.endsAt) {
        errors.endsAt = "Add an end date to show it to customers.";
    }

    if (form.workshopIds !== null && form.workshopIds.length === 0) {
        errors.workshopIds = "Choose at least one workshop, or set it to all workshops.";
    }

    if (
        maxUses !== null &&
        !Number.isNaN(maxUses) &&
        (form.visibility === "auto" || form.visibility === "community")
    ) {
        warnings.push(
            "Leave max uses empty for Auto and Community offers: uses are counted after payment, so buyers at the limit could be refunded."
        );
    }
    if (
        label &&
        !errors.discountValue &&
        offerLabelConflicts(label, {
            discountType: form.discountType,
            discountValue: value,
            minOrderAmount: minOrder ?? 0,
        })
    ) {
        warnings.push(
            "This label states a different discount, minimum order or a per-seat amount. Customers will see the default label instead."
        );
    }
    if (form.visibility === "auto" && minGuests === null && !form.endsAt) {
        warnings.push(
            "An Auto offer with no end lowers every matching price until you switch it off."
        );
    }

    return { errors, warnings };
}

export type OfferPayload = AdminCouponRulesInput &
    AdminCouponDisplayInput & {
        code?: string;
        discount_type: "percentage" | "fixed";
        discount_value: number;
    };

/**
 * The body for createAdminCoupon (isNew) or updateAdminCoupon. Run checkOfferForm first. On a
 * create, empty optional fields are left out so the column defaults apply; on an update they
 * are cleared explicitly. applicable_categories is never sent (no editor field), so a stored
 * category limit is kept.
 */
export function offerPayloadFromForm(
    form: OfferFormState,
    { isNew }: { isNew: boolean }
): OfferPayload {
    const minGuests = parseWhole(form.minGuests);
    const maxUses = parseWhole(form.maxUses);
    const minOrder = form.minOrderAmount.trim() ? Number(form.minOrderAmount) : null;
    const validFrom = form.startsAt ? istLocalToIso(form.startsAt) : null;
    const validUntil = form.endsAt ? validUntilFromEnteredEnd(form.endsAt, form.visibility) : null;
    const label = form.label.trim();

    const payload: OfferPayload = {
        discount_type: form.discountType,
        discount_value: Number(form.discountValue),
        applicable_workshop_ids: form.workshopIds,
        visibility: form.visibility,
        label: label || null,
        min_guests: minGuests && minGuests > 1 ? minGuests : null,
        show_end_date: form.showEndDate,
    };

    if (isNew) {
        payload.code = form.code.trim().toUpperCase();
        if (maxUses !== null) payload.max_uses = maxUses;
        if (minOrder !== null) payload.min_order_amount = minOrder;
        if (validFrom) payload.valid_from = validFrom;
        if (validUntil) payload.valid_until = validUntil;
    } else {
        payload.max_uses = maxUses;
        payload.min_order_amount = minOrder ?? 0;
        // An empty start is left as stored (the column defaults to the creation time).
        if (validFrom) payload.valid_from = validFrom;
        payload.valid_until = validUntil;
    }

    return payload;
}

export function visibilityLabel(visibility: OfferVisibility | undefined): string {
    return (
        OFFER_VISIBILITY_OPTIONS.find((option) => option.value === (visibility ?? "hidden"))
            ?.label ?? "Hidden code"
    );
}
