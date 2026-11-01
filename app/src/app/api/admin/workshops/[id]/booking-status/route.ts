import * as Sentry from "@sentry/nextjs";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { jsonError, requireAdminUser } from "@/lib/api-auth";
import { requireSupabaseService } from "@/lib/api-helpers";
import { handleApiError, parseBody } from "@/lib/api-route";
import {
    OFFERS_TAG,
    PLATFORM_SETTINGS_TAG,
    WORKSHOPS_LIST_TAG,
    workshopTag,
} from "@/lib/cached-reads";
import { assertRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import type { SupabaseServerClient } from "@/lib/supabase-server";
import { normalizeWorkshopId } from "@/lib/workshop-availability";
import { readClosedWorkshopIds } from "@/lib/workshop-availability-server";
import { setWorkshopBookingsClosed } from "./closed-workshops-store";

/**
 * The admin "Bookings" switch of one workshop (src/lib/workshop-availability.ts).
 *
 * GET  -> 200 { workshopId, closed, closedWorkshopIds } (a fresh read)
 * POST -> body { closed: boolean } -> 200 { workshopId, closed, closedWorkshopIds }
 *
 * The write changes one id in the "closed_workshop_ids" platform setting
 * (closed-workshops-store.ts): the stored list is read FRESH (never the cached settings), the id
 * is added or removed, and the list is stored only if nobody else changed it in the meantime
 * (otherwise it re-reads and redoes the change, so two switches saved together both stick). When
 * the read fails the answer is 503 { code: "READ_FAILED" } and nothing is written, so a database
 * hiccup can never store a short list that reopens other workshops. Closing never touches
 * existing bookings, and an order created before the switch is still confirmed by checkout.
 */

type Params = {
    params: Promise<{ id: string }>;
};

const bodySchema = z.object({ closed: z.boolean() });

function codeError(error: string, code: string, status: number) {
    return NextResponse.json({ error, code }, { status });
}

function revalidateWorkshopSurfaces(workshopId: string) {
    // The list rides on the cached platform settings; the tags cover cached data reads and the
    // paths every page that shows the workshop (it stays visible, with "Bookings closed").
    // The switch is already saved by now: a cache hiccup must not turn that into an error (the
    // admin would see "nothing was changed" while it was), so it is only reported. The caches
    // also refresh on their own schedule, and hold and checkout read the list uncached.
    try {
        revalidateTag(PLATFORM_SETTINGS_TAG);
        revalidateTag(WORKSHOPS_LIST_TAG);
        revalidateTag(OFFERS_TAG);
        revalidateTag(workshopTag(workshopId));
        revalidatePath(`/workshop/${workshopId}`);
        revalidatePath("/");
        revalidatePath("/explore");
        revalidatePath("/workshops/[city]", "page");
        revalidatePath("/workshops/[city]/[topic]", "page");
        // llms.txt states "Bookings closed" too, and is cached for an hour.
        revalidatePath("/llms.txt");
        revalidatePath("/admin/workshops");
    } catch (error) {
        Sentry.captureException(error, { tags: { layer: "api", route: "booking_status" } });
    }
}

async function findWorkshop(client: SupabaseServerClient, workshopId: string) {
    const { data, error } = await client
        .from("workshops")
        .select("id")
        .eq("id", workshopId)
        .maybeSingle();
    if (error) throw error;
    return data;
}

export async function GET(request: NextRequest, { params }: Params) {
    const { id: rawId } = await params;
    const auth = await requireAdminUser(request);
    if (!auth.ok) return auth.response;

    const workshopId = normalizeWorkshopId(rawId);
    if (!workshopId) return codeError("Unknown workshop.", "UNKNOWN_WORKSHOP", 400);

    const service = requireSupabaseService();
    if (!service.ok) return service.response;

    try {
        if (!(await findWorkshop(service.client, workshopId))) {
            return jsonError("Workshop not found.", 404);
        }

        const read = await readClosedWorkshopIds(service.client);
        if (!read.ok) {
            return codeError(
                "Could not read the bookings status right now. Try again.",
                "READ_FAILED",
                503
            );
        }

        return NextResponse.json(
            {
                workshopId,
                closed: read.ids.has(workshopId),
                closedWorkshopIds: [...read.ids],
            },
            { headers: { "Cache-Control": "no-store" } }
        );
    } catch (error) {
        return handleApiError("Failed to load the bookings status.", error);
    }
}

export async function POST(request: NextRequest, { params }: Params) {
    const { id: rawId } = await params;
    const auth = await requireAdminUser(request);
    if (!auth.ok) return auth.response;

    const rateLimitResult = await assertRateLimit({
        key: getRateLimitKey(request, "admin-workshop-booking-status", auth.user.id),
        limit: 40,
        windowMs: 60_000,
        message: "Too many booking switch changes. Please wait and try again.",
    });
    if (!rateLimitResult.ok) return rateLimitResult.response;

    const workshopId = normalizeWorkshopId(rawId);
    if (!workshopId) return codeError("Unknown workshop.", "UNKNOWN_WORKSHOP", 400);

    const parsed = await parseBody(
        request,
        bodySchema,
        "Invalid JSON payload.",
        "Send { closed: true } or { closed: false }."
    );
    if (!parsed.ok) return parsed.response;
    const { closed } = parsed.data;

    const service = requireSupabaseService();
    if (!service.ok) return service.response;

    try {
        if (!(await findWorkshop(service.client, workshopId))) {
            return jsonError("Workshop not found.", 404);
        }

        const result = await setWorkshopBookingsClosed(service.client, workshopId, closed);
        if (!result.ok) {
            // Nothing was written (the store never reports a failure after a write).
            return result.status === 500
                ? jsonError(result.error, 500)
                : codeError(result.error, result.code, result.status);
        }

        // Also when the list already said so: pages cached before an earlier, half-finished
        // save still get refreshed.
        revalidateWorkshopSurfaces(workshopId);

        return NextResponse.json({
            workshopId,
            closed,
            closedWorkshopIds: result.closedWorkshopIds,
        });
    } catch (error) {
        return handleApiError("Failed to change the bookings switch.", error);
    }
}

/** Same as POST (the contract allows either verb). */
export const PATCH = POST;
