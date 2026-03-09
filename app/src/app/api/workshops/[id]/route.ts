import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { mockWorkshops } from "@/lib/data";
import { requireSupabaseService } from "@/lib/api-helpers";
import { handleApiError } from "@/lib/api-route";
import { ensureWorkshopSeededFromMock, mapWorkshopRowToWorkshop } from "@/lib/workshop-utils";

const WORKSHOP_DETAIL_CACHE_HEADERS = {
    "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
};

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
            const { data, error } = await serviceClient
                .from("workshops")
                .select("*")
                .eq("id", workshopId)
                .maybeSingle();

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
