import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { mockWorkshops } from "@/lib/data";
import { requireSupabaseService } from "@/lib/api-helpers";
import { handleApiError } from "@/lib/api-route";
import { ensureWorkshopSeededFromMock, mapWorkshopRowToWorkshop } from "@/lib/workshop-utils";
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

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
    const workshopId = params.id;
    const allowMockFallback = process.env.NODE_ENV !== "production";

    const service = requireSupabaseService();
    if (!service.ok) {
        if (!allowMockFallback) {
            return service.response;
        }
    } else {
        try {
            const serviceClient = service.client;
            await ensureWorkshopSeededFromMock(serviceClient, workshopId);
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
            if (!allowMockFallback) {
                return handleApiError("Failed to load workshop.", error);
            }
            // Falls back to mock in non-production.
        }
    }

    if (!allowMockFallback) {
        return NextResponse.json({ error: "Workshop not found." }, { status: 404 });
    }

    const fallback = mockWorkshops.find((item) => item.id === workshopId);
    if (!fallback) {
        return NextResponse.json({ error: "Workshop not found." }, { status: 404 });
    }

    return NextResponse.json(
        {
            workshop: fallback,
            source: "mock",
        },
        {
            headers: WORKSHOP_DETAIL_CACHE_HEADERS,
        }
    );
}
