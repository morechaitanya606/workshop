import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { handleApiError, parseBody } from "@/lib/api-route";
import { jsonError, requireAuthenticatedUser } from "@/lib/api-auth";
import { bookingHoldSchema } from "@/lib/validators";
import { requireSupabaseService } from "@/lib/api-helpers";
import { assertRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { BOOKING_CUTOFF_HOURS, isBookingClosedNow } from "@/lib/booking-time";
import type { SupabaseServerClient } from "@/lib/supabase-server";
import {
    getWorkshopApprovalStatus,
    isMissingApprovalStatusColumnError,
} from "@/lib/workshop-approval-compat";

const HOLD_DURATION_MINUTES = 15;

type WorkshopTimingRow = {
    id: string;
    date: string;
    time: string;
    approval_status?: "pending" | "approved" | "rejected" | null;
};

type WorkshopSeatRow = {
    id: string;
    seats_remaining: number;
    approval_status?: "pending" | "approved" | "rejected" | null;
};

async function loadWorkshopTimingWithApprovalCompat(
    serviceClient: SupabaseServerClient,
    workshopId: string
) {
    const primary = await serviceClient
        .from("workshops")
        .select("id, date, time, approval_status")
        .eq("id", workshopId)
        .single();

    if (!primary.error || !isMissingApprovalStatusColumnError(primary.error)) {
        return primary as { data: WorkshopTimingRow | null; error: typeof primary.error };
    }

    const fallback = await serviceClient
        .from("workshops")
        .select("id, date, time")
        .eq("id", workshopId)
        .single();

    return {
        data: fallback.data
            ? {
                  ...fallback.data,
                  approval_status: "approved" as const,
              }
            : null,
        error: fallback.error,
    };
}

async function loadWorkshopSeatsWithApprovalCompat(
    serviceClient: SupabaseServerClient,
    workshopId: string
) {
    const primary = await serviceClient
        .from("workshops")
        .select("id, seats_remaining, approval_status")
        .eq("id", workshopId)
        .single();

    if (!primary.error || !isMissingApprovalStatusColumnError(primary.error)) {
        return primary as { data: WorkshopSeatRow | null; error: typeof primary.error };
    }

    const fallback = await serviceClient
        .from("workshops")
        .select("id, seats_remaining")
        .eq("id", workshopId)
        .single();

    return {
        data: fallback.data
            ? {
                  ...fallback.data,
                  approval_status: "approved" as const,
              }
            : null,
        error: fallback.error,
    };
}

export async function POST(request: NextRequest) {
    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    const rateLimitResult = await assertRateLimit({
        key: getRateLimitKey(request, "bookings-hold", auth.user.id),
        limit: 20,
        windowMs: 60_000,
        message: "Too many hold attempts. Please wait and try again.",
    });
    if (!rateLimitResult.ok) {
        return rateLimitResult.response;
    }

    const service = requireSupabaseService();
    if (!service.ok) return service.response;
    const serviceClient = service.client;

    const parsed = await parseBody(
        request,
        bookingHoldSchema,
        "Invalid JSON payload.",
        "Invalid hold request."
    );
    if (!parsed.ok) {
        return parsed.response;
    }

    const { workshopId, guests } = parsed.data;

    try {
        const { data: workshopTiming, error: timingError } =
            await loadWorkshopTimingWithApprovalCompat(serviceClient, workshopId);

        if (timingError || !workshopTiming) {
            return jsonError("Workshop not found.", 404);
        }
        if (getWorkshopApprovalStatus(workshopTiming.approval_status) !== "approved") {
            return jsonError("This workshop is not open for bookings yet.", 409, {
                code: "WORKSHOP_PENDING_APPROVAL",
            });
        }

        if (isBookingClosedNow(workshopTiming.date, workshopTiming.time)) {
            return jsonError("Bookings close 3 hours before the workshop starts.", 409, {
                code: "BOOKING_CLOSED",
                cutoffHours: BOOKING_CUTOFF_HOURS,
            });
        }

        // Release any existing active holds by the SAME user for THIS workshop
        // To prevent the user from locking themselves out if they press back and retry.
        await serviceClient
            .from("booking_holds")
            .update({ status: "released" })
            .eq("status", "active")
            .eq("user_id", auth.user.id)
            .eq("workshop_id", workshopId);

        let holdId: string | null = null;

        const { data: rpcHoldId, error: rpcError } = await serviceClient.rpc(
            "create_booking_hold",
            {
                p_user_id: auth.user.id,
                p_workshop_id: workshopId,
                p_guests: guests,
                p_hold_minutes: HOLD_DURATION_MINUTES,
            }
        );

        if (!rpcError && typeof rpcHoldId === "string") {
            holdId = rpcHoldId;
        }

        if (!holdId) {
            // Fallback if RPC was not installed yet.
            await serviceClient
                .from("booking_holds")
                .update({ status: "expired" })
                .eq("status", "active")
                .lt("expires_at", new Date().toISOString());

            const { data: workshop, error: workshopError } =
                await loadWorkshopSeatsWithApprovalCompat(serviceClient, workshopId);

            if (workshopError || !workshop) {
                return jsonError("Workshop not found.", 404);
            }
            if (getWorkshopApprovalStatus(workshop.approval_status) !== "approved") {
                return jsonError("This workshop is not open for bookings yet.", 409, {
                    code: "WORKSHOP_PENDING_APPROVAL",
                });
            }

            const { data: activeHolds } = await serviceClient
                .from("booking_holds")
                .select("guests")
                .eq("workshop_id", workshopId)
                .eq("status", "active")
                .gt("expires_at", new Date().toISOString());

            const heldSeats = (activeHolds || []).reduce(
                (sum, item) => sum + Number(item.guests || 0),
                0
            );
            const available = Number(workshop.seats_remaining) - heldSeats;
            if (available <= 0) {
                return jsonError("This workshop is sold out. All spots are taken.", 409, {
                    code: "WORKSHOP_SOLD_OUT",
                    availableSeats: 0,
                    requestedSeats: guests,
                });
            }
            if (available < guests) {
                return jsonError(
                    `Only ${available} seat${available === 1 ? "" : "s"} left for this workshop.`,
                    409,
                    {
                        code: "INSUFFICIENT_SEATS",
                        availableSeats: available,
                        requestedSeats: guests,
                    }
                );
            }

            const expiresAt = new Date(
                Date.now() + HOLD_DURATION_MINUTES * 60 * 1000
            ).toISOString();
            const { data: insertedHold, error: insertError } = await serviceClient
                .from("booking_holds")
                .insert({
                    user_id: auth.user.id,
                    workshop_id: workshopId,
                    guests,
                    status: "active",
                    expires_at: expiresAt,
                })
                .select("id")
                .single();

            if (insertError || !insertedHold?.id) {
                return jsonError(
                    "Failed to create seat hold. Apply the SQL migration for transactional holds.",
                    500,
                    insertError?.message || rpcError?.message || null
                );
            }

            holdId = insertedHold.id;
        }

        const { data: holdRecord, error: holdError } = await serviceClient
            .from("booking_holds")
            .select(
                `
                id,
                guests,
                expires_at,
                workshop:workshops (
                    id,
                    title,
                    price,
                    date,
                    time,
                    location,
                    city,
                    cover_image
                )
            `
            )
            .eq("id", holdId)
            .eq("user_id", auth.user.id)
            .single();

        if (holdError || !holdRecord) {
            return jsonError("Seat hold created but could not be loaded.", 500);
        }

        return NextResponse.json({
            hold: holdRecord,
            holdDurationMinutes: HOLD_DURATION_MINUTES,
        });
    } catch (error) {
        return handleApiError("Failed to create seat hold.", error);
    }
}
