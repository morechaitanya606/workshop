import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-route";
import { requireSupabaseService } from "@/lib/api-helpers";
import { requireAdminUser } from "@/lib/api-auth";
import { listWorkshopLibrary } from "@/lib/workshop-library";

/** Every host and reusable workshop, for the admin "pick a host / start from a workshop" lists. */
export async function GET(request: NextRequest) {
    const auth = await requireAdminUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    const service = requireSupabaseService();
    if (!service.ok) return service.response;

    try {
        return NextResponse.json(await listWorkshopLibrary(service.client));
    } catch (error) {
        return handleApiError("Failed to load the host and workshop library.", error);
    }
}
