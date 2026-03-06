import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { bookingHoldSchema } from "@/lib/validators";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase-server";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { ensureWorkshopSeededFromMock } from "@/lib/workshop-utils";

const HOLD_DURATION_MINUTES = 15;

export async function POST(request: NextRequest) {
    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    if (!isSupabaseServiceConfigured) {
        return NextResponse.json(
            {
                error:
                    "Supabase service role is not configured. Add SUPABASE_SERVICE_ROLE_KEY.",
            },
            { status: 500 }
        );
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
    }

    const parsed = bookingHoldSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: "Invalid hold request.", details: parsed.error.flatten() },
            { status: 400 }
        );
    }

    const { workshopId, guests } = parsed.data;

    try {
        const serviceClient = createSupabaseServiceClient();
        const seeded = await ensureWorkshopSeededFromMock(serviceClient, workshopId);
        if (!seeded) {
            return NextResponse.json(
                {
                    error:
                        "Workshop not found in database and no mock seed exists for this id.",
                },
                { status: 404 }
            );
        }

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

            const { data: workshop, error: workshopError } = await serviceClient
                .from("workshops")
                .select("id, seats_remaining")
                .eq("id", workshopId)
                .single();

            if (workshopError || !workshop) {
                return NextResponse.json(
                    { error: "Workshop not found." },
                    { status: 404 }
                );
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
            if (available < guests) {
                return NextResponse.json(
                    { error: "Not enough seats available." },
                    { status: 409 }
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
                return NextResponse.json(
                    {
                        error:
                            "Failed to create seat hold. Apply the SQL migration for transactional holds.",
                        details: insertError?.message || rpcError?.message || null,
                    },
                    { status: 500 }
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
            return NextResponse.json(
                { error: "Seat hold created but could not be loaded." },
                { status: 500 }
            );
        }

        return NextResponse.json({
            hold: holdRecord,
            holdDurationMinutes: HOLD_DURATION_MINUTES,
        });
    } catch (error) {
        return NextResponse.json(
            {
                error: "Failed to create seat hold.",
                details: String(error),
            },
            { status: 500 }
        );
    }
}
