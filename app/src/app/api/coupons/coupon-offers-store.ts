import "server-only";

import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

import {
    readSettingSnapshot,
    writeSettingIfUnchanged,
} from "@/app/api/settings/platform-setting-cas";
import type { SettingVersion } from "@/app/api/settings/platform-setting-cas";
import { OFFERS_TAG, PLATFORM_SETTINGS_TAG } from "@/lib/cached-reads";
import type { Json } from "@/lib/database.types";
import {
    COUPON_OFFERS_MAX_ENTRIES,
    COUPON_OFFERS_SETTING_KEY,
    offerSettingsFor,
    parseCouponOffersSetting,
    serializeCouponOffersSetting,
    validateCouponOffersSetting,
    type CouponOffersSetting,
    type OfferDisplaySettings,
    type OfferVisibility,
    type StoredOfferDisplaySettings,
} from "@/lib/offers";
import { findLabelsRevealingCodes } from "@/lib/offers-server";
import type { SupabaseServerClient } from "@/lib/supabase-server";

/**
 * The coupon routes' read-modify-write of the "coupon_offers" platform setting (how each coupon
 * is shown: src/lib/offers.ts). Only these routes write it: PATCH /api/settings refuses the key,
 * so a whole-object save from a stale page can never drop another coupon's entry.
 *
 * Every write reads the stored value fresh with the service role, changes one coupon's entry,
 * validates the whole value and runs findLabelsRevealingCodes before the write (the setting is
 * publicly readable, so a label must never spell out a hidden or community code). A failed read
 * writes nothing: an empty fallback written back would hide every offer. The write is a
 * compare-and-set (platform-setting-cas.ts): if another save changed the setting after the read,
 * the change is applied again to the newer value, so two saves at once keep both entries.
 */

const ROUTE = "coupon_offers";
/** Each retry needs a competing save in between. */
const MAX_WRITE_ATTEMPTS = 4;

export const COUPON_DISPLAY_FIELDS = [
    "visibility",
    "label",
    "min_guests",
    "show_end_date",
] as const;

/** The display fields as the admin API sends them (snake_case, like the coupon columns). */
export type CouponDisplayInput = {
    visibility?: OfferVisibility;
    label?: string | null;
    min_guests?: number | null;
    show_end_date?: boolean;
};

/** The display fields every admin coupon response carries. */
export type AdminCouponDisplay = {
    visibility: OfferVisibility;
    label: string | null;
    min_guests: number | null;
    show_end_date: boolean;
};

export function pickDisplayInput(input: CouponDisplayInput): CouponDisplayInput {
    const picked: CouponDisplayInput = {};
    if (input.visibility !== undefined) picked.visibility = input.visibility;
    if (input.label !== undefined) picked.label = input.label;
    if (input.min_guests !== undefined) picked.min_guests = input.min_guests;
    if (input.show_end_date !== undefined) picked.show_end_date = input.show_end_date;
    return picked;
}

export function hasDisplayInput(input: CouponDisplayInput): boolean {
    return COUPON_DISPLAY_FIELDS.some((field) => input[field] !== undefined);
}

/** True when a NEW coupon with this input needs an entry (anything but a plain hidden code). */
export function displayInputNeedsEntry(input: CouponDisplayInput): boolean {
    return (
        (input.visibility !== undefined && input.visibility !== "hidden") ||
        Boolean(input.label) ||
        (typeof input.min_guests === "number" && input.min_guests > 1) ||
        input.show_end_date === true
    );
}

/** Display settings as the admin API returns them ("hidden" with nothing else = no entry). */
export function displayToAdmin(display: OfferDisplaySettings | undefined): AdminCouponDisplay {
    return {
        visibility: display?.visibility ?? "hidden",
        label: display?.label ?? null,
        min_guests: display?.minGuests && display.minGuests > 1 ? display.minGuests : null,
        show_end_date: display?.showEndDate === true,
    };
}

export function withAdminDisplay<T extends { id: string }>(
    row: T,
    setting: CouponOffersSetting
): T & AdminCouponDisplay {
    return { ...row, ...displayToAdmin(offerSettingsFor(setting, row.id)) };
}

function isDefaultDisplay(display: OfferDisplaySettings): boolean {
    return (
        display.visibility === "hidden" &&
        !display.label &&
        !(display.minGuests && display.minGuests > 1) &&
        !display.showEndDate
    );
}

/**
 * The whole setting after applying a (partial) display patch to one coupon: fields not sent keep
 * their stored value. An entry left with nothing but "hidden" is removed (no entry = a hidden
 * typed code, exactly today's behaviour). Never mutates `setting`.
 */
export function applyDisplayInput(
    setting: CouponOffersSetting,
    couponId: string,
    input: CouponDisplayInput
): CouponOffersSetting {
    const id = couponId.toLowerCase();
    const current: OfferDisplaySettings = offerSettingsFor(setting, id) ?? {
        visibility: "hidden",
    };
    const next: OfferDisplaySettings = { visibility: input.visibility ?? current.visibility };

    const label = input.label !== undefined ? input.label : current.label;
    if (label) next.label = label;
    const minGuests = input.min_guests !== undefined ? input.min_guests : current.minGuests;
    if (minGuests && minGuests > 1) next.minGuests = minGuests;
    const showEndDate =
        input.show_end_date !== undefined ? input.show_end_date : current.showEndDate;
    if (showEndDate) next.showEndDate = true;

    const result: CouponOffersSetting = { ...setting };
    delete result[id];
    if (!isDefaultDisplay(next)) result[id] = next;
    return result;
}

/** The setting without one coupon's entry (after the coupon is deleted). */
export function withoutCoupon(setting: CouponOffersSetting, couponId: string): CouponOffersSetting {
    const result: CouponOffersSetting = { ...setting };
    delete result[couponId.toLowerCase()];
    return result;
}

/** `version` is what the read saw; hand it to writeCouponOffers with the change built on it. */
export type CouponOffersRead =
    | { ok: true; setting: CouponOffersSetting; version: SettingVersion }
    | { ok: false };

/** A fresh, uncached read. Never throws; { ok: false } when the read failed. */
export async function readCouponOffersFresh(
    client: SupabaseServerClient
): Promise<CouponOffersRead> {
    const snapshot = await readSettingSnapshot(client, COUPON_OFFERS_SETTING_KEY, ROUTE);
    if (!snapshot.ok) return { ok: false };
    return {
        ok: true,
        setting: parseCouponOffersSetting(snapshot.value),
        version: snapshot.version,
    };
}

export type CouponOffersFailure = {
    ok: false;
    status: 400 | 409 | 503 | 500;
    code:
        | "OFFER_SETTINGS_READ_FAILED"
        | "OFFER_SETTINGS_FULL"
        | "OFFER_SETTINGS_INVALID"
        | "LABEL_REVEALS_CODE"
        | "LABEL_CHECK_FAILED"
        | "OFFER_SETTINGS_SAVE_FAILED"
        | "OFFER_SETTINGS_CONFLICT";
    error: string;
    couponIds?: string[];
};

export const OFFER_SETTINGS_READ_FAILED: CouponOffersFailure = {
    ok: false,
    status: 503,
    code: "OFFER_SETTINGS_READ_FAILED",
    error: "Could not read the offer settings, so nothing was saved. Try again.",
};

export function offerSettingsFullFailure(): CouponOffersFailure {
    return {
        ok: false,
        status: 400,
        code: "OFFER_SETTINGS_FULL",
        error: `At most ${COUPON_OFFERS_MAX_ENTRIES} coupons can have offer settings. Set old offers back to Hidden code or delete them first.`,
    };
}

export function failureResponse(failure: CouponOffersFailure) {
    return NextResponse.json(
        {
            error: failure.error,
            code: failure.code,
            ...(failure.couponIds ? { couponIds: failure.couponIds } : {}),
        },
        { status: failure.status }
    );
}

/**
 * Validates the whole next value and checks that no label spells out its coupon's code. Writes
 * nothing. `stored` is the value to upsert with writeCouponOffers.
 */
export async function checkCouponOffers(
    client: SupabaseServerClient,
    setting: CouponOffersSetting,
    couponId?: string
): Promise<{ ok: true; stored: Record<string, StoredOfferDisplaySettings> } | CouponOffersFailure> {
    const validated = validateCouponOffersSetting(serializeCouponOffersSetting(setting));
    if (!validated.ok) {
        return { ok: false, status: 400, code: "OFFER_SETTINGS_INVALID", error: validated.error };
    }

    const labels = await findLabelsRevealingCodes(validated.value, client);
    if (!labels.ok) {
        return {
            ok: false,
            status: 503,
            code: "LABEL_CHECK_FAILED",
            error: "Could not check the offer labels, so nothing was saved. Try again.",
        };
    }
    if (labels.couponIds.length > 0) {
        const ownLabel = couponId ? labels.couponIds.includes(couponId.toLowerCase()) : false;
        return {
            ok: false,
            status: 400,
            code: "LABEL_REVEALS_CODE",
            error: ownLabel
                ? "The label contains the coupon code, and labels are public. Remove the code from the label, or make the offer Listed."
                : "Another offer's label contains its coupon code. Fix that offer's label first.",
            couponIds: labels.couponIds,
        };
    }

    return { ok: true, stored: validated.value };
}

export type CouponOffersWrite = {
    /** The change to store: what checkCouponOffers validated, and the setting it came from. */
    setting: CouponOffersSetting;
    stored: Record<string, StoredOfferDisplaySettings>;
    /** The version of the read `setting` was built from (readCouponOffersFresh). */
    version: SettingVersion;
    /** Applies this request's change to a newer setting, when another save got in first. */
    rebuild: (current: CouponOffersSetting) => CouponOffersSetting;
    couponId?: string;
};

/**
 * Stores the checked value only if the setting is still the one it was built from, and refreshes
 * the public offers. When another save got in first it reads the newer setting, applies the same
 * change to it, checks the labels again and tries again, so two saves at once keep both entries.
 * Answers with the setting that was stored.
 */
export async function writeCouponOffers(
    client: SupabaseServerClient,
    plan: CouponOffersWrite
): Promise<{ ok: true; setting: CouponOffersSetting } | CouponOffersFailure> {
    let { setting, stored, version } = plan;

    for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt += 1) {
        const written = await writeSettingIfUnchanged(
            client,
            COUPON_OFFERS_SETTING_KEY,
            version,
            stored as unknown as Json,
            ROUTE
        );
        if (written.ok) {
            // Saved: a cache hiccup must not turn that into a failure.
            try {
                revalidateTag(OFFERS_TAG);
                revalidateTag(PLATFORM_SETTINGS_TAG);
            } catch (error) {
                Sentry.captureException(error, { tags: { layer: "api", route: ROUTE } });
            }
            return { ok: true, setting };
        }
        if (written.reason === "error") {
            return {
                ok: false,
                status: 500,
                code: "OFFER_SETTINGS_SAVE_FAILED",
                error: "Could not save the offer settings. Try again.",
            };
        }

        // Another save changed the setting first.
        if (attempt === MAX_WRITE_ATTEMPTS) break;
        const fresh = await readCouponOffersFresh(client);
        if (!fresh.ok) return OFFER_SETTINGS_READ_FAILED;
        setting = plan.rebuild(fresh.setting);
        const checked = await checkCouponOffers(client, setting, plan.couponId);
        if (!checked.ok) return checked;
        stored = checked.stored;
        version = fresh.version;
    }

    return {
        ok: false,
        status: 409,
        code: "OFFER_SETTINGS_CONFLICT",
        error: "Other offer changes were saving at the same moment, so the offer settings were not saved. Try again.",
    };
}

/** After a coupon row changed: public offers (and checkout's auto offers) read it within a minute. */
export function revalidateCouponOffers() {
    revalidateTag(OFFERS_TAG);
}
