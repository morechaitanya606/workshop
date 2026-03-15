import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-route";
import { requireSupabaseService } from "@/lib/api-helpers";
import { requireHostUser } from "@/lib/api-auth";

type Params = {
    params: { id: string };
};

export async function GET(request: NextRequest, { params }: Params) {
    const auth = await requireHostUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    const service = requireSupabaseService();
    if (!service.ok) return service.response;
    const serviceClient = service.client;

    try {
        const { data: workshop, error: fetchError } = await serviceClient
            .from("workshops")
            .select("id, host_user_id")
            .eq("id", params.id)
            .maybeSingle();

        if (fetchError || !workshop) {
            return NextResponse.json({ error: "Workshop not found", success: false }, { status: 404 });
        }

        if (workshop.host_user_id !== auth.user.id) {
            return NextResponse.json({ error: "Unauthorized access", success: false }, { status: 403 });
        }

        const { data: bookings, error: bookingsError } = await serviceClient
            .from("bookings")
            .select("id, first_name, last_name, email, phone, guests, status, attended, created_at")
            .eq("workshop_id", params.id)
            .eq("status", "confirmed")
            .order("created_at", { ascending: true });

        if (bookingsError) throw bookingsError;

        return NextResponse.json({ success: true, attendees: bookings || [] });
    } catch (error) {
        return handleApiError("Failed to fetch attendees.", error);
    }
}
