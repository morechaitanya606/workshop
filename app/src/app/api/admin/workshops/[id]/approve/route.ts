import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { handleApiError } from "@/lib/api-route";
import { requireSupabaseService } from "@/lib/api-helpers";
import { jsonError, requireAdminUser } from "@/lib/api-auth";
import { assertRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { mapWorkshopRowToWorkshop } from "@/lib/workshop-utils";
import { isMissingApprovalStatusColumnError } from "@/lib/workshop-approval-compat";

type Params = {
    params: { id: string };
};

export async function POST(request: NextRequest, { params }: Params) {
    const auth = await requireAdminUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    const rateLimitResult = await assertRateLimit({
        key: getRateLimitKey(request, "admin-workshop-approve", auth.user.id),
        limit: 40,
        windowMs: 60_000,
        message: "Too many workshop approval requests. Please wait and try again.",
    });
    if (!rateLimitResult.ok) {
        return rateLimitResult.response;
    }

    const service = requireSupabaseService();
    if (!service.ok) return service.response;
    const serviceClient = service.client;

    try {
        const { data, error } = await serviceClient
            .from("workshops")
            .update({ approval_status: "approved" })
            .eq("id", params.id)
            .select("*")
            .maybeSingle();

        if (error) {
            if (isMissingApprovalStatusColumnError(error)) {
                const fallback = await serviceClient
                    .from("workshops")
                    .select("*")
                    .eq("id", params.id)
                    .maybeSingle();

                if (fallback.error) {
                    throw fallback.error;
                }
                if (!fallback.data) {
                    return jsonError("Workshop not found.", 404);
                }

                revalidatePath(`/admin/workshops`);
                revalidatePath(`/admin/workshops/${params.id}`);
                revalidatePath(`/workshops`);
                revalidatePath(`/workshops/${params.id}`);

                return NextResponse.json({
                    workshop: mapWorkshopRowToWorkshop(fallback.data),
                    message:
                        "Approval status will start working after the latest database migration is applied. For now this workshop stays available for testing.",
                });
            }
            throw error;
        }
        if (!data) {
            return jsonError("Workshop not found.", 404);
        }

        revalidatePath(`/admin/workshops`);
        revalidatePath(`/admin/workshops/${params.id}`);
        revalidatePath(`/workshop/${params.id}`);
        revalidatePath(`/workshops`);
        revalidatePath(`/workshops/${params.id}`);

        return NextResponse.json({
            workshop: mapWorkshopRowToWorkshop(data),
        });
    } catch (error) {
        return handleApiError("Failed to approve workshop.", error);
    }
}
