import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-route";
import { requireSupabaseService } from "@/lib/api-helpers";
import { requireHostOrAdmin } from "@/lib/api-auth";
import { listWorkshopLibrary } from "@/lib/workshop-library";

/** The hosts and workshops this user created, for the "start from a workshop" list. */
export async function GET(request: NextRequest) {
    const auth = await requireHostOrAdmin(request);
    if (!auth.ok) {
        return auth.response;
    }

    const service = requireSupabaseService();
    if (!service.ok) return service.response;

    try {
        return NextResponse.json(
            await listWorkshopLibrary(service.client, { createdBy: auth.user.id })
        );
    } catch (error) {
        return handleApiError("Failed to load your host and workshop library.", error);
    }
}
