import "server-only";

import * as Sentry from "@sentry/nextjs";
import { unstable_cache } from "next/cache";

import { NotCached, readThroughCache } from "@/lib/cache-success-only";
import { OFFERS_TAG, PLATFORM_SETTINGS_TAG } from "@/lib/cached-reads";
import {
    buildPublicOffers,
    COUPON_OFFERS_SETTING_KEY,
    effectiveOfferDisplay,
    offerLabelsRevealingCodes,
    offerLabelsToCheckForCodes,
    offerSettingsFor,
    parseCouponOffersSetting,
    pricingCouponFromRow,
    type CouponOffersSetting,
    type OfferDisplaySettings,
    type PublicOffer,
} from "@/lib/offers";
import type { PricingCoupon } from "@/lib/pricing";
import {
    createSupabaseServiceClient,
    isSupabaseServiceConfigured,
    type SupabaseServerClient,
} from "@/lib/supabase-server";

/**
 * Server-side reads for customer offers. Coupons are admin-only under RLS (codes are bearer
 * secrets), so everything here uses the service role. Two kinds of result:
 * - PUBLIC: loadPublicOffers / loadPublicOffersResult hand out only PublicOffer fields: never
 *   max_uses or used_count, and a code only for "listed" offers. Safe to send to a browser.
 * - CHECKOUT-INTERNAL: loadOfferCoupons, OfferCoupon and autoOfferCoupons carry full coupon
 *   rows (every code, hidden and community ones included, use limits and counts). Never
 *   serialize them, or any part of them, into a response: only computeQuote's numbers and the
 *   applied coupon's public label may leave the server.
 * findLabelsRevealingCodes is for the admin write path of "coupon_offers".
 *
 * The reads tolerate a database without the "coupon_offers" setting (previews share the live
 * database): no setting means no offers, exactly today's behaviour. That setting is publicly
 * readable through Supabase's anon select policy and has no code field; a code typed into a
 * label is refused by findLabelsRevealingCodes on save (see src/lib/offers.ts).
 */

export { OFFERS_TAG };

/** Short: an offer that runs out or ends disappears within a minute. */
export const OFFERS_REVALIDATE_SECONDS = 60;

/**
 * Offers are decorative: during database trouble a page renders without them (today's look)
 * instead of waiting. Each query gets OFFERS_REQUEST_TIMEOUT_MS and there is no retry; a
 * render never waits more than OFFERS_RENDER_DEADLINE_MS for the whole read (a read that
 * finishes later still fills the cache for the next request).
 */
export const OFFERS_REQUEST_TIMEOUT_MS = 2500;
export const OFFERS_RENDER_DEADLINE_MS = 3000;

export type PublicOffersResult = {
    offers: PublicOffer[];
    /** False when the read failed or was too slow (the empty list is then not cached anywhere). */
    ok: boolean;
};

/** A fresh object every time, so no caller can mutate a shared fallback. */
function failed(): PublicOffersResult {
    return { offers: [], ok: false };
}

type SettingRead = { ok: true; raw: unknown } | { ok: false; error: unknown };

async function readCouponOffersSetting(client: SupabaseServerClient): Promise<SettingRead> {
    const { data, error } = await client
        .from("platform_settings")
        .select("setting_value")
        .eq("setting_key", COUPON_OFFERS_SETTING_KEY)
        .maybeSingle();
    if (error) return { ok: false, error };
    return { ok: true, raw: data?.setting_value ?? null };
}

function reportFailure(error: unknown, route: string) {
    // The database message names tables and columns: report it, never return it.
    Sentry.captureException(error, { tags: { layer: "web", route } });
}

async function readPublicOffers(): Promise<PublicOffersResult> {
    if (!isSupabaseServiceConfigured) return { offers: [], ok: true };

    try {
        const client = createSupabaseServiceClient({ requestTimeoutMs: OFFERS_REQUEST_TIMEOUT_MS });
        const setting = await readCouponOffersSetting(client);
        if (!setting.ok) {
            reportFailure(setting.error, "public_offers");
            // Thrown, not returned: a failed read must not be cached as "no offers".
            throw new NotCached(failed());
        }

        const visibleIds = Object.entries(parseCouponOffersSetting(setting.raw))
            .filter(([, display]) => display.visibility !== "hidden")
            .map(([couponId]) => couponId);
        if (visibleIds.length === 0) return { offers: [], ok: true };

        const { data, error } = await client
            .from("coupons")
            .select("*")
            .eq("is_active", true)
            .in("id", visibleIds);
        if (error || !Array.isArray(data)) {
            reportFailure(error, "public_offers");
            throw new NotCached(failed());
        }

        return { offers: buildPublicOffers(data, setting.raw, Date.now()), ok: true };
    } catch (error) {
        if (error instanceof NotCached) throw error;
        reportFailure(error, "public_offers");
        throw new NotCached(failed());
    }
}

const cachedPublicOffers = unstable_cache(
    // Single attempt: a retry would double the wait on the render path, and the next request
    // reads again anyway (failures are never cached).
    readPublicOffers,
    ["public-offers"],
    // PLATFORM_SETTINGS_TAG too: saving "coupon_offers" through PATCH /api/settings already
    // revalidates it, so display changes show at once.
    { tags: [OFFERS_TAG, PLATFORM_SETTINGS_TAG], revalidate: OFFERS_REVALIDATE_SECONDS }
);

/**
 * Public offers plus whether the read succeeded. Never throws, and never waits longer than
 * OFFERS_RENDER_DEADLINE_MS: a slow read answers { offers: [], ok: false }.
 */
export async function loadPublicOffersResult(): Promise<PublicOffersResult> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        const read = readThroughCache(cachedPublicOffers).catch((error: unknown) => {
            reportFailure(error, "public_offers");
            return failed();
        });
        const deadline = new Promise<PublicOffersResult>((resolve) => {
            timer = setTimeout(() => resolve(failed()), OFFERS_RENDER_DEADLINE_MS);
        });
        const result = await Promise.race([read, deadline]);
        return result && Array.isArray(result.offers)
            ? { offers: result.offers, ok: result.ok === true }
            : failed();
    } catch (error) {
        reportFailure(error, "public_offers");
        return failed();
    } finally {
        if (timer !== undefined) clearTimeout(timer);
    }
}

/**
 * Every live coupon offer (all workshops; Early Bird is per workshop and is added by
 * offersForWorkshop). Cached for a minute; [] on any failure or slow read, never cached.
 */
export async function loadPublicOffers(): Promise<PublicOffer[]> {
    return (await loadPublicOffersResult()).offers;
}

/**
 * CHECKOUT-INTERNAL: `coupon` is the full row (code, maxUses, usedCount) of any visibility.
 * Never serialize it into a response.
 */
export type OfferCoupon = { coupon: PricingCoupon; display: OfferDisplaySettings };

/** CHECKOUT-INTERNAL, like OfferCoupon: never serialize it into a response. */
export type OfferCouponsResult = {
    /**
     * False when a read failed or ran out of time, so the offers are UNKNOWN. An empty `coupons`
     * with ok true is the real answer "no offers configured". Checkout refuses the order (503)
     * on ok false instead of pricing without offers the booking page may have shown, unless
     * `noAutoOffers` proves there are none to show.
     */
    ok: boolean;
    /**
     * Active coupons that have display settings (any visibility), seat minimum merged in.
     * `display` is the EFFECTIVE one (effectiveOfferDisplay): an auto or listed coupon at or
     * near its use cap reads as hidden here, exactly as the public offer list drops it.
     */
    coupons: OfferCoupon[];
    /** The parsed setting, for a typed code: pricingCouponFromRow(row, setting). */
    setting: CouponOffersSetting;
    /**
     * Set only on a not-ok result whose offers SETTING was read fine (the coupons query is what
     * failed) and has no automatic offer: then no offer can apply without a typed code, whatever
     * the coupons read says, so checkout may still price the booking (Early Bird comes from the
     * workshop row, and a typed code is read on its own). Absent means "unknown": a setting that
     * could not be read, or one that does list automatic offers.
     */
    noAutoOffers?: true;
};

/**
 * Fresh (uncached) coupon rows with their display settings, for checkout. Auto-applied
 * candidates are autoOfferCoupons(result); every candidate still goes through couponRejection /
 * pickBestCoupon with the hold's guest count. Pass a service client with a request timeout.
 * Never throws. CHECKOUT-INTERNAL: the result holds every code (hidden and community ones too)
 * and use counts; never return any part of it to the browser.
 */
export async function loadOfferCoupons(client: SupabaseServerClient): Promise<OfferCouponsResult> {
    let setting: CouponOffersSetting = {};
    try {
        const read = await readCouponOffersSetting(client);
        if (!read.ok) {
            reportFailure(read.error, "offer_coupons");
            return { ok: false, coupons: [], setting };
        }
        setting = parseCouponOffersSetting(read.raw);
        const ids = Object.keys(setting);
        if (ids.length === 0) return { ok: true, coupons: [], setting };

        const { data, error } = await client
            .from("coupons")
            .select("*")
            .eq("is_active", true)
            .in("id", ids);
        if (error || !Array.isArray(data)) {
            reportFailure(error, "offer_coupons");
            const failedRead: OfferCouponsResult = { ok: false, coupons: [], setting };
            // The setting was read: if it lists no automatic offer, none can apply (effective
            // visibility only ever demotes "auto"), so checkout need not refuse the order.
            if (!Object.values(setting).some((display) => display.visibility === "auto")) {
                failedRead.noAutoOffers = true;
            }
            return failedRead;
        }

        const coupons: OfferCoupon[] = [];
        for (const row of data) {
            const coupon = pricingCouponFromRow(row, setting);
            const display = coupon
                ? effectiveOfferDisplay(coupon, offerSettingsFor(setting, coupon.id))
                : undefined;
            if (coupon && display) coupons.push({ coupon, display });
        }
        return { ok: true, coupons, setting };
    } catch (error) {
        reportFailure(error, "offer_coupons");
        return { ok: false, coupons: [], setting };
    }
}

/**
 * The coupons checkout may apply without a typed code: effective visibility "auto". The same
 * set the cards and the workshop page price with, so the price shown is the price charged.
 * CHECKOUT-INTERNAL: full rows with codes; never serialize them.
 */
export function autoOfferCoupons(result: Pick<OfferCouponsResult, "coupons">): PricingCoupon[] {
    return result.coupons
        .filter(({ display }) => display.visibility === "auto")
        .map(({ coupon }) => coupon);
}

export type LabelCodeCheck =
    /** couponIds: lower-case ids whose label contains their own code. Empty = safe to save. */
    | { ok: true; couponIds: string[] }
    /** The codes could not be read: refuse the save (503), never store an unchecked label. */
    | { ok: false };

/**
 * For every route that saves "coupon_offers" (PATCH /api/settings, any admin offers route):
 * which labels would publish their coupon's code. The setting is readable with the anon key,
 * and its validator cannot see codes, so this is the one guard: call it with the validated value
 * before the upsert and answer 400 when couponIds is not empty, 503 when ok is false. It checks
 * every entry except "listed" ones (whose code is shown anyway), so a listed coupon switched to
 * another visibility is checked too. Reads only `id, code` of the labelled coupons, with the
 * service role (pass a service client). Never throws; fails closed ({ ok: false }).
 */
export async function findLabelsRevealingCodes(
    setting: unknown,
    client: SupabaseServerClient
): Promise<LabelCodeCheck> {
    try {
        const ids = [...new Set(offerLabelsToCheckForCodes(setting).map((l) => l.couponId))];
        if (ids.length === 0) return { ok: true, couponIds: [] };

        const { data, error } = await client.from("coupons").select("id, code").in("id", ids);
        if (error || !Array.isArray(data)) {
            reportFailure(error, "offer_label_codes");
            return { ok: false };
        }
        return { ok: true, couponIds: offerLabelsRevealingCodes(setting, data) };
    } catch (error) {
        reportFailure(error, "offer_label_codes");
        return { ok: false };
    }
}
