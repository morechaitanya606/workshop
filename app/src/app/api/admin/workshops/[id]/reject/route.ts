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
    params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, { params }: Params) {
    const { id } = await params;
    const auth = await requireAdminUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    const rateLimitResult = await assertRateLimit({
        key: getRateLimitKey(request, "admin-workshop-reject", auth.user.id),
        limit: 40,
        windowMs: 60_000,
        message: "Too many workshop rejection requests. Please wait and try again.",
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
            .update({ approval_status: "rejected" })
            .eq("id", id)
            .select("*")
            .maybeSingle();

        if (error) {
            if (isMissingApprovalStatusColumnError(error)) {
                const fallback = await serviceClient
                    .from("workshops")
                    .select("*")
                    .eq("id", id)
                    .maybeSingle();

                if (fallback.error) {
                    throw fallback.error;
                }
                if (!fallback.data) {
                    return jsonError("Workshop not found.", 404);
                }

                revalidatePath(`/admin/workshops`);
                revalidatePath(`/admin/workshops/${id}`);
                revalidatePath(`/workshops`);
                revalidatePath(`/workshops/${id}`);

                return NextResponse.json({
                    workshop: mapWorkshopRowToWorkshop(fallback.data),
                    message:
                        "Rejection status will start working after the latest database migration is applied. Until then, workshop visibility remains in testing mode.",
                });
            }
            throw error;
        }
        if (!data) {
            return jsonError("Workshop not found.", 404);
        }

        revalidatePath(`/admin/workshops`);
        revalidatePath(`/admin/workshops/${id}`);
        revalidatePath(`/workshop/${id}`);
        revalidatePath(`/workshops`);
        revalidatePath(`/workshops/${id}`);

        return NextResponse.json({
            workshop: mapWorkshopRowToWorkshop(data),
        });
    } catch (error) {
        return handleApiError("Failed to reject workshop.", error);
    }
}
