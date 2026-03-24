import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-route";
import { requireSupabaseService } from "@/lib/api-helpers";
import { requireAdminUser } from "@/lib/api-auth";
import {
    getConfirmedWorkshopAttendees,
    getWorkshopOwnerLookup,
    isMockWorkshopId,
} from "@/lib/workshop-attendees";

type Params = {
    params: { id: string };
};

export async function GET(request: NextRequest, { params }: Params) {
    if (isMockWorkshopId(params.id)) {
        return NextResponse.json({ success: true, attendees: [] });
    }

    const auth = await requireAdminUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    const service = requireSupabaseService();
    if (!service.ok) return service.response;
    const serviceClient = service.client;

    try {
        const workshop = await getWorkshopOwnerLookup(serviceClient, params.id);

        if (!workshop.exists) {
            return NextResponse.json(
                { error: "Workshop not found", success: false },
                { status: 404 }
            );
        }

        const attendees = await getConfirmedWorkshopAttendees(serviceClient, params.id);
        return NextResponse.json({ success: true, attendees });
    } catch (error) {
        return handleApiError("Failed to fetch attendees.", error);
    }
}
