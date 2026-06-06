import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireSupabaseService } from "@/lib/api-helpers";
import { handleApiError } from "@/lib/api-route";
import { mapWorkshopRowToWorkshop } from "@/lib/workshop-utils";
import type { SupabaseServerClient } from "@/lib/supabase-server";
import { isMissingApprovalStatusColumnError } from "@/lib/workshop-approval-compat";

const WORKSHOP_DETAIL_CACHE_HEADERS = {
    "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
};

async function loadWorkshopRow(
    serviceClient: SupabaseServerClient,
    workshopId: string,
    includeApprovalFilter = true
) {
    let query = serviceClient.from("workshops").select("*").eq("id", workshopId);

    if (includeApprovalFilter) {
        query = query.eq("approval_status", "approved");
    }

    return await query.maybeSingle();
}
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: workshopId } = await params;

    const service = requireSupabaseService();
    if (!service.ok) {
        return service.response;
    }

    try {
        const serviceClient = service.client;
        let { data, error } = await loadWorkshopRow(serviceClient, workshopId);

        if (error && isMissingApprovalStatusColumnError(error)) {
            ({ data, error } = await loadWorkshopRow(serviceClient, workshopId, false));
        }

        if (!error && data) {
            return NextResponse.json(
                {
                    workshop: mapWorkshopRowToWorkshop(data),
                    source: "supabase",
                },
                {
                    headers: WORKSHOP_DETAIL_CACHE_HEADERS,
                }
            );
        }
    } catch (error) {
        return handleApiError("Failed to load workshop.", error);
    }

    return NextResponse.json({ error: "Workshop not found." }, { status: 404 });
}
