import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-route";
import { requireSupabaseService } from "@/lib/api-helpers";
import { requireHostOrAdmin } from "@/lib/api-auth";
import { z } from "zod";

const checkInSchema = z.object({
    attended: z.boolean(),
});

type Params = {
    params: { id: string };
};

export async function PATCH(request: NextRequest, { params }: Params) {
    const auth = await requireHostOrAdmin(request);
    if (!auth.ok) {
        return auth.response;
    }

    const service = requireSupabaseService();
    if (!service.ok) return service.response;
    const serviceClient = service.client;

    try {
        const body = await request.json();
        const parsed = checkInSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: "Invalid boolean for attended status", success: false },
                { status: 400 }
            );
        }

        const { attended } = parsed.data;

        // Verify the booking exists and belongs to a workshop hosted by this user
        const { data: booking, error: fetchError } = await serviceClient
            .from("bookings")
            .select("id, workshop_id, workshops!inner(host_user_id)")
            .eq("id", params.id)
            .maybeSingle();

        if (fetchError || !booking) {
            return NextResponse.json(
                { error: "Booking not found", success: false },
                { status: 404 }
            );
        }

        const hostUserId = Array.isArray(booking.workshops)
            ? booking.workshops[0]?.host_user_id
            : (booking.workshops as any)?.host_user_id;

        if (auth.role !== "admin" && hostUserId !== auth.user.id) {
            return NextResponse.json(
                { error: "Unauthorized access", success: false },
                { status: 403 }
            );
        }

        const { error: updateError } = await serviceClient
            .from("bookings")
            .update({ attended } as any)
            .eq("id", params.id);

        if (updateError) throw updateError;

        return NextResponse.json({ success: true, attended });
    } catch (error) {
        return handleApiError("Failed to update check-in status.", error);
    }
}
