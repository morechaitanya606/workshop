import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
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

/**
 * True only when the RPC itself is not installed -- never when it ran and raised.
 *
 * Treating every RPC error as "not installed" sent business rejections AND transient
 * failures down the read-then-insert fallback below. That fallback has no lock between
 * the seat check and the insert, so under the very lock contention that produces those
 * transient errors, concurrent requests all read the same `seats_remaining` and all
 * succeed: a guaranteed oversell at exactly peak load.
 */
function isMissingHoldRpc(error: { code?: string; message?: string } | null) {
    if (!error) return false;
    if (error.code === "PGRST202") return true;

    const message = (error.message || "").toLowerCase();
    return (
        message.includes("could not find the function") ||
        (message.includes("create_booking_hold") && message.includes("schema cache"))
    );
}

/** Maps an RPC exception onto the same response shape the fallback path produced. */
function holdRpcErrorResponse(error: { message?: string }) {
    const message = error.message || "";

    if (message.includes("INSUFFICIENT_SEATS")) {
        // create_booking_hold raises 'INSUFFICIENT_SEATS:<remaining>'. Older deployments of
        // the function raise the bare code, so the count is optional.
        const remaining = /INSUFFICIENT_SEATS:([0-9]+)/.exec(message)?.[1];
        const availableSeats = remaining === undefined ? undefined : Number(remaining);

        const message409 =
            availableSeats === undefined
                ? "Not enough seats left for this workshop."
                : availableSeats === 0
                  ? "This workshop is sold out. All spots are taken."
                  : `Only ${availableSeats} seat${availableSeats === 1 ? "" : "s"} left for this workshop.`;

        return jsonError(message409, 409, {
            code: availableSeats === 0 ? "WORKSHOP_SOLD_OUT" : "INSUFFICIENT_SEATS",
            ...(availableSeats === undefined ? {} : { availableSeats }),
        });
    }
    if (message.includes("WORKSHOP_NOT_APPROVED")) {
        return jsonError("This workshop is not open for bookings yet.", 409, {
            code: "WORKSHOP_PENDING_APPROVAL",
        });
    }
    if (message.includes("WORKSHOP_NOT_FOUND")) {
        return jsonError("Workshop not found.", 404);
    }
    if (message.includes("INVALID_GUEST_COUNT")) {
        return jsonError("Invalid guest count.", 400);
    }

    // Transient: lock timeout, deadlock, statement timeout. Ask the client to retry
    // rather than reserving the seat through an unsynchronised path.
    return jsonError("Could not reserve seats right now. Please try again.", 503, {
        code: "HOLD_UNAVAILABLE",
    });
}

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

        // Releasing the caller's own superseded hold is now part of create_booking_hold, in
        // the same transaction as the seat check (20260912180000_payment_and_hold_uniqueness).
        // That migration must be applied BEFORE this code is deployed, or nothing releases.
        //
        // It used to happen here, unconditionally, before the seat check ran -- and it
        // committed on its own. So a user who already held 2 seats and asked for 8 on a
        // nearly-full workshop had their valid 2-seat hold destroyed and then got a 409:
        // they lost the seats they had by asking for more. Inside the RPC the release rolls
        // back with the exception, so a rejected request leaves the caller exactly as it
        // found them.
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

        // The RPC ran and rejected: honour that answer. Only a genuinely absent function
        // may fall through to the non-atomic path below.
        if (rpcError && !isMissingHoldRpc(rpcError)) {
            return holdRpcErrorResponse(rpcError);
        }

        if (!holdId) {
            // Fallback for a database that has not had the hold migration applied yet.
            // This path is NOT atomic and can oversell; it exists only so a fresh
            // environment is usable before migrations run.
            //
            // Which makes it unusable in production. An unmigrated production database is
            // not a reason to start selling seats through an unsynchronised read-then-insert
            // -- it is a deploy that must be stopped. Refuse rather than oversell, and make
            // the missing migration the visible failure.
            if (process.env.NODE_ENV === "production") {
                Sentry.captureMessage(
                    "create_booking_hold RPC is missing in production; refusing the non-atomic fallback.",
                    {
                        level: "fatal",
                        tags: { layer: "api", subsystem: "booking_hold" },
                        extra: { workshopId, rpcError: rpcError?.message || null },
                    }
                );

                return jsonError("Bookings are temporarily unavailable. Please try again.", 503, {
                    code: "HOLD_UNAVAILABLE",
                });
            }

            Sentry.captureMessage(
                "create_booking_hold RPC is missing; using non-atomic seat-hold fallback.",
                {
                    level: "warning",
                    tags: { layer: "api", subsystem: "booking_hold" },
                    extra: { workshopId },
                }
            );

            // The RPC does both of these internally. On this path nothing has, so the
            // fallback has to release the caller own prior hold itself or they lock
            // themselves out of re-reserving.
            await serviceClient
                .from("booking_holds")
                .update({ status: "released" })
                .eq("status", "active")
                .eq("user_id", auth.user.id)
                .eq("workshop_id", workshopId);

            // Scoped to this workshop. A table-wide sweep is an unindexed full-table write on
            // every request -- the exact pattern migration 20260906130000 removed from the RPC.
            await serviceClient
                .from("booking_holds")
                .update({ status: "expired" })
                .eq("status", "active")
                .eq("workshop_id", workshopId)
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
