import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { handleApiError, parseBody } from "@/lib/api-route";
import { requireSupabaseService } from "@/lib/api-helpers";
import { requireHostOrAdmin } from "@/lib/api-auth";
import { assertRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { workshopCreateSchema } from "@/lib/validators";
import { buildWorkshopInsertPayload, mapWorkshopRowToWorkshop } from "@/lib/workshop-utils";

export async function GET(request: NextRequest) {
    const auth = await requireHostOrAdmin(request);
    if (!auth.ok) {
        return auth.response;
    }

    const service = requireSupabaseService();
    if (!service.ok) return service.response;
    const serviceClient = service.client;

    try {
        const { data, error } = await serviceClient
            .from("workshops")
            .select("*")
            .eq("host_user_id", auth.user.id)
            .order("created_at", { ascending: false });

        if (error) {
            throw error;
        }

        return NextResponse.json({
            data: (data || []).map((row) => mapWorkshopRowToWorkshop(row)),
        });
    } catch (error) {
        return handleApiError("Failed to load host workshops.", error);
    }
}

export async function POST(request: NextRequest) {
    const auth = await requireHostOrAdmin(request);
    if (!auth.ok) {
        return auth.response;
    }

    const rateLimitResult = await assertRateLimit({
        key: getRateLimitKey(request, "host-workshops-write", auth.user.id),
        limit: 30,
        windowMs: 60_000,
        message: "Too many workshop creation attempts. Please wait and try again.",
    });
    if (!rateLimitResult.ok) {
        return rateLimitResult.response;
    }

    const service = requireSupabaseService();
    if (!service.ok) return service.response;
    const serviceClient = service.client;

    const parsed = await parseBody(
        request,
        workshopCreateSchema,
        "Invalid JSON payload.",
        "Workshop form validation failed."
    );
    if (!parsed.ok) {
        return parsed.response;
    }

    try {
        const payload = buildWorkshopInsertPayload(parsed.data, auth.user.id);

        const { data, error } = await serviceClient
            .from("workshops")
            .insert(payload)
            .select("*")
            .single();

        if (error) {
            throw error;
        }

        return NextResponse.json(
            {
                workshop: mapWorkshopRowToWorkshop(data),
            },
            { status: 201 }
        );
    } catch (error) {
        return handleApiError("Failed to create workshop.", error);
    }
}
