import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-route";
import { requireSupabaseService } from "@/lib/api-helpers";
import { requireHostOrAdmin } from "@/lib/api-auth";
import {
    getConfirmedWorkshopAttendees,
    getWorkshopOwnerLookup,
} from "@/lib/workshop-attendees";

type Params = {
    params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, { params }: Params) {
    const { id } = await params;
    const auth = await requireHostOrAdmin(request);
    if (!auth.ok) {
        return auth.response;
    }

    const service = requireSupabaseService();
    if (!service.ok) return service.response;
    const serviceClient = service.client;

    try {
        const workshop = await getWorkshopOwnerLookup(serviceClient, id);

        if (!workshop.exists) {
            return NextResponse.json(
                { error: "Workshop not found", success: false },
                { status: 404 }
            );
        }

        if (auth.role !== "admin" && workshop.ownerUserId !== auth.user.id) {
            return NextResponse.json(
                { error: "Unauthorized access", success: false },
                { status: 403 }
            );
        }

        const attendees = await getConfirmedWorkshopAttendees(serviceClient, id);
        return NextResponse.json({ success: true, attendees });
    } catch (error) {
        return handleApiError("Failed to fetch attendees.", error);
    }
}
