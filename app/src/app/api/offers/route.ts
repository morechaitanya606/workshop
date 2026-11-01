import { NextResponse, type NextRequest } from "next/server";

import type { PublicOffer } from "@/lib/offers";
import { loadPublicOffersResult, OFFERS_RENDER_DEADLINE_MS } from "@/lib/offers-server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { isBookingClosed, WORKSHOP_ID_MAX_LENGTH } from "@/lib/workshop-availability";
import { loadClosedWorkshopIds } from "@/lib/workshop-availability-server";

/**
 * GET /api/offers?workshopId=<id>
 *
 * Public, cacheable list of live coupon offers for client pages such as /booking. Safe fields
 * only (see PublicOffer). With workshopId, offers limited to OTHER workshops are dropped;
 * category limits are left to offersForWorkshop on the client, which also adds the workshop's
 * own Early Bird. A workshop whose bookings the admin closed gets no offers. Never fails the
 * page: any problem answers { offers: [] }.
 */

const OFFERS_CACHE_HEADERS = {
    "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
};
// A failed read is not cached by the CDN either: the next request reads again.
const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function isLive(offer: PublicOffer, nowMs: number) {
    const starts = offer.startsAt ? new Date(offer.startsAt).getTime() : null;
    if (starts !== null && !(starts <= nowMs)) return false;
    const ends = offer.availableUntil ? new Date(offer.availableUntil).getTime() : null;
    return ends === null || ends >= nowMs;
}

/** Picks the public fields one by one, so nothing else can ever ride along. */
function toSafeOffer(offer: PublicOffer): PublicOffer {
    return {
        id: offer.id,
        kind: offer.kind,
        label: offer.label,
        discountType: offer.discountType,
        discountValue: offer.discountValue,
        minGuests: offer.minGuests,
        minOrderAmount: offer.minOrderAmount,
        startsAt: offer.startsAt,
        availableUntil: offer.availableUntil,
        endsAt: offer.endsAt,
        code: offer.kind === "listed" ? offer.code : null,
        workshopIds: offer.workshopIds,
        categories: offer.categories,
    };
}

/**
 * Whether the admin closed this workshop's bookings, from the cached platform settings. Never
 * slower than the offers deadline: a slow or failed read counts as open (hold and order
 * creation refuse a closed workshop anyway).
 */
async function workshopClosed(workshopId: string): Promise<boolean> {
    if (!workshopId) return false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        const closed = await Promise.race([
            loadClosedWorkshopIds(),
            new Promise<Set<string>>((resolve) => {
                timer = setTimeout(() => resolve(new Set()), OFFERS_RENDER_DEADLINE_MS);
            }),
        ]);
        return isBookingClosed(workshopId, closed);
    } catch {
        return false;
    } finally {
        if (timer !== undefined) clearTimeout(timer);
    }
}

export async function GET(request: NextRequest) {
    try {
        const limited = await enforceRateLimit(request, "publicRead", "api-offers");
        if (!limited.ok) return limited.response;

        const workshopId = (request.nextUrl.searchParams.get("workshopId") ?? "").trim();
        if (workshopId.length > WORKSHOP_ID_MAX_LENGTH) {
            return NextResponse.json({ offers: [] }, { headers: OFFERS_CACHE_HEADERS });
        }

        const [{ offers, ok }, closed] = await Promise.all([
            loadPublicOffersResult(),
            workshopClosed(workshopId),
        ]);
        if (closed) {
            return NextResponse.json({ offers: [] }, { headers: OFFERS_CACHE_HEADERS });
        }

        const nowMs = Date.now();
        const visible = offers
            .filter((offer) => offer.kind !== "early_bird" && isLive(offer, nowMs))
            .filter(
                (offer) =>
                    !workshopId ||
                    !offer.workshopIds?.length ||
                    offer.workshopIds.includes(workshopId)
            )
            .map(toSafeOffer);

        return NextResponse.json(
            { offers: visible },
            { headers: ok ? OFFERS_CACHE_HEADERS : NO_STORE_HEADERS }
        );
    } catch {
        return NextResponse.json({ offers: [] }, { headers: NO_STORE_HEADERS });
    }
}
