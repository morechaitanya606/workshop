import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { mockWorkshops } from "@/lib/data";
import {
    createSupabaseServiceClient,
    isSupabaseServiceConfigured,
} from "@/lib/supabase-server";
import {
    ensureWorkshopSeededFromMock,
    mapWorkshopRowToWorkshop,
} from "@/lib/workshop-utils";

export async function GET(
    _request: NextRequest,
    { params }: { params: { id: string } }
) {
    const workshopId = params.id;

    if (isSupabaseServiceConfigured) {
        try {
            const serviceClient = createSupabaseServiceClient();
            await ensureWorkshopSeededFromMock(serviceClient, workshopId);
            const { data, error } = await serviceClient
                .from("workshops")
                .select("*")
                .eq("id", workshopId)
                .maybeSingle();

            if (!error && data) {
                return NextResponse.json({
                    workshop: mapWorkshopRowToWorkshop(
                        data as Record<string, unknown>
                    ),
                    source: "supabase",
                });
            }
        } catch {
            // Falls back to mock.
        }
    }

    const fallback = mockWorkshops.find((item) => item.id === workshopId);
    if (!fallback) {
        return NextResponse.json(
            { error: "Workshop not found." },
            { status: 404 }
        );
    }

    return NextResponse.json({
        workshop: fallback,
        source: "mock",
    });
}
