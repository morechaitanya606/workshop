import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { handleApiError, parseBody } from "@/lib/api-route";
import { requireSupabaseService } from "@/lib/api-helpers";
import { jsonError, requireAdminUser } from "@/lib/api-auth";
import { assertRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { workshopCreateSchema } from "@/lib/validators";
import { buildWorkshopInsertPayload, mapWorkshopRowToWorkshop } from "@/lib/workshop-utils";
import { isMissingColumnError, withoutNewColumns } from "@/lib/workshop-approval-compat";

export async function GET(request: NextRequest) {
    const auth = await requireAdminUser(request);
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
            .order("created_at", { ascending: false })
            .limit(100);

        if (error) {
            throw error;
        }

        return NextResponse.json({
            data: (data || []).map((row) => mapWorkshopRowToWorkshop(row)),
        });
    } catch (error) {
        return handleApiError("Failed to load admin workshops.", error);
    }
}

export async function POST(request: NextRequest) {
    const auth = await requireAdminUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    const rateLimitResult = await assertRateLimit({
        key: getRateLimitKey(request, "admin-workshops-write", auth.user.id),
        limit: 30,
        windowMs: 60_000,
        message: "Too many workshop management actions. Please wait and try again.",
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
        let { data, error } = await serviceClient
            .from("workshops")
            .insert(payload)
            .select("*")
            .single();

        if (error && isMissingColumnError(error)) {
            ({ data, error } = await serviceClient
                .from("workshops")
                .insert(withoutNewColumns(payload))
                .select("*")
                .single());
        }

        if (error) {
            return jsonError(
                "Unable to create workshop. Confirm the Supabase migration was applied.",
                500,
                error.message
            );
        }
        if (!data) {
            return jsonError("Unable to create workshop. No workshop was returned.", 500);
        }

        revalidatePath("/admin/workshops");
        revalidatePath(`/workshop/${data.id}`);
        revalidatePath("/workshops");

        return NextResponse.json(
            {
                workshop: mapWorkshopRowToWorkshop(data),
            },
            { status: 201 }
        );
    } catch (error) {
        return handleApiError("Failed to publish workshop.", error);
    }
}
